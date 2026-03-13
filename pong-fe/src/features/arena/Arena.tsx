import { useEffect, useState, useRef } from 'react';
import {
  PlayerRole, GamePhase, WebSocketEvents,
  ARENA_WIDTH, ARENA_HEIGHT, PAD_WIDTH, PAD_HEIGHT, BALL_SIZE
} from 'pong-shared';
import type { GameState, Vector2 } from 'pong-shared';
import { wsClient } from '../network/WebSocketClient';

interface ArenaProps {
  roomId: string;
  role: PlayerRole;
}

export function Arena({ role }: ArenaProps) {
  const stateRef = useRef<GameState | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);

  const movementRef = useRef<'LEFT' | 'RIGHT' | 'STOP'>('STOP');
  const [renderState, setRenderState] = useState<GameState | null>(null);

  // Ball display position & transition (for two-phase bounce animation)
  const [ballDisplay, setBallDisplay] = useState<{ pos: Vector2; transition: string } | null>(null);
  const bounceRafRef = useRef<number | null>(null);

  // Connection listeners
  useEffect(() => {
    const handleStateUpdate = (payload: { state: GameState; timestamp: number }) => {
      stateRef.current = payload.state;
      setRenderState(payload.state);

      const ball = payload.state.ball;
      if (ball.bounceContact) {
        // Two-phase bounce animation:
        // Phase 1: Snap ball to contact point instantly (no transition)
        if (bounceRafRef.current) cancelAnimationFrame(bounceRafRef.current);
        setBallDisplay({ pos: ball.bounceContact, transition: 'none' });

        // Phase 2: After browser paints contact frame, transition to actual position
        bounceRafRef.current = requestAnimationFrame(() => {
          bounceRafRef.current = requestAnimationFrame(() => {
            setBallDisplay({
              pos: ball.position,
              transition: 'left 33ms linear, top 33ms linear',
            });
            bounceRafRef.current = null;
          });
        });
      } else {
        setBallDisplay({
          pos: ball.position,
          transition: 'left 33ms linear, top 33ms linear',
        });
      }
    };

    const handleGameOver = (payload: { forfeit?: boolean; loserRole: PlayerRole }) => {
      alert(payload.forfeit ? `${payload.loserRole} Disconnected! You win.` : `Game Over!`);
      window.location.reload();
    };

    wsClient.on(WebSocketEvents.GAME_STATE_UPDATE, handleStateUpdate);
    wsClient.on(WebSocketEvents.GAME_OVER, handleGameOver);

    return () => {
      wsClient.off(WebSocketEvents.GAME_STATE_UPDATE, handleStateUpdate);
      wsClient.off(WebSocketEvents.GAME_OVER, handleGameOver);
      if (bounceRafRef.current) cancelAnimationFrame(bounceRafRef.current);
    };
  }, []);

  // Sync Input Loop (Independent 30fps sync to server)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (movementRef.current !== 'STOP' && stateRef.current) {
        // Calculate optimistic local x
        const player = stateRef.current.players[role];
        if (player) {
          const speed = 600; // units per sec
          const dt = 1 / 30; // 30 ticks per sec

          let moveDir = 0;
          if (movementRef.current === 'RIGHT') moveDir = 1;
          else if (movementRef.current === 'LEFT') moveDir = -1;

          // If we are JOINER our screen is inverted (left is logical right), so reverse input math
          const adjustedDir = role === PlayerRole.JOINER ? -moveDir : moveDir;

          let nextX = player.position.x + (speed * dt * adjustedDir);
          nextX = Math.max(PAD_WIDTH / 2, Math.min(ARENA_WIDTH - PAD_WIDTH / 2, nextX));

          wsClient.send(WebSocketEvents.PAD_MOVE, { direction: 'SYNC', x: nextX });
        }
      }
    }, 1000 / 30);
    return () => clearInterval(syncInterval);
  }, [role]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') movementRef.current = 'LEFT';
      if (e.key === 'ArrowRight') movementRef.current = 'RIGHT';
      if (e.code === 'Space') {
        const phase = stateRef.current?.phase;
        if (phase === GamePhase.SERVING) {
          wsClient.send(WebSocketEvents.ACTION_SERVE);
        } else if (phase === GamePhase.PLAYING) {
          wsClient.send(WebSocketEvents.ACTION_POWER_HIT);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && movementRef.current === 'LEFT') movementRef.current = 'STOP';
      if (e.key === 'ArrowRight' && movementRef.current === 'RIGHT') movementRef.current = 'STOP';
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mobile Handlers
  const handleMobileMoveStart = (dir: 'LEFT' | 'RIGHT') => { movementRef.current = dir; };
  const handleMobileMoveEnd = () => { movementRef.current = 'STOP'; };
  const handleAction = () => {
    const phase = stateRef.current?.phase;
    if (phase === GamePhase.SERVING) {
      wsClient.send(WebSocketEvents.ACTION_SERVE);
    } else if (phase === GamePhase.PLAYING) {
      wsClient.send(WebSocketEvents.ACTION_POWER_HIT);
    }
  };

  if (!renderState) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-3xl animate-pulse">Loading Arena...</p>
      </div>
    );
  }

  // Utility to convert logical units to CSS percentages
  const toX = (val: number) => `${(val / ARENA_WIDTH) * 100}%`;
  const toY = (val: number) => `${(val / ARENA_HEIGHT) * 100}%`;
  const widthPct = (w: number) => `${(w / ARENA_WIDTH) * 100}%`;
  const heightPct = (h: number) => `${(h / ARENA_HEIGHT) * 100}%`;

  const opponentRole = role === PlayerRole.CREATOR ? PlayerRole.JOINER : PlayerRole.CREATOR;
  const me = renderState.players[role];
  const op = renderState.players[opponentRole];
  const ball = renderState.ball;

  const isInverted = role === PlayerRole.JOINER;
  const getRenderY = (y: number) => isInverted ? ARENA_HEIGHT - y : y;
  const getRenderX = (x: number) => isInverted ? ARENA_WIDTH - x : x;

  // Use ballDisplay for ball rendering (handles bounce animation), fallback to ball.position
  const ballPos = ballDisplay?.pos ?? ball.position;
  const ballTransition = ballDisplay?.transition ?? 'left 33ms linear, top 33ms linear';

  return (
    <>
      <div
        ref={arenaRef}
        className="w-full relative overflow-hidden bg-black pixel-art select-none cursor-none"
        style={{ touchAction: 'none', flex: 6 }}
      >

      {/* Background Center Line */}
      <div className="absolute w-full h-1 bg-white/20 top-1/2 -translate-y-1/2 pointer-events-none"></div>

      {/* Scores */}
      <div className="absolute top-[25%] inset-x-0 -translate-y-1/2 text-center text-[15vmax] opacity-20 text-white pointer-events-none font-sans leading-none">
        {op?.score || 0}
      </div>
      <div className="absolute top-[75%] inset-x-0 -translate-y-1/2 text-center text-[15vmax] opacity-20 text-white pointer-events-none font-sans leading-none">
        {me?.score || 0}
      </div>

      {/* Pads */}
      {me && (
        <div
          className="absolute bg-white pointer-events-none"
          style={{
            left: toX(getRenderX(me.position.x)),
            top: toY(getRenderY(me.position.y)),
            width: widthPct(PAD_WIDTH),
            height: heightPct(PAD_HEIGHT),
            transform: 'translate(-50%, -50%)',
            transition: 'left 33ms linear, top 33ms linear',
          }}
        />
      )}
      {op && (
        <div
          className="absolute bg-white pointer-events-none"
          style={{
            left: toX(getRenderX(op.position.x)),
            top: toY(getRenderY(op.position.y)),
            width: widthPct(PAD_WIDTH),
            height: heightPct(PAD_HEIGHT),
            transform: 'translate(-50%, -50%)',
            transition: 'left 33ms linear, top 33ms linear',
          }}
        />
      )}

      {/* Ball */}
      <div
        className={`absolute bg-white pointer-events-none ${ball.isPowerHitActive ? 'shadow-[0_0_20px_10px_rgba(255,255,255,0.8)] bg-yellow-200' : ''}`}
        style={{
          left: toX(getRenderX(ballPos.x)),
          top: toY(getRenderY(ballPos.y)),
          width: widthPct(BALL_SIZE),
          height: heightPct(BALL_SIZE),
          transform: 'translate(-50%, -50%)',
          transition: ballTransition,
        }}
      />

      {/* Overlays / States */}
      {renderState.phase === GamePhase.WAITING_FOR_OPPONENT && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-none">
          <p className="text-3xl animate-pulse text-white">Waiting for opponent...</p>
        </div>
      )}
      {renderState.phase === GamePhase.PAUSED_DISCONNECT && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-center pointer-events-none">
          <p className="text-3xl animate-pulse text-red-500 max-w-sm">Opponent Disconnected. Grace Period 60s...</p>
        </div>
      )}

      {/* Serving indicator */}
      {renderState.phase === GamePhase.SERVING && renderState.serverTurn === role && (
        <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 pointer-events-none">
          <p className="text-lg text-white/60 animate-pulse text-center">Press Space / Action to Serve</p>
        </div>
      )}

    </div>
    
      {/* Mobile Virtual Buttons */}
      <div 
        className="w-full p-2 flex justify-between gap-2 z-30 pointer-events-auto md:hidden bg-black border-t-4 border-white"
        style={{ flex: 1 }}
      >
        <button
          className="flex-1 h-full bg-white/20 border-2 border-white rounded-lg text-4xl text-white active:bg-white/50 touch-manipulation select-none transition-colors"
          onTouchStart={() => handleMobileMoveStart('LEFT')}
          onTouchEnd={handleMobileMoveEnd}
          onContextMenu={e => e.preventDefault()}
        >
          &lt;
        </button>
        <button
          className="flex-1 h-full bg-white/20 border-2 border-white rounded-lg text-3xl text-white active:bg-white/50 touch-manipulation select-none font-bold transition-colors"
          onTouchStart={handleAction}
          onContextMenu={e => e.preventDefault()}
        >
          ACT
        </button>
        <button
          className="flex-1 h-full bg-white/20 border-2 border-white rounded-lg text-4xl text-white active:bg-white/50 touch-manipulation select-none transition-colors"
          onTouchStart={() => handleMobileMoveStart('RIGHT')}
          onTouchEnd={handleMobileMoveEnd}
          onContextMenu={e => e.preventDefault()}
        >
          &gt;
        </button>
      </div>

    </>
  );
}
