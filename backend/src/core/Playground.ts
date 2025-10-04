import { Server, Socket } from "socket.io";
import GameRoom from "./GameRoom.js";
import Player from "./Player.js";

class Playground {
  private io: Server;
  private rooms: Map<GameRoom["id"], GameRoom> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.init();
    this.initSocketHandler();
    console.log("GameService initialized...");
  }

  private init() {
    const defaultRoom = this.createRoom();
  }

  private initSocketHandler() {
    this.io.on("connection", (socket) => {
      console.log(`Player connected: ${socket.id}`);

      socket.on("join_room", ({ roomId, playerId }) => {
        const room = this.getRoom(roomId);
        if (!room) return socket.emit("error", "Room not found");

        socket.join(roomId);

        console.log(`Player ${playerId} joined room ${roomId}`);

        this.io.to(roomId).emit("player-joined", { playerId });
      });

      socket.on("disconnect", () => {
        console.log(`Player disconnected: ${socket.id}`);
      });
    });
  }

  createRoom() {
    const room = new GameRoom();
    this.rooms.set(room.id, room);
    return room;
  }

  getRoom(roomId: GameRoom["id"]) {
    return this.rooms.get(roomId);
  }

  joinRandomRoom(username: Player["username"]) {
    const player = new Player(username!);
    const room = this.findRoomToJoin();
    room.addPlayer(player);

    return {
      roomId: room.id,
      playerId: player.id,
      playerUsername: player.username,
    };
  }

  findRoomToJoin() {
    let availableRoom = [...this.rooms.values()].find(
      (room) => room.isPublic && room.hasSpace,
    );

    if (!availableRoom) {
      availableRoom = this.createRoom();
    }

    return availableRoom;
  }
}

export default Playground;
