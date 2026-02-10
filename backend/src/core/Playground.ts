import { Server, Socket } from "socket.io";
import GameRoom from "./GameRoom.js";
import Player from "./Player.js";
import redisService from "src/clients/redis.js";

type GameRoomRegistryEntry = GameRoom;
type PlayerRegistryEntry = Partial<{
  username: Player["username"];
  gameRoomId: GameRoom["id"];
}>;

class Playground {
  private io: Server;
  private gameRoomRegistry: Map<GameRoom["id"], GameRoomRegistryEntry> =
    new Map();
  private playerRegistry: Map<Player["playerId"], PlayerRegistryEntry> =
    new Map();

  constructor(io: Server) {
    this.io = io;
    this.init();
    this.initSocketHandler();
    console.log("GameService initialized...");
  }

  private init() {
    const defaultRoom = this.createGameRoom();
  }

  private initSocketHandler() {
    this.io.on("connection", (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on("join_room", ({ playerId }) => {
        const playerEntry = this.playerRegistry.get(playerId);
        if (!playerEntry) {
          return socket.emit("error", "Unknown player");
        }

        const roomId = playerEntry.gameRoomId;
        if (!roomId) {
          return socket.emit("error", "Player not assigned to a room yet");
        }

        const room = this.getGameRoom(roomId);
        if (!room) return socket.emit("error", "Room not found");

        room.addPlayer(playerId);
        socket.join(roomId);
        (socket as any).playerId = playerId;

        console.log(`Player ${playerId} joined room ${roomId}`);

        this.io
          .to(roomId)
          .emit("player-joined", { playerId, username: playerEntry.username });

        socket.emit("room-state", {
          roomId,
          players: this.getPlayersInRoom(roomId),
        });
      });

      socket.on("disconnect", () => {
        const playerId = (socket as any).playerId;
        if (!playerId) {
          console.log(`Socket disconnected: ${socket.id} (no playerId)`);
          return;
        }

        const playerEntry = this.playerRegistry.get(playerId);
        if (!playerEntry) return;

        const roomId = playerEntry.gameRoomId;
        if (roomId) {
          const room = this.getGameRoom(roomId);
          if (room) {
            room.removePlayer(playerId);

            this.io.to(roomId).emit("player-left", { playerId });
          }
        }

        // Optionally remove player from registry if you want ephemeral players
        // this.playerRegistry.delete(playerId);

        console.log(`Player disconnected: ${playerId} (socket ${socket.id})`);
      });
    });
  }

  createGameRoom() {
    const gameRoom = new GameRoom();
    this.gameRoomRegistry.set(gameRoom.id, gameRoom);
    return gameRoom;
  }

  getGameRoom(roomId: GameRoom["id"]) {
    return this.gameRoomRegistry.get(roomId);
  }

  getPlayersInRoom(roomId: string) {
    const room = this.getGameRoom(roomId);
    if (!room) return [];
    return room.getPlayers().map((playerId) => {
      const entry = this.playerRegistry.get(playerId);
      return { playerId, username: entry?.username };
    });
  }

  registerPlayer({ playerId, username }: Player) {
    this.playerRegistry.set(playerId, { username });
    console.log("Player has been registered: ", playerId);
  }

  joinRandomGameRoom(playerId: Player["playerId"]) {
    const existingPlayerEntry = this.playerRegistry.get(playerId) ?? {};

    if (existingPlayerEntry.gameRoomId) {
      const existingRoom = this.gameRoomRegistry.get(
        existingPlayerEntry.gameRoomId,
      );
      if (existingRoom) {
        return { roomId: existingRoom.id };
      }
    }

    const gameRoom = this.findGameRoomToJoin();

    gameRoom.addPlayer(playerId);

    this.playerRegistry.set(playerId, {
      ...existingPlayerEntry,
      gameRoomId: gameRoom.id,
    });

    return { roomId: gameRoom.id };
  }

  findGameRoomToJoin() {
    let availableRoom = [...this.gameRoomRegistry.values()].find(
      (room) => room.isPublic && room.hasSpace,
    );

    if (!availableRoom) {
      availableRoom = this.createGameRoom();
    }

    return availableRoom;
  }
}

export default Playground;
