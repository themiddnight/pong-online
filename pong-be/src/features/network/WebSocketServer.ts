import { Server as HttpServer } from 'http';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { WebSocketEvents } from 'pong-shared';
import { roomManager } from '../matchmaking/RoomManager';

export function setupWebSocket(server: HttpServer) {
  const wss = new WSServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    // console.log('New WebSocket connection established');

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message);

        switch (parsed.event) {
          case WebSocketEvents.CREATE_ROOM:
            roomManager.createRoom(ws);
            break;
          case WebSocketEvents.JOIN_ROOM:
            roomManager.joinRoom(ws, parsed.data.roomId);
            break;
          default:
            // Route game events to the room via roomManager
            roomManager.handleMessage(ws, parsed);
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS message:', err);
      }
    });

    ws.on('close', () => {
      roomManager.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket Error:', error);
    });
  });

  return wss;
}
