import type { Player } from "./Player.js";
import { Leaderboard } from "./Leaderboard.js";

export type Question = {
  id: string;
  initials: string;
  fullTitle: string;
  startTime: number;
};

export class GameRoom {
  id: string;
  leaderboard: Leaderboard;
  currentQuestion?: Question;

  constructor(id: string) {
    this.id = id;
    this.leaderboard = new Leaderboard();
  }

  addPlayer(player: Player) {
    this.leaderboard.addPlayer(player);
  }

  removePlayer(playerId: string) {
    this.leaderboard.removePlayer(playerId);
  }

  getPlayers(): Player[] {
    return this.leaderboard.getPlayers();
  }

  getLeaderboard(): Player[] {
    return this.leaderboard.getSortedLeaderboard();
  }
}
