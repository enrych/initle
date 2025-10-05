import type Player from "./Player.js";

class Leaderboard {
  private scoreboard: Map<Player["playerId"], number> = new Map();

  addPlayer(playerId: Player["playerId"]) {
    if (!this.scoreboard.has(playerId)) {
      this.scoreboard.set(playerId, 0);
    }
    return playerId;
  }

  private ensurePlayerExists(playerId: Player["playerId"]) {
    if (!this.scoreboard.has(playerId)) {
      throw new Error(
        `Player with playerId ${playerId} is not in the leaderboard.`,
      );
    }
  }

  updatePlayerScore(playerId: Player["playerId"], delta: number) {
    this.ensurePlayerExists(playerId);
    const current = this.scoreboard.get(playerId)!;
    this.scoreboard.set(playerId, current + delta);
  }

  getPlayerScore(playerId: Player["playerId"]) {
    this.ensurePlayerExists(playerId);
    return this.scoreboard.get(playerId)!;
  }

  removePlayer(playerId: Player["playerId"]) {
    this.ensurePlayerExists(playerId);
    this.scoreboard.delete(playerId);
  }

  getLeaderboard() {
    return Array.from(this.scoreboard.entries())
      .sort(([, aScore], [, bScore]) => bScore - aScore)
      .map(([playerId, score], index) => ({
        playerId,
        score,
        rank: index + 1,
      }));
  }

  reset() {
    this.scoreboard.clear();
  }
}

export default Leaderboard;
