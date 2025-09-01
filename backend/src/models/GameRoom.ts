import type { Player } from "./Player.js";

export type Question = { id: string; initials: string; fullTitle: string };

export class GameRoom {
  id: string;
  players: Map<string, Player> = new Map();
  currentQuestion?: Question;

  constructor(id: string) {
    this.id = id;
  }

  addPlayer(player: Player) {
    this.players.set(player.id, player);
  }

  removePlayer(playerId: string) {
    this.players.delete(playerId);
  }

  getPlayers(): Player[] {
    return Array.from(this.players.values());
  }
}
