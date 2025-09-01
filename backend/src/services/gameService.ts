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

  getRoom(id: string) {
    return this.rooms.get(id);
  }

  async initQuestion(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const q = await generateQuestion();
    if (!q) return null;

    room.currentQuestion = {
      ...q,
      startTime: Date.now(),
    };

    return room.currentQuestion;
  }

  calculateScore(startTime: number): number {
    const elapsed = (Date.now() - startTime) / 1000;
    const base = 1000;
    const penalty = 50;
    const raw = base - elapsed * penalty;
    return Math.max(100, Math.round(raw));
  }
}

export const gameService = new GameService();
