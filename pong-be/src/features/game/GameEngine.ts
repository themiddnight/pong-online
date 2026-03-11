import { Room } from '../matchmaking/Room';
import { 
  GamePhase, PlayerRole, WebSocketEvents, TICK_RATE, 
  ARENA_WIDTH, ARENA_HEIGHT, PAD_WIDTH, PAD_HEIGHT, PAD_OFFSET_Y, 
  BALL_SIZE, BALL_SPEED_START, POWER_HIT_DISTANCE_THRESHOLD, POWER_HIT_MULTIPLIER
} from 'pong-shared';
import type { Vector2 } from 'pong-shared';

export class GameEngine {
  private lastTickTime: number = Date.now();
  private baseBallSpeed: number = BALL_SPEED_START;
  
  constructor(private room: Room) {}

  public start() {
    if (this.room.tickInterval) return;
    this.lastTickTime = Date.now();
    this.room.tickInterval = setInterval(() => this.tick(), TICK_RATE);
  }

  public stop() {
    if (this.room.tickInterval) {
      clearInterval(this.room.tickInterval);
      this.room.tickInterval = null;
    }
  }

  public handlePadMove(role: PlayerRole, data: { direction: 'LEFT' | 'RIGHT' | 'STOP' | 'SYNC', x?: number }) {
    const player = this.room.state.players[role];
    if (!player || this.room.state.phase !== GamePhase.PLAYING && this.room.state.phase !== GamePhase.SERVING) return;
    
    // Simple direct continuous sync from client for responsive feeling (trusting client for now in 1v1 simple pong)
    if (data.direction === 'SYNC' && data.x !== undefined) {
      // Clamp to arena
      player.position.x = Math.max(PAD_WIDTH / 2, Math.min(ARENA_WIDTH - PAD_WIDTH / 2, data.x));
    }
  }

  public handleServeAction(role: PlayerRole) {
    const { state } = this.room;
    
    if (state.phase === GamePhase.SERVING && state.serverTurn === role) {
      state.phase = GamePhase.PLAYING;
      
      // Serve trajectory towards opponent
      const isCreatorServing = role === PlayerRole.CREATOR;
      // Creator is at bottom (high Y), Joiner is at top (low Y). So creator serves up (-Y).
      const directionY = isCreatorServing ? -1 : 1; 
      
      // Initial speed is always base speed on serve. No Power Hit allowed on serve.
      state.ball.isPowerHitActive = false;
      state.ball.velocity = { x: 0, y: directionY * this.baseBallSpeed };
    }
  }

  public handlePowerHitAction(role: PlayerRole) {
    const { state } = this.room;
    if (state.phase === GamePhase.PLAYING) {
      // Validate power hit during play
      const player = state.players[role];
      if (!player) return;

      const ball = state.ball;
      
      // Check distance Y to see if power hit timings match
      // Creator pad is at `ARENA_HEIGHT - PAD_OFFSET_Y`.
      // Joiner pad is at `PAD_OFFSET_Y`.
      const padY = role === PlayerRole.CREATOR ? ARENA_HEIGHT - PAD_OFFSET_Y : PAD_OFFSET_Y;
      const distanceY = Math.abs(ball.position.y - padY);
      
      // Verify ball is approaching them
      const isApproaching = role === PlayerRole.CREATOR ? ball.velocity.y > 0 : ball.velocity.y < 0;

      if (isApproaching && distanceY <= POWER_HIT_DISTANCE_THRESHOLD) {
        // Tag ball for next impact
        ball.isPowerHitActive = true;
      }
    }
  }

  private tick() {
    const now = Date.now();
    const dt = (now - this.lastTickTime) / 1000; // Delta time in seconds
    this.lastTickTime = now;

    const state = this.room.state;

    // Only update physics if actively playing
    if (state.phase === GamePhase.PLAYING) {
      this.updatePhysics(dt);
    } else if (state.phase === GamePhase.SERVING) {
      // Ball sticks to the server's pad
      const serverPlayer = state.players[state.serverTurn];
      if (serverPlayer) {
        const padYOffset = state.serverTurn === PlayerRole.CREATOR ? -(PAD_HEIGHT/2 + BALL_SIZE/2) : (PAD_HEIGHT/2 + BALL_SIZE/2);
        state.ball.position = {
          x: serverPlayer.position.x,
          y: serverPlayer.position.y + padYOffset
        };
      }
    }

    // Broadcast state to players
    this.room.broadcast({
      event: WebSocketEvents.GAME_STATE_UPDATE,
      data: {
        state: state,
        timestamp: now
      }
    });
  }

