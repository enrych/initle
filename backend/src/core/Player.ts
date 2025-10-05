class Player {
  playerId: string;
  username?: string;

  constructor(username?: string) {
    this.playerId = crypto.randomUUID();
    this.username = username!;
  }
}

export default Player;
