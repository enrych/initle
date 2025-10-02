import type Player from "./Player.js";

class Leaderboard {
  private scores: Map<Player["id"], number> = new Map();

  addPlayer(player: Player) {
    if (!this.scores.has(player.id)) {
      this.scores.set(player.id, 0);
    }
    return player.id;
  }

  private ensurePlayerExists(playerId: Player["id"]) {
    if (!this.scores.has(playerId)) {
      throw new Error(`Player with id ${playerId} is not in the leaderboard.`);
    }
  }

  updateScore(playerId: Player["id"], delta: number) {
    this.ensurePlayerExists(playerId);
    const current = this.scores.get(playerId)!;
    this.scores.set(playerId, current + delta);
  }

  getScore(playerId: Player["id"]) {
    this.ensurePlayerExists(playerId);
    return this.scores.get(playerId)!;
  }

  removePlayer(playerId: Player["id"]) {
    this.ensurePlayerExists(playerId);
    this.scores.delete(playerId);
  }

  getLeaderboard() {
    return Array.from(this.scores.entries())
      .sort(([, aScore], [, bScore]) => bScore - aScore)
      .map(([playerId, score], index) => ({
        playerId,
        score,
        rank: index + 1,
      }));
  }

  reset() {
    this.scores.clear();
  }
}

export default Leaderboard;