  private updatePhysics(dt: number) {
    const ball = this.room.state.ball;
    const players = this.room.state.players;
    
    // Move ball
    ball.position.x += ball.velocity.x * dt;
    ball.position.y += ball.velocity.y * dt;

    // Wall bounce (Left and Right)
    if (ball.position.x - BALL_SIZE / 2 <= 0) {
      ball.position.x = BALL_SIZE / 2;
      ball.velocity.x *= -1;
    } else if (ball.position.x + BALL_SIZE / 2 >= ARENA_WIDTH) {
      ball.position.x = ARENA_WIDTH - BALL_SIZE / 2;
      ball.velocity.x *= -1;
    }

    // Pad collision variables
    const creator = players[PlayerRole.CREATOR];
    const joiner = players[PlayerRole.JOINER];
    if (!creator || !joiner) return;

    // Check collision with Creator (Bottom pad)
    if (ball.velocity.y > 0 && this.checkPadCollision(ball.position, creator.position)) {
      this.resolvePadBounce(creator, -1);
    }
    // Check collision with Joiner (Top pad)
    else if (ball.velocity.y < 0 && this.checkPadCollision(ball.position, joiner.position)) {
      this.resolvePadBounce(joiner, 1);
    }

    // Check Out of bounds (Scoring)
    if (ball.position.y > ARENA_HEIGHT) {
      // Joiner scores! (Creator missed)
      this.scorePoint(PlayerRole.JOINER, PlayerRole.CREATOR);
    } else if (ball.position.y < 0) {
      // Creator scores! (Joiner missed)
      this.scorePoint(PlayerRole.CREATOR, PlayerRole.JOINER);
    }
  }

  private checkPadCollision(ballPos: Vector2, padPos: Vector2): boolean {
    const halfPadW = PAD_WIDTH / 2;
    const halfPadH = PAD_HEIGHT / 2;
    const halfBall = BALL_SIZE / 2;

    return (
      ballPos.x + halfBall >= padPos.x - halfPadW &&
      ballPos.x - halfBall <= padPos.x + halfPadW &&
      ballPos.y + halfBall >= padPos.y - halfPadH &&
      ballPos.y - halfBall <= padPos.y + halfPadH
    );
  }

  private resolvePadBounce(player: any, dirY: number) {
    const ball = this.room.state.ball;
    
    // Arkanoid style reflection: dependent on where the ball hits the pad
    const hitOffset = ball.position.x - player.position.x; // Range roughly: -PAD_WIDTH/2 to +PAD_WIDTH/2
    const normalizedIntersect = hitOffset / (PAD_WIDTH / 2); // -1.0 to 1.0

    // Constrain to -45 to +45 degrees normally => Math.PI / 4
    let bounceAngle = normalizedIntersect * (Math.PI / 4);

    let currentSpeed = this.baseBallSpeed;

    if (ball.isPowerHitActive) {
      currentSpeed *= POWER_HIT_MULTIPLIER;
      // Power hit halves the angle => makes it more direct
      bounceAngle /= 2;
    }

    // If ball hits creator (bottom pad, dirY = -1), Y velocity goes up. Thus angle 0 = straight up (-Y).
    // Math: Vx = speed * Math.sin(angle), Vy = speed * -Math.cos(angle) * dirY (if dirY=1 went up, wait dirY=-1 means bounce up)
    
    // Let's standardise: 
    // dirY = -1 means it bounces UP (Velocity negative Y)
    // dirY = 1 means it bounces DOWN (Velocity positive Y)
    ball.velocity.x = currentSpeed * Math.sin(bounceAngle);
    ball.velocity.y = currentSpeed * Math.cos(bounceAngle) * dirY;

    // Reset power hit flag for next hit (opponent has to react and press again to keep speed)
    // Once it bounces off pad, it runs at speed 1x or 2x, but next hit won't default to 2x.
    // Wait, requirement: "Speed x2 only lasts until opponent hits it. If opponent hits normally, it goes back to x1."
    // So by clearing isPowerHitActive here, the *current velocity* remains high, but upon NEXT bounce, if opponent didn't press power hit, `isPowerHitActive` will be false, and speed returns to 1x.
    ball.isPowerHitActive = false;

    // Nudge ball out of pad to prevent sticking
    const halfPadH = PAD_HEIGHT / 2;
    const halfBall = BALL_SIZE / 2;
    ball.position.y = player.position.y + (dirY * (halfPadH + halfBall + 1));
  }

  private scorePoint(winnerRole: PlayerRole, loserRole: PlayerRole) {
    const winner = this.room.state.players[winnerRole];
    if (winner) winner.score += 1;

    // Loser gets to serve next
    this.room.state.serverTurn = loserRole;
    this.room.state.phase = GamePhase.SERVING;
    this.room.state.ball.isPowerHitActive = false;
    this.room.state.ball.velocity = { x: 0, y: 0 };
    
    // Place ball securely back to center horizontally to await serve
    this.room.state.ball.position.x = ARENA_WIDTH / 2;
  }
}
