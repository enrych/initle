const USERNAME_ADJECTIVES = [
  "Swift",
  "Mighty",
  "Brave",
  "Clever",
  "Sneaky",
  "Happy",
  "Fierce",
];

const USERNAME_ANIMALS = [
  "Tiger",
  "Falcon",
  "Panda",
  "Dragon",
  "Fox",
  "Wolf",
  "Eagle",
];

class UsernameGenerator {
  private constructor() {}

  static generate() {
    const adjective =
      USERNAME_ADJECTIVES[
        Math.floor(Math.random() * USERNAME_ADJECTIVES.length)
      ];
    const animal =
      USERNAME_ANIMALS[Math.floor(Math.random() * USERNAME_ANIMALS.length)];

    const number = Math.floor(Math.random() * 1000);
    return `${adjective}${animal}${number}`;
  }
}

export default UsernameGenerator;
