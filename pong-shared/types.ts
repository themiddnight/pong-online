import { WebSocketEvents } from './constants';

export interface Vector2 {
  x: number;
  y: number;
}

export enum PlayerRole {
  CREATOR = 'CREATOR',
  JOINER = 'JOINER',
}

export interface PlayerState {
  id: string; // Socket ID or specific UUID
  role: PlayerRole;
  score: number;
  position: Vector2; // Top-left or center of the pad
  isDisconnected: boolean;
  disconnectTime?: number;
}

export interface BallState {
  position: Vector2;
  velocity: Vector2;
  isPowerHitActive: boolean;
}

export enum GamePhase {
  WAITING_FOR_OPPONENT = 'WAITING_FOR_OPPONENT',
  SERVING = 'SERVING',
  PLAYING = 'PLAYING',
  PAUSED_DISCONNECT = 'PAUSED_DISCONNECT',
  GAME_OVER = 'GAME_OVER',
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Record<PlayerRole, PlayerState | null>;
  ball: BallState;
  serverTurn: PlayerRole; // Who should serve next
}

// WebSocket Payload Types
export interface BasePayload {
  event: WebSocketEvents;
  data?: any;
}

// Client -> Server
export interface JoinRoomPayload extends BasePayload {
  event: WebSocketEvents.JOIN_ROOM;
  data: { roomId: string };
}
export interface PadMovePayload extends BasePayload {
  event: WebSocketEvents.PAD_MOVE;
  data: { direction: 'LEFT' | 'RIGHT' | 'STOP' | 'SYNC', x?: number }; // Either discrete or continuous sync
}
export interface ActionServePayload extends BasePayload {
  event: WebSocketEvents.ACTION_SERVE;
  data?: never;
}
export interface ActionPowerHitPayload extends BasePayload {
  event: WebSocketEvents.ACTION_POWER_HIT;
  data?: never;
}

// Server -> Client
export interface RoomCreatedPayload extends BasePayload {
  event: WebSocketEvents.ROOM_CREATED;
  data: { roomId: string; role: PlayerRole };
}
export interface RoomJoinedPayload extends BasePayload {
  event: WebSocketEvents.ROOM_JOINED;
  data: { roomId: string; role: PlayerRole };
}
export interface GameStateUpdatePayload extends BasePayload {
  event: WebSocketEvents.GAME_STATE_UPDATE;
  data: { state: GameState; timestamp: number };
}
