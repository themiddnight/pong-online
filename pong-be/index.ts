import express from "express";
import { createServer } from 'http';
import { setupWebSocket } from './src/features/network/WebSocketServer';
import cors from "cors";
import helmet from "helmet";

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());

// Dynamic CORS configuration
const allowedOrigins = process.env.VITE_ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173", "http://localhost:3000"];
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes("*")) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Pong Backend API is running.");
});

const server = createServer(app);
setupWebSocket(server);

server.listen(port, () => {
  console.log(`Server (HTTP & WS) is running at http://localhost:${port}`);
});