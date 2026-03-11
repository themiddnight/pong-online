import { WebSocket } from 'ws';
import { GamePhase, PlayerRole, WebSocketEvents } from 'pong-shared';
import type { GameState, BasePayload, JoinRoomPayload, RoomCreatedPayload, RoomJoinedPayload } from 'pong-shared';
import { GameEngine } from '../game/GameEngine';

export class Room {
  public id: string;
  public state: GameState;
  public clients: Map<PlayerRole, WebSocket>;
  public lastActive: Map<PlayerRole, number>;
  public tickInterval: ReturnType<typeof setInterval> | null = null;
  public disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  public gameEngine: GameEngine;

  constructor(id: string) {
    this.id = id;
    this.clients = new Map();
    this.lastActive = new Map();
    this.gameEngine = new GameEngine(this);
    
    // Initial basic state
    this.state = {
      roomId: id,
      phase: GamePhase.WAITING_FOR_OPPONENT,
      players: {
        [PlayerRole.CREATOR]: null,
        [PlayerRole.JOINER]: null,
      },
      ball: {
        position: { x: 500, y: 750 },
        velocity: { x: 0, y: 0 },
        isPowerHitActive: false,
      },
      serverTurn: PlayerRole.CREATOR,
    };
  }

  public addClient(role: PlayerRole, socket: WebSocket, specificId: string) {
    this.clients.set(role, socket);
    this.lastActive.set(role, Date.now());

    this.state.players[role] = {
      id: specificId,
      role: role,
      score: 0,
      position: { x: 500, y: role === PlayerRole.CREATOR ? 1400 : 100 }, // Initial dummy positions
      isDisconnected: false,
    };

    if (this.clients.has(PlayerRole.CREATOR) && this.clients.has(PlayerRole.JOINER)) {
      if (this.state.phase === GamePhase.WAITING_FOR_OPPONENT) {
        this.state.phase = GamePhase.SERVING;
        this.broadcast({
          event: WebSocketEvents.OPPONENT_JOINED,
          data: {}
        });
        
        // Start game logic loop once full
        this.gameEngine.start();
      }
    }
  }

  public getRoleBySocket(socket: WebSocket): PlayerRole | undefined {
    for (const [role, client] of this.clients.entries()) {
      if (client === socket) return role;
    }
    return undefined;
  }

  public broadcast(payload: BasePayload) {
    const message = JSON.stringify(payload);
    for (const client of this.clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public sendTo(role: PlayerRole, payload: BasePayload) {
    const client = this.clients.get(role);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }
}
