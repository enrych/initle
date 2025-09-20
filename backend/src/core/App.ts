import { Server, Socket } from "socket.io";
import GameRoom from "./GameRoom.js";

class App {
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
    });
  }

  createRoom() {
    const room = new GameRoom();
    this.rooms.set(room.id, room);
    return room;
  }

  getRoom(roomId: GameRoom["id"]) {
    this.rooms.get(roomId);
  }
}

export default App;
