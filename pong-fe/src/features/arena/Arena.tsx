import { useEffect, useState, useRef } from 'react';
import { 
  PlayerRole, GamePhase, WebSocketEvents, 
  ARENA_WIDTH, ARENA_HEIGHT, PAD_WIDTH, PAD_HEIGHT, BALL_SIZE 
} from 'pong-shared';
import type { GameState } from 'pong-shared';
import { wsClient } from '../network/WebSocketClient';

interface ArenaProps {
  roomId: string;
  role: PlayerRole;
}

export function Arena({ role }: ArenaProps) {
  // Ref for continuous tracking for interpolation and inputs
  const stateRef = useRef<GameState | null>(null);
  const movementRef = useRef<'LEFT' | 'RIGHT' | 'STOP'>('STOP');
  
  // Interpolated rendering state (60fps)
  const [renderState, setRenderState] = useState<GameState | null>(null);

  // Connection listeners
  useEffect(() => {
    const handleStateUpdate = (payload: { state: GameState, timestamp: number }) => {
      stateRef.current = payload.state;
      // In a real sophisticated engine, we would store an array of states and lerp between timestamp - 100ms
      // For simplified 1v1 pong over reliable networks, we just snap or gently lerp the render state directly.
      setRenderState(payload.state); 
    };

    const handleGameOver = (payload: { forfeit?: boolean, loserRole: PlayerRole }) => {
      alert(payload.forfeit ? `${payload.loserRole} Disconnected! You win.` : `Game Over!`);
      window.location.reload();
    };

    wsClient.on(WebSocketEvents.GAME_STATE_UPDATE, handleStateUpdate);
    wsClient.on(WebSocketEvents.GAME_OVER, handleGameOver);

    return () => {
      wsClient.off(WebSocketEvents.GAME_STATE_UPDATE, handleStateUpdate);
      wsClient.off(WebSocketEvents.GAME_OVER, handleGameOver);
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
  const handleTouchStart = (dir: 'LEFT' | 'RIGHT') => { movementRef.current = dir; };
  const handleTouchEnd = () => { movementRef.current = 'STOP'; };
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

  // Local Orientation check: ALWAYS show `me` at the bottom (y close to ARENA_HEIGHT).
  // If my logical position is at the top (Joiner role = Y is 100), we must visually FLIP the arena vertically.
  // Rendering using 1 - Y or simple CSS rotate! 
  // CSS transform rotate(180deg) is easiest if we don't want to invert math!
  // BUT the scores would flip too. Better to invert coordinates mathematically here.
  const isInverted = role === PlayerRole.JOINER;
  const getRenderY = (y: number) => isInverted ? ARENA_HEIGHT - y : y;
  const getRenderX = (x: number) => isInverted ? ARENA_WIDTH - x : x; // Also flip X so left/right remain intuitive on screen

  return (
    <div className="w-full h-full relative overflow-hidden bg-black pixel-art select-none">
      
      {/* Background Center Line */}
      <div className="absolute w-full h-1 bg-white/20 top-1/2 -translate-y-1/2 pointer-events-none"></div>

      {/* Scores */}
      <div className="absolute top-[30%] left-1/2 -translate-x-1/2 text-[15vmax] opacity-20 text-white pointer-events-none font-sans">
        {op?.score || 0}
      </div>
      <div className="absolute top-[60%] left-1/2 -translate-x-1/2 text-[15vmax] opacity-20 text-white pointer-events-none font-sans">
        {me?.score || 0}
      </div>

      {/* Pads */}
      {me && (
        <div 
          className="absolute bg-white"
          style={{
            left: toX(getRenderX(me.position.x)),
            top: toY(getRenderY(me.position.y)),
            width: widthPct(PAD_WIDTH),
            height: heightPct(PAD_HEIGHT),
            transform: 'translate(-50%, -50%)',
            transition: 'left 33ms linear, top 33ms linear'
          }}
        />
      )}
      {op && (
        <div 
          className="absolute bg-white"
          style={{
            left: toX(getRenderX(op.position.x)),
            top: toY(getRenderY(op.position.y)),
            width: widthPct(PAD_WIDTH),
            height: heightPct(PAD_HEIGHT),
            transform: 'translate(-50%, -50%)',
            transition: 'left 33ms linear, top 33ms linear'
          }}
        />
      )}

      {/* Ball */}
      <div 
        className={`absolute bg-white ${ball.isPowerHitActive ? 'shadow-[0_0_20px_10px_rgba(255,255,255,0.8)] bg-yellow-200' : ''}`}
        style={{
          left: toX(getRenderX(ball.position.x)),
          top: toY(getRenderY(ball.position.y)),
          width: widthPct(BALL_SIZE),
          height: heightPct(BALL_SIZE),
          transform: 'translate(-50%, -50%)',
          transition: 'left 33ms linear, top 33ms linear'
        }}
      />

      {/* Overlays / States */}
      {renderState.phase === GamePhase.WAITING_FOR_OPPONENT && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <p className="text-3xl animate-pulse text-white">Waiting for opponent...</p>
        </div>
      )}
      {renderState.phase === GamePhase.PAUSED_DISCONNECT && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-center">
          <p className="text-3xl animate-pulse text-red-500 max-w-sm">Opponent Disconnected. Grace Period 60s...</p>
        </div>
      )}

      {/* Mobile Controls */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between z-20 md:hidden opacity-50 space-x-2">
        <button 
          className="flex-1 bg-white/20 border border-white py-8 text-2xl active:bg-white/50 touch-manipulation"
          onTouchStart={() => handleTouchStart('LEFT')}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart('LEFT')}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
        >
          &lt;
        </button>
        <button 
          className="flex-1 bg-white/20 border border-white py-8 text-2xl active:bg-white/50 touch-manipulation"
          onTouchStart={handleAction}
          onMouseDown={handleAction}
        >
          ACT
        </button>
        <button 
          className="flex-1 bg-white/20 border border-white py-8 text-2xl active:bg-white/50 touch-manipulation"
          onTouchStart={() => handleTouchStart('RIGHT')}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => handleTouchStart('RIGHT')}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
        >
          &gt;
        </button>
      </div>
      
    </div>
  );
}
