import { useState, useEffect } from 'react';
import { Lobby } from './features/lobby/Lobby';
import { Arena } from './features/arena/Arena';
import { wsClient } from './features/network/WebSocketClient';
import { WebSocketEvents, PlayerRole } from 'pong-shared';

function App() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<PlayerRole | null>(null);

  useEffect(() => {
    const handleRoomJoined = (data: { roomId: string, role: string }) => {
      setActiveRoomId(data.roomId);
      setPlayerRole(data.role as PlayerRole);
    };

    const handleRoomCreated = (data: { roomId: string, role: string }) => {
      setPlayerRole(data.role as PlayerRole);
    };

    wsClient.on(WebSocketEvents.ROOM_JOINED, handleRoomJoined);
    wsClient.on(WebSocketEvents.ROOM_CREATED, handleRoomCreated);
    
    return () => {
      wsClient.off(WebSocketEvents.ROOM_JOINED, handleRoomJoined);
      wsClient.off(WebSocketEvents.ROOM_CREATED, handleRoomCreated);
    };
  }, []);

  return (
    <div className="game-container">
      {!activeRoomId || !playerRole ? (
        <Lobby onJoinRoom={(id) => setActiveRoomId(id)} />
      ) : (
        <Arena roomId={activeRoomId} role={playerRole} />
      )}
    </div>
  );
}

export default App;
