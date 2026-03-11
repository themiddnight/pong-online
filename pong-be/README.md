# Pong 1v1 Backend (`pong-be`)

This is the Express & Native WebSocket Server for Pong!

## Architecture

- **Bun Runtime**: Provides ultra-fast execution and TypeScript running out of the box natively replacing ts-node.
- **Express Server**: Base routing and basic entry-point. Can be extended with `helmet` or `cors` if needed.
- **WebSocket Native Server**: Binds to the `httpServer` to run pure bi-directional JSON logic alongside standard HTTP requests perfectly on port 3000.
- **Feature Structure**: Contains two main directories: `matchmaking` (rooms & UUID generation) and `game` (The true 30 FPS physics engine containing the single-source-of-truth).

## Connection Lifecycle
1. Connect via UUID
2. Emit `JOIN_ROOM` or `CREATE_ROOM`
3. Engine handles state loops when both players connect.
4. On disconnect, logic waits for exactly 60 seconds (Grace Period) until declaring forfeit.
