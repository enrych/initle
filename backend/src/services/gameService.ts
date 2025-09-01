import { GameRoom } from "../models/GameRoom.js";
import { generateQuestion } from "./questionService.js";

class GameService {
  private rooms: Map<string, GameRoom> = new Map();

  constructor() {
    this.createRoom("main");
  }

  createRoom(id: string) {
    const room = new GameRoom(id);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): GameRoom | undefined {
    return this.rooms.get(id);
  }

  async initQuestion(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const question = await generateQuestion();
    if (question) {
      room.currentQuestion = question;
    }
    return question;
  }
}

export const gameService = new GameService();
