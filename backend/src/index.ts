import "dotenv/config";
import http from "http";
import express from "express";
import { Server } from "socket.io";
import Playground from "./core/Playground.js";
import type Player from "./core/Player.js";

const PORT = process.env.PORT;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const playground = new Playground(io);

app.use(express.json());

app.get("/ping", (_, res) => res.send("pong"));
app.get("/marco", (_, res) => res.send("polo"));

app.post("/auth", (req, res) => {
  res.json({
    playerId: crypto.randomUUID(),
  });
});

app.post("/play", (req, res) => {
  const { username }: { username: Player["username"] } = req.body;

  res.json(playground.joinRandomRoom(username));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
