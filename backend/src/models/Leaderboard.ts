import type { Player } from "./Player.js";

export class Leaderboard {
  private players: Map<string, Player> = new Map();

  addPlayer(player: Player) {
    this.players.set(player.id, player);
  }

  removePlayer(playerId: string) {
    this.players.delete(playerId);
  }

  updateScore(playerId: string, delta: number) {
    const player = this.players.get(playerId);
    if (player) {
      player.score += delta;
    }
  }

  getPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  getSortedLeaderboard(): Player[] {
    return this.getPlayers().sort((a, b) => b.score - a.score);
  }

  reset() {
    this.players.clear();
  }
}
