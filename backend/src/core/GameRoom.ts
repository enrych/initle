import GameRoomVisibility from "src/enums/GameRoomVisibility.js";
import Leaderboard from "./Leaderboard.js";
import type Player from "./Player.js";

class GameRoom {
  public id: string;
  public visibility: GameRoomVisibility;
  private leaderboard: Leaderboard;
  private players: Player[];

  constructor(visibility: GameRoomVisibility = GameRoomVisibility.PUBLIC) {
    this.id = crypto.randomUUID();
    this.visibility = visibility;
    this.leaderboard = new Leaderboard();
    this.players = [];
  }

  getId() {
    return this.id;
  }
}

export default GameRoom;
