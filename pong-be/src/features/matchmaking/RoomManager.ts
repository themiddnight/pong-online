import { Room } from './Room';
import { PlayerRole, WebSocketEvents, DISCONNECT_GRACE_PERIOD_MS, GamePhase } from 'pong-shared';
import type { RoomCreatedPayload, RoomJoinedPayload } from 'pong-shared';
import { WebSocket } from 'ws';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketRoomMap: Map<WebSocket, Room> = new Map();

  public createRoom(socket: WebSocket): string {
    const roomId = crypto.randomUUID();
    const room = new Room(roomId);
    
    // Add creator to room
    room.addClient(PlayerRole.CREATOR, socket, crypto.randomUUID());
    
    this.rooms.set(roomId, room);
    this.socketRoomMap.set(socket, room);
    
    const payload: RoomCreatedPayload = {
      event: WebSocketEvents.ROOM_CREATED,
      data: { roomId, role: PlayerRole.CREATOR }
    };
    socket.send(JSON.stringify(payload));

    return roomId;
  }

  public joinRoom(socket: WebSocket, roomId: string) {
    const room = this.rooms.get(roomId);
    
    if (!room) {
      socket.send(JSON.stringify({
        event: WebSocketEvents.ROOM_ERROR,
        data: { message: "Room not found" }
      }));
      return;
    }

    if (room.clients.has(PlayerRole.JOINER)) {
      const joinerState = room.state.players[PlayerRole.JOINER];
      // Check if trying to reconnect as joiner
      if (joinerState?.isDisconnected) {
        this.reconnectPlayer(socket, room, PlayerRole.JOINER);
        return;
      }
      
      const creatorState = room.state.players[PlayerRole.CREATOR];
      if (creatorState?.isDisconnected) {
        this.reconnectPlayer(socket, room, PlayerRole.CREATOR);
        return;
      }

      socket.send(JSON.stringify({
        event: WebSocketEvents.ROOM_ERROR,
        data: { message: "Room is full" }
      }));
      return;
    }

    // Determine if joining fresh
    const role = PlayerRole.JOINER;
    room.addClient(role, socket, crypto.randomUUID());
    this.socketRoomMap.set(socket, room);

    const payload: RoomJoinedPayload = {
      event: WebSocketEvents.ROOM_JOINED,
      data: { roomId, role }
    };
    socket.send(JSON.stringify(payload));
  }

  private reconnectPlayer(socket: WebSocket, room: Room, role: PlayerRole) {
    room.clients.set(role, socket);
    this.socketRoomMap.set(socket, room);
    
    const playerState = room.state.players[role];
    if (playerState) {
      playerState.isDisconnected = false;
      playerState.disconnectTime = undefined;
    }

    if (room.disconnectTimeout) {
      clearTimeout(room.disconnectTimeout);
      room.disconnectTimeout = null;
    }

    // If game was paused due to disconnect, restore state
    if (room.state.phase === GamePhase.PAUSED_DISCONNECT) {
      room.state.phase = GamePhase.PLAYING; // or SERVING, logic to restore previous phase will be in Game loop logic
    }

    socket.send(JSON.stringify({
      event: WebSocketEvents.ROOM_JOINED,
      data: { roomId: room.id, role }
    }));
    
    room.broadcast({
      event: WebSocketEvents.PLAYER_RECONNECTED,
      data: { role }
    });
  }

  public handleDisconnect(socket: WebSocket) {
    const room = this.socketRoomMap.get(socket);
    if (!room) return;

    const role = room.getRoleBySocket(socket);
    if (!role) return;

    // Remove socket mapping
    this.socketRoomMap.delete(socket);

    // Update room state for grace period
    const playerState = room.state.players[role];
    if (playerState) {
      playerState.isDisconnected = true;
      playerState.disconnectTime = Date.now();
    }

    room.broadcast({
      event: WebSocketEvents.PLAYER_DISCONNECTED,
      data: { role }
    });

    // Pause the game phase
    if (room.state.phase === GamePhase.PLAYING || room.state.phase === GamePhase.SERVING) {
      room.state.phase = GamePhase.PAUSED_DISCONNECT;
    }

    // Init 1-minute disconnect grace period timeout
    if (room.disconnectTimeout) {
      clearTimeout(room.disconnectTimeout);
    }
    
    room.disconnectTimeout = setTimeout(() => {
      // Game Over, adjusted loss for the disconnected player
      room.state.phase = GamePhase.GAME_OVER;
      room.broadcast({
        event: WebSocketEvents.GAME_OVER,
        data: { forfeit: true, loserRole: role }
      });
      console.log(`Room ${room.id} ended due to disconnect timeout`);
      this.closeRoom(room.id);
    }, DISCONNECT_GRACE_PERIOD_MS);
  }

  public closeRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.tickInterval) clearInterval(room.tickInterval);
    if (room.disconnectTimeout) clearTimeout(room.disconnectTimeout);

    for (const client of room.clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
      this.socketRoomMap.delete(client);
    }
    this.rooms.delete(roomId);
  }

  public handleMessage(socket: WebSocket, data: any) {
    const room = this.socketRoomMap.get(socket);
    if (!room) return;

    const role = room.getRoleBySocket(socket);
    if (!role) return;

    switch (data.event) {
      case WebSocketEvents.PAD_MOVE:
        room.gameEngine.handlePadMove(role, data.data);
        break;
      case WebSocketEvents.ACTION_SERVE:
        room.gameEngine.handleServeAction(role);
        break;
      case WebSocketEvents.ACTION_POWER_HIT:
        room.gameEngine.handlePowerHitAction(role);
        break;
      default:
        // Ignore or log other messages
        break;
    }
  }
}

export const roomManager = new RoomManager();
