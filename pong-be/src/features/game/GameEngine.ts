import { Room } from '../matchmaking/Room';
import { 
  GamePhase, PlayerRole, WebSocketEvents, TICK_RATE, 
  ARENA_WIDTH, ARENA_HEIGHT, PAD_WIDTH, PAD_HEIGHT, PAD_OFFSET_Y, 
  BALL_SIZE, BALL_SPEED_START, POWER_HIT_DISTANCE_THRESHOLD, POWER_HIT_MULTIPLIER,
  BOUNCE_BLEND_FACTOR
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

    // Clear previous tick's bounce contact
    state.ball.bounceContact = null;

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
    const creator = players[PlayerRole.CREATOR];
    const joiner = players[PlayerRole.JOINER];
    if (!creator || !joiner) return;

    const halfBall = BALL_SIZE / 2;
    const halfPadH = PAD_HEIGHT / 2;
    const halfPadW = PAD_WIDTH / 2;

    // --- Continuous Collision Detection (CCD) for Pad ---
    // Instead of moving first then checking overlap, calculate exact time
    // the ball edge reaches the pad face within this tick.
    const startX = ball.position.x;
    const startY = ball.position.y;

    let collisionT: number | null = null;
    let collidedPlayer: typeof creator | null = null;
    let bounceDir = 0;

    if (ball.velocity.y > 0) {
      // Ball moving DOWN → may hit Creator pad (bottom)
      const padFaceY = creator.position.y - halfPadH; // top face of pad
      const ballEdgeY = startY + halfBall;
      const distToFace = padFaceY - ballEdgeY;

      if (distToFace >= 0) {
        const t = distToFace / ball.velocity.y;
        if (t >= 0 && t <= dt) {
          // Check X alignment at the moment of collision
          const ballXAtT = startX + ball.velocity.x * t;
          if (
            ballXAtT + halfBall >= creator.position.x - halfPadW &&
            ballXAtT - halfBall <= creator.position.x + halfPadW
          ) {
            collisionT = t;
            collidedPlayer = creator;
            bounceDir = -1; // bounce UP
          }
        }
      }
    } else if (ball.velocity.y < 0) {
      // Ball moving UP → may hit Joiner pad (top)
      const padFaceY = joiner.position.y + halfPadH; // bottom face of pad
      const ballEdgeY = startY - halfBall;
      const distToFace = ballEdgeY - padFaceY;

      if (distToFace >= 0) {
        const t = distToFace / Math.abs(ball.velocity.y);
        if (t >= 0 && t <= dt) {
          const ballXAtT = startX + ball.velocity.x * t;
          if (
            ballXAtT + halfBall >= joiner.position.x - halfPadW &&
            ballXAtT - halfBall <= joiner.position.x + halfPadW
          ) {
            collisionT = t;
            collidedPlayer = joiner;
            bounceDir = 1; // bounce DOWN
          }
        }
      }
    }

    if (collisionT !== null && collidedPlayer) {
      // Move ball to exact collision point
      ball.position.x = startX + ball.velocity.x * collisionT;
      ball.position.y = startY + ball.velocity.y * collisionT;

      // Record contact point for frontend animation
      ball.bounceContact = { x: ball.position.x, y: ball.position.y };

      // Resolve bounce (computes new velocity only)
      this.resolvePadBounce(collidedPlayer, bounceDir);

      // Move ball for remaining time with new (bounced) velocity
      const remainingDt = dt - collisionT;
      ball.position.x += ball.velocity.x * remainingDt;
      ball.position.y += ball.velocity.y * remainingDt;
    } else {
      // No pad collision — move ball normally
      ball.position.x += ball.velocity.x * dt;
      ball.position.y += ball.velocity.y * dt;
    }

    // Wall bounce (Left and Right) — discrete is acceptable here
    if (ball.position.x - halfBall <= 0) {
      ball.position.x = halfBall;
      ball.velocity.x *= -1;
    } else if (ball.position.x + halfBall >= ARENA_WIDTH) {
      ball.position.x = ARENA_WIDTH - halfBall;
      ball.velocity.x *= -1;
    }

    // Check Out of bounds (Scoring)
    if (ball.position.y > ARENA_HEIGHT) {
      this.scorePoint(PlayerRole.JOINER, PlayerRole.CREATOR);
    } else if (ball.position.y < 0) {
      this.scorePoint(PlayerRole.CREATOR, PlayerRole.JOINER);
    }
  }

  private resolvePadBounce(player: { position: Vector2 }, dirY: number) {
    const ball = this.room.state.ball;

    // --- Physics reflection angle (angle of incidence = angle of reflection) ---
    // Compute incoming angle relative to pad normal (vertical axis)
    // atan2 gives the angle of the velocity vector; we want the angle from the Y axis
    const incomingAngle = Math.atan2(ball.velocity.x, Math.abs(ball.velocity.y));
    // Physics reflection simply mirrors around the normal → same angle, opposite Y direction
    const physicsAngle = incomingAngle;

    // --- Arkanoid pad-position angle ---
    const hitOffset = ball.position.x - player.position.x;
    const normalizedIntersect = hitOffset / (PAD_WIDTH / 2); // -1.0 to 1.0
    const padAngle = normalizedIntersect * ((Math.PI * 75) / 180); // -75° to +75°

    // --- Blend both angles ---
    let bounceAngle = physicsAngle * (1 - BOUNCE_BLEND_FACTOR) + padAngle * BOUNCE_BLEND_FACTOR;

    let currentSpeed = this.baseBallSpeed;

    if (ball.isPowerHitActive) {
      currentSpeed *= POWER_HIT_MULTIPLIER;
      bounceAngle /= 2; // Power hit narrows angle
    }

    // Clamp final angle to prevent extreme horizontal shots
    const maxAngle = (Math.PI * 75) / 180; // ±75°
    bounceAngle = Math.max(-maxAngle, Math.min(maxAngle, bounceAngle));

    // dirY = -1 → bounce UP, dirY = 1 → bounce DOWN
    ball.velocity.x = currentSpeed * Math.sin(bounceAngle);
    ball.velocity.y = currentSpeed * Math.cos(bounceAngle) * dirY;
    ball.isPowerHitActive = false;

    // No positional nudge needed — CCD places ball at exact collision point,
    // and remaining dt movement with new velocity moves it away naturally.
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
