/** Built-in pack ids are short words; custom packs are "c_" + id. */
export type PackId = string;

export type RoundType = "crack" | "fake" | "set";

export type Item = {
  id: string;
  pack: PackId;
  text: string;
  hint: string;
  aliases: string[];
};

export type Phase =
  | "lobby"
  | "prep"
  | "intro"
  | "play"
  | "write"
  | "vote"
  | "reveal"
  | "scoreboard"
  | "final";

export type PrepSlot = { prompt: number; text: string | null };

export type Player = {
  id: string;
  /** Secret rejoin token; never sent to other clients. */
  token: string;
  name: string;
  avatar: string;
  score: number;
  connected: boolean;
  joinedAt: number;
  /** Timestamps of recent guesses, for rate limiting. */
  guessTimes: number[];
  /** Prep phrases for Set rounds (private to the author until played). */
  prep: PrepSlot[];
  /** Award counters for end-of-game titles. */
  lastReact: number;
  stats: { solves: number; firstSolves: number; fooled: number; foundReal: number; setPoints: number; fastest: number | null };
};

export type Solve = { stage: number; order: number; points: number; at: number };

export type FakeOption = { id: string; text: string; authors: string[]; real: boolean; hidden: boolean };

export type RoundState = {
  index: number; // 0-based
  type: RoundType;
  item: Item;
  /** Set rounds: the player who wrote the phrase. */
  author: string | null;
  /** Set rounds: prompt index the phrase answers. */
  prompt: number | null;
  startedAt: number;
  stage: number; // 0..STAGES-1
  multiplier: number;
  locked: Record<string, number[]>;
  solves: Record<string, Solve>;
  fakes: Record<string, string>;
  options: FakeOption[] | null;
  votes: Record<string, string>;
  /** Points awarded per player at reveal. */
  awarded: Record<string, number> | null;
  skipped: boolean;
};

export type Settings = {
  packs: PackId[];
  rounds: number;
  fake: boolean;
  set: boolean;
  family: boolean;
};

export type SetEntry = { author: string; prompt: number; text: string };

export type Room = {
  code: string;
  created: boolean;
  hostId: string | null;
  settings: Settings;
  /** Display names of packs in settings (resolved by the server). */
  packNames: Record<PackId, string>;
  players: Record<string, Player>;
  /** Player ids in join order. */
  order: string[];
  phase: Phase;
  deadline: number | null;
  round: RoundState | null;
  plan: RoundType[];
  pool: Item[];
  setQueue: SetEntry[];
  seed: number;
  /** Scores before the last reveal, for scoreboard deltas. */
  prevScores: Record<string, number>;
  gamesPlayed: number;
  /** Rejoin tokens of kicked players. */
  banned: string[];
  /** First player to join; gets host back if they return while in the lobby. */
  ownerId: string | null;
};

export type Action =
  | { type: "create"; code: string }
  | { type: "join"; playerId: string; token: string; name: string; avatar: string }
  | { type: "leave"; playerId: string }
  | {
      type: "settings";
      playerId: string;
      packs?: PackId[];
      packNames?: Record<PackId, string>;
      rounds?: number;
      fake?: boolean;
      set?: boolean;
      family?: boolean;
    }
  | { type: "start"; playerId: string; items: Item[]; seed: number }
  | { type: "prep"; playerId: string; slot: number; text: string }
  | { type: "guess"; playerId: string; text: string }
  | { type: "fake"; playerId: string; text: string }
  | { type: "vote"; playerId: string; option: string }
  | { type: "react"; playerId: string; emoji: string }
  | { type: "hide"; playerId: string; target: string }
  | { type: "skip"; playerId: string }
  | { type: "kick"; playerId: string; target: string }
  | { type: "again"; playerId: string }
  | { type: "tick" };

export type GameEvent =
  | { type: "guess-result"; to: string; newlyLocked: number; solved: boolean; points: number }
  | { type: "solve"; playerId: string; stage: number; first: boolean }
  | { type: "reaction"; playerId: string; emoji: string }
  | { type: "kicked"; playerId: string }
  | { type: "accepted"; to: string; what: "prep" | "fake" | "vote"; slot?: number };

export type ErrorCode =
  | "NOT_HOST"
  | "BAD_PHASE"
  | "ROOM_FULL"
  | "ROOM_NOT_FOUND"
  | "NOT_ENOUGH_PLAYERS"
  | "RATE_LIMITED"
  | "UNKNOWN_PLAYER"
  | "BAD_MESSAGE"
  | "BAD_NAME"
  | "BAD_TEXT"
  | "NO_ITEMS"
  | "UNKNOWN_PACK"
  | "BANNED";

export type ReduceError = { to: string; code: ErrorCode; message: string };

export type ReduceResult = { state: Room; events: GameEvent[]; error?: ReduceError };

// ---------- Client view ----------

export type BoardTile =
  | {
      kind: "word";
      index: number;
      initial: string;
      /** null = length hidden. */
      len: number | null;
      /** Revealed characters by position; null = hidden. */
      chars: (string | null)[];
      dim: boolean;
      mine: boolean; // locked by this player
    }
  | { kind: "punct"; text: string };

export type ViewPlayer = {
  id: string;
  name: string;
  avatar: string;
  score: number;
  connected: boolean;
  host: boolean;
  /** Words locked during play. */
  progress: number;
  /** Done with the current phase's task (solved / prepped / wrote / voted). */
  ready: boolean;
};

export type Award = { title: string; playerId: string; detail: string };

export type View = {
  code: string;
  /** "" for the stage screen. */
  me: string;
  hostId: string | null;
  phase: Phase;
  settings: Settings;
  packNames: Record<PackId, string>;
  deadline: number | null;
  serverNow: number;
  players: ViewPlayer[];
  prep: null | { prompts: { prompt: string; text: string | null }[] };
  round: null | {
    index: number;
    total: number;
    type: RoundType;
    stage: number;
    stages: number;
    pack: string;
    author: string | null;
    hint: string | null;
    wordCount: number;
    multiplier: number;
    board: BoardTile[];
    mySolve: Solve | null;
    myFake: string | null;
    options: { id: string; text: string; mine: boolean }[] | null;
    myVote: string | null;
  };
  reveal: null | {
    answer: string;
    hint: string;
    skipped: boolean;
    results: { id: string; points: number; stage: number | null; locked: number }[];
    options: { id: string; text: string; real: boolean; hidden: boolean; authors: string[]; voters: string[] }[] | null;
  };
  standings: null | { id: string; score: number; delta: number; rank: number }[];
  awards: Award[] | null;
};
