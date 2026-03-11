# Pong 1v1 Frontend (`pong-fe`)

This is the React client for the Pong 1v1 online multiplayer game.

## Architecture

- **React 19 & Vite**: Ultra-fast module bundling and modern UI rendering.
- **Tailwind CSS 4**: Used for UI styling, centering the arena, creating responsive scaling logic (`aspect-ratio: 2/3`) and applying the global `pixel-art` font themes.
- **Native WebSockets**: A singleton `WebSocketClient` connects exactly to `ws://[host]:3000` to receive server game states dynamically.
- **Interpolation Loop**: Uses client state syncing `stateRef` mapped to `renderState` alongside rapid DOM manipulation to transition 30fps inputs smoothly to display at standard framerates natively.
- **Responsive Controls**: Mouse, Keyboard (L/R arrows & Spacebar to Serve), and Touchscreen virtual buttons are perfectly scaled within the logical coordinates setup.

## Running

1. Install dependencies at the workspace root using `bun install`.
2. Start the dev server using `bun run dev` (Runs concurrently from root).
