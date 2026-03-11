import { useState, useEffect } from 'react';
import { wsClient } from '../network/WebSocketClient';
import { WebSocketEvents } from 'pong-shared';

interface LobbyProps {
  onJoinRoom: (roomId: string) => void;
}

export function Lobby({ onJoinRoom }: LobbyProps) {
  const [joinInput, setJoinInput] = useState('');
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    const handleRoomCreated = (data: { roomId: string }) => {
      setCreatedRoomId(data.roomId);
      setStatus('Waiting for opponent to join...');
    };

    const handleRoomError = (data: { message: string }) => {
      setStatus(`Error: ${data.message}`);
    };

    const handleOpponentJoined = () => {
      if (createdRoomId) {
        onJoinRoom(createdRoomId);
      }
    };

    wsClient.on(WebSocketEvents.ROOM_CREATED, handleRoomCreated);
    wsClient.on(WebSocketEvents.ROOM_ERROR, handleRoomError);
    wsClient.on(WebSocketEvents.OPPONENT_JOINED, handleOpponentJoined);

    return () => {
      wsClient.off(WebSocketEvents.ROOM_CREATED, handleRoomCreated);
      wsClient.off(WebSocketEvents.ROOM_ERROR, handleRoomError);
      wsClient.off(WebSocketEvents.OPPONENT_JOINED, handleOpponentJoined);
    };
  }, [createdRoomId, onJoinRoom]);

  const handleCreate = async () => {
    setStatus('Connecting to server...');
    await wsClient.connect();
    wsClient.send(WebSocketEvents.CREATE_ROOM);
  };

  const handleJoin = async () => {
    if (!joinInput.trim()) return;
    setStatus('Connecting to server...');
    await wsClient.connect();
    // Assuming ROOM_JOINED is handled by App.tsx since we transition right away
    wsClient.send(WebSocketEvents.JOIN_ROOM, { roomId: joinInput.trim() });
  };

  const copyRoomId = () => {
    if (createdRoomId) {
      navigator.clipboard.writeText(createdRoomId);
      setStatus('UUID Copied! Waiting for opponent...');
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-black/80">
      <h1 className="text-6xl mb-12 tracking-widest text-shadow-md shadow-white">1V1 PONG</h1>

      {!createdRoomId ? (
        <div className="flex flex-col gap-8 w-full max-w-sm">
          <button 
            onClick={handleCreate}
            className="w-full py-4 border-2 border-white hover:bg-white hover:text-black transition-colors text-2xl uppercase cursor-pointer"
          >
            Create Room
          </button>
          
          <div className="flex items-center gap-4 w-full">
            <span className="w-full border-b border-white"></span>
            <span className="text-xl">OR</span>
            <span className="w-full border-b border-white"></span>
          </div>
          
          <div className="flex flex-col gap-4">
            <input 
              type="text" 
              placeholder="Paste UUID here..." 
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              className="w-full py-3 px-4 bg-transparent border-2 border-white placeholder-gray-500 text-center text-xl outline-none focus:border-gray-300"
            />
            <button 
              onClick={handleJoin}
              className="w-full py-4 border-2 border-white bg-white text-black hover:bg-gray-300 hover:border-gray-300 transition-colors text-2xl uppercase cursor-pointer"
            >
              Join Room
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-sm">
          <h2 className="text-2xl mb-2">Room Created!</h2>
          <div className="bg-gray-900 border border-gray-600 p-4 rounded text-sm break-all font-sans select-all">
            {createdRoomId}
          </div>
          <button 
            onClick={copyRoomId}
            className="w-full py-3 border-2 border-white hover:bg-white hover:text-black transition-colors text-xl uppercase cursor-pointer"
          >
            Copy UUID
          </button>
        </div>
      )}

      {status && (
        <p className="mt-8 text-xl animate-pulse text-gray-300">{status}</p>
      )}
    </div>
  );
}
