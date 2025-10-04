import GameRoomVisibility from "src/enums/GameRoomVisibility.js";
import Leaderboard from "./Leaderboard.js";
import type Player from "./Player.js";

type GameRoomProps = Partial<{
  visibility: GameRoomVisibility;
  roomSize: number;
}>;

class GameRoom {
  public id: string;
  public visibility: GameRoomVisibility;
  public roomSize: number;
  private leaderboard: Leaderboard;
  private players: Player[];

  constructor({
    visibility = GameRoomVisibility.PUBLIC,
    roomSize = 4,
  }: GameRoomProps = {}) {
    this.id = crypto.randomUUID();
    this.visibility = visibility;
    this.roomSize = roomSize;
    this.leaderboard = new Leaderboard();
    this.players = [];
  }

  getId() {
    return this.id;
  }

  addPlayer(player: Player) {
    if (!this.hasSpace) {
      throw new Error("Room is full");
    }
    this.players.push(player);
    this.leaderboard.addPlayer(player);
  }

  get hasSpace() {
    return this.players.length < this.roomSize;
  }

  get isPublic() {
    return this.visibility === GameRoomVisibility.PUBLIC;
  }
}

export default GameRoom;
