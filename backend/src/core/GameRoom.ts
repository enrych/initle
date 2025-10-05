import GameRoomVisibility from "src/enums/GameRoomVisibility.js";
import Leaderboard from "./Leaderboard.js";
import type Player from "./Player.js";
import { GAME_CONFIG } from "src/config/game.config.js";

type GameRoomOptions = Partial<{
  visibility: GameRoomVisibility;
  roomSize: number;
}>;

class GameRoom {
  public readonly _id: string;
  public visibility: GameRoomVisibility;
  public roomSize: number;
  private players: Set<Player["playerId"]>;
  private leaderboard: Leaderboard;

  constructor({
    visibility = GAME_CONFIG.ROOM.DEFAULT_VISIBILITY,
    roomSize: roomSize = GAME_CONFIG.ROOM.DEFAULT_NUMBER_OF_PLAYERS,
  }: GameRoomOptions = {}) {
    this._id = crypto.randomUUID();
    this.visibility = visibility;
    this.roomSize = roomSize;
    this.leaderboard = new Leaderboard();
    this.players = new Set();
  }

  get id() {
    return this._id;
  }

  addPlayer(playerId: Player["playerId"]) {
    if (!playerId) {
      throw new Error("Invalid PlayerId");
    }
    if (!this.hasSpace) {
      throw new Error("Room is full");
    }
    this.players.add(playerId);
    this.leaderboard.addPlayer(playerId);
  }

  removePlayer(removedPlayerId: Player["playerId"]) {
    if (!removedPlayerId) {
      throw new Error("Invalid PlayerId");
    }
    this.players.delete(removedPlayerId);
    this.leaderboard.removePlayer(removedPlayerId);
  }

  get hasSpace() {
    return this.players.size < this.roomSize;
  }

  get isPublic() {
    return this.visibility === GameRoomVisibility.PUBLIC;
  }
}

export default GameRoom;
