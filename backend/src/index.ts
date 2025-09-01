import "dotenv/config";
import http from "http";
import express from "express";
import { Server } from "socket.io";
import { registerGameSocket } from "./sockets/gameSocket.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
const PORT = process.env.PORT;

registerGameSocket(io);

app.get("/ping", (_, res) => res.send("pong"));

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
