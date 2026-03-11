export const GAME_FPS = 30;
export const INTERPOLATION_FPS = 60;
export const TICK_RATE = 1000 / GAME_FPS;

// Logical Coordinate System (Virtual resolution)
export const ARENA_WIDTH = 1000;
export const ARENA_HEIGHT = 1500;

export const PAD_WIDTH = 200;
export const PAD_HEIGHT = 40;
export const PAD_OFFSET_Y = 100; // Distance from top/bottom edge

export const BALL_SIZE = 30;
export const BALL_SPEED_START = 800; // units per second
export const POWER_HIT_MULTIPLIER = 2.0;

// Maximum distance from pad to consider a valid power hit (in logical units)
export const POWER_HIT_DISTANCE_THRESHOLD = 100;
// Maximum time threshold could be used instead, but distance is chosen for simplicity here.

export const DISCONNECT_GRACE_PERIOD_MS = 60000;

export enum WebSocketEvents {
  // Client -> Server
  JOIN_ROOM = 'JOIN_ROOM',
  CREATE_ROOM = 'CREATE_ROOM',
  PAD_MOVE = 'PAD_MOVE',
  ACTION_SERVE = 'ACTION_SERVE',
  ACTION_POWER_HIT = 'ACTION_POWER_HIT',

  // Server -> Client
  ROOM_CREATED = 'ROOM_CREATED',
  ROOM_JOINED = 'ROOM_JOINED',
  ROOM_ERROR = 'ROOM_ERROR',
  OPPONENT_JOINED = 'OPPONENT_JOINED',
  GAME_START = 'GAME_START',
  GAME_STATE_UPDATE = 'GAME_STATE_UPDATE',
  PLAYER_DISCONNECTED = 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED = 'PLAYER_RECONNECTED',
  GAME_OVER = 'GAME_OVER'
}
