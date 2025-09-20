class Player {
  id: string;
  name: string;

  constructor(name: string) {
    this.id = crypto.randomUUID();
    this.name = name;
  }
}

export default Player;
