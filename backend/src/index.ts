import "dotenv/config";
import http from "http";
import express from "express";
import { Server } from "socket.io";
import Playground from "./core/Playground.js";
import Player from "./core/Player.js";
import redisService from "./clients/redis.js";
import UsernameGenerator from "./utils/usernameGenerator.js";
import UsernameValidator from "./utils/usernameValidator.js";

const PORT = process.env.PORT;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const playground = new Playground(io);
await redisService.init();

app.use(express.json());

app.get("/ping", (_, res) => res.send("pong"));
app.get("/marco", (_, res) => res.send("polo"));

app.post("/auth", (req, res) => {
  const { username: usernameInput }: Player = req.body;
  const username = UsernameValidator.isPresent(usernameInput)
    ? usernameInput
    : UsernameGenerator.generate();
  const player = new Player(username);
  playground.registerPlayer(player);

  res.json(player);
});

app.post("/play", (req, res) => {
  const { playerId: id }: Player = req.body;

  res.json(playground.joinRandomGameRoom(id));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
