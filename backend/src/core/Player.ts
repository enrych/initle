import UsernameGenerator from "src/utils/usernameGenerator.js";
import UsernameValidator from "src/utils/usernameValidator.js";

class Player {
  id: string;
  username?: string;

  constructor(username?: string) {
    username = UsernameValidator.isPresent(username)
      ? username
      : UsernameGenerator.generate();

    this.id = crypto.randomUUID();
    this.username = username!;
  }
}

export default Player;
