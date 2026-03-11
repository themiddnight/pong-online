/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebSocketEvents } from 'pong-shared';
import type { BasePayload } from 'pong-shared';

type MessageCallback<T = any> = (data: T) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<WebSocketEvents, Set<MessageCallback>> = new Map();
  public isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.isConnected) return Promise.resolve();
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      // Connect to the same machine but port 3000
      this.ws = new WebSocket(`ws://${window.location.hostname}:3000`);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.connectionPromise = null;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const payload: BasePayload = JSON.parse(event.data);
          this.emit(payload.event, payload.data);
        } catch (err) {
          console.error('Failed to parse WS message', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        // Optionally handle auto-reconnect logic here
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        reject(err);
      };
    });

    return this.connectionPromise;
  }

  public on(event: WebSocketEvents, callback: MessageCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  public off(event: WebSocketEvents, callback: MessageCallback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  private emit(event: WebSocketEvents, data: any) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach((cb) => cb(data));
    }
  }

  public send(event: WebSocketEvents, data?: any) {
    if (!this.isConnected || !this.ws) {
      console.error('Cannot send message, WebSocket is not connected.');
      return;
    }
    const payload: BasePayload = { event, ...data ? { data } : {} };
    this.ws.send(JSON.stringify(payload));
  }
}

export const wsClient = new WebSocketClient();
