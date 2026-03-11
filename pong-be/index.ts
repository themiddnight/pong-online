import express from "express";
import { createServer } from 'http';
import { setupWebSocket } from './src/features/network/WebSocketServer';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Pong Backend API is running.");
});

const server = createServer(app);
setupWebSocket(server);

server.listen(port, () => {
  console.log(`Server (HTTP & WS) is running at http://localhost:${port}`);
});