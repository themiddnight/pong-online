import { useEffect, useState, useRef } from 'react';
import {
  PlayerRole, GamePhase, WebSocketEvents, PAD_SPEED,
  ARENA_WIDTH, ARENA_HEIGHT, PAD_WIDTH, PAD_HEIGHT, BALL_SIZE
} from 'pong-shared';
import type { GameState, Vector2, PlayerInput, ActionInput, GameStateUpdate } from 'pong-shared';
import { wsClient } from '../network/WebSocketClient';

interface ArenaProps {
  roomId: string;
  role: PlayerRole;
}

export function Arena({ role }: ArenaProps) {
  const stateRef = useRef<GameState | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);

  const movementRef = useRef<'LEFT' | 'RIGHT' | 'STOP'>('STOP');
  const localPadXRef = useRef<number | null>(null);
  const [localX, setLocalX] = useState<number | null>(null);
  const [renderState, setRenderState] = useState<GameState | null>(null);

  // Professional Netcode: Sequence tracking and pending inputs
  const inputSeqRef = useRef<number>(0);
  const pendingInputsRef = useRef<Map<number, PlayerInput>>(new Map());
  const lastProcessedSeqRef = useRef<number>(0);

  // Ball display position & transition (for two-phase bounce animation)
  const [ballDisplay, setBallDisplay] = useState<{ pos: Vector2; transition: string } | null>(null);
  const bounceRafRef = useRef<number | null>(null);

  // Connection listeners
  useEffect(() => {
    const handleStateUpdate = (payload: GameStateUpdate) => {
      stateRef.current = payload.state;
      setRenderState(payload.state);

      // Professional Netcode: Server Reconciliation
      const myLastProcessed = payload.lastProcessedInput[role];
      if (myLastProcessed > lastProcessedSeqRef.current) {
        lastProcessedSeqRef.current = myLastProcessed;

        // Remove processed inputs
        for (const [seq] of pendingInputsRef.current) {
          if (seq <= myLastProcessed) {
            pendingInputsRef.current.delete(seq);
          }
        }

        // Check if prediction was correct
        const serverX = payload.state.players[role]?.position.x;
        const predictedX = localPadXRef.current;

        if (serverX !== undefined && predictedX !== null && Math.abs(serverX - predictedX) > 1) {
          // Prediction mismatch - Snap to server position
          console.warn(`[Reconciliation] Predicted=${predictedX.toFixed(2)}, Server=${serverX.toFixed(2)}, Diff=${Math.abs(serverX - predictedX).toFixed(2)}`);
          
          // Start from server position
          let correctedX = serverX;

          // Re-apply pending inputs
          const sortedInputs = Array.from(pendingInputsRef.current.entries())
            .sort((a, b) => a[0] - b[0]);
          
          for (const [_, input] of sortedInputs) {
            const dt = 1 / 60;
            let moveDir = 0;
            if (input.movement === 'LEFT') moveDir = -1;
            else if (input.movement === 'RIGHT') moveDir = 1;
            const adjustedDir = role === PlayerRole.JOINER ? -moveDir : moveDir;
            
            correctedX += PAD_SPEED * dt * adjustedDir;
            correctedX = Math.max(PAD_WIDTH / 2, Math.min(ARENA_WIDTH - PAD_WIDTH / 2, correctedX));
          }

          localPadXRef.current = correctedX;
          setLocalX(correctedX);
        }
      }

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
              transition: 'left 16ms linear, top 16ms linear',
            });
            bounceRafRef.current = null;
          });
        });
      } else {
        setBallDisplay({
          pos: ball.position,
          transition: 'left 16ms linear, top 16ms linear',
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

  // Professional Netcode: Input Loop (60fps)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (movementRef.current !== 'STOP' && stateRef.current) {
        const player = stateRef.current.players[role];
        if (player) {
          // Create input
          const input: PlayerInput = {
            sequenceNumber: ++inputSeqRef.current,
            timestamp: Date.now(),
            movement: movementRef.current
          };

          // Send to server
          wsClient.send(WebSocketEvents.PLAYER_INPUT, input);

          // Client-Side Prediction
          const currentX = localPadXRef.current !== null ? localPadXRef.current : player.position.x;
          const dt = 1 / 60;
          let moveDir = 0;
          if (input.movement === 'LEFT') moveDir = -1;
          else if (input.movement === 'RIGHT') moveDir = 1;
          const adjustedDir = role === PlayerRole.JOINER ? -moveDir : moveDir;

          let nextX = currentX + (PAD_SPEED * dt * adjustedDir);
          nextX = Math.max(PAD_WIDTH / 2, Math.min(ARENA_WIDTH - PAD_WIDTH / 2, nextX));

          localPadXRef.current = nextX;
          setLocalX(nextX);

          // Store for reconciliation
          pendingInputsRef.current.set(input.sequenceNumber, input);
        }
      } else if (localPadXRef.current !== null) {
        // Send STOP input
        const input: PlayerInput = {
          sequenceNumber: ++inputSeqRef.current,
          timestamp: Date.now(),
          movement: 'STOP'
        };
        wsClient.send(WebSocketEvents.PLAYER_INPUT, input);
        pendingInputsRef.current.set(input.sequenceNumber, input);

        // Release local control and fallback to server state
        localPadXRef.current = null;
        setLocalX(null);
      }
    }, 1000 / 60);
    return () => clearInterval(syncInterval);
  }, [role]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') movementRef.current = 'LEFT';
      if (e.key === 'ArrowRight') movementRef.current = 'RIGHT';
      if (e.code === 'Space') {
        const phase = stateRef.current?.phase;
        const action = phase === GamePhase.SERVING ? 'SERVE' : 'POWER_HIT';
        
        const input: ActionInput = {
          sequenceNumber: ++inputSeqRef.current,
          timestamp: Date.now(),
          action: action
        };
        
        wsClient.send(WebSocketEvents.ACTION_INPUT, input);
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
    const action = phase === GamePhase.SERVING ? 'SERVE' : 'POWER_HIT';
    
    const input: ActionInput = {
      sequenceNumber: ++inputSeqRef.current,
      timestamp: Date.now(),
      action: action
    };
    
    wsClient.send(WebSocketEvents.ACTION_INPUT, input);
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

  // Calculate ball position with local prediction during SERVING phase
  let ballPos = ballDisplay?.pos ?? ball.position;
  let ballTransition = ballDisplay?.transition ?? 'left 16ms linear, top 16ms linear';
  
  // If we are serving and using local pad prediction, calculate ball position locally to prevent jitter
  if (renderState.phase === GamePhase.SERVING && renderState.serverTurn === role && localX !== null && me) {
    const padYOffset = role === PlayerRole.CREATOR ? -(PAD_HEIGHT/2 + BALL_SIZE/2) : (PAD_HEIGHT/2 + BALL_SIZE/2);
    ballPos = {
      x: localX,
      y: me.position.y + padYOffset
    };
    ballTransition = 'none'; // No transition during local serving to stick perfectly
  }

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
            left: toX(getRenderX(localX !== null ? localX : me.position.x)),
            top: toY(getRenderY(me.position.y)),
            width: widthPct(PAD_WIDTH),
            height: heightPct(PAD_HEIGHT),
            transform: 'translate(-50%, -50%)',
            transition: localX !== null ? 'none' : 'left 16ms linear, top 16ms linear',
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
            transition: 'left 16ms linear, top 16ms linear',
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
