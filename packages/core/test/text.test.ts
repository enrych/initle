import { describe, expect, it } from "vitest";
import { evaluateGuess, initials, osaDistance, phraseKey, wordsMatch, PACKS } from "../src";

describe("initials", () => {
  it("keeps colons as tiles", () => {
    expect(initials("The Lord of the Rings: The Two Towers")).toBe("T L O T R : T T T");
  });
  it("handles apostrophes and commas", () => {
    expect(initials("Don't cry over spilt milk")).toBe("D C O S M");
    expect(initials("When in Rome, do as the Romans do")).toBe("W I R D A T R D");
  });
  it("shows numbers whole", () => {
    expect(initials("12 Angry Men")).toBe("12 A M");
  });
  it("every pack item produces at least two words", () => {
    for (const pack of Object.values(PACKS))
      for (const item of pack.items) expect(initials(item.text).split(" ").length, item.text).toBeGreaterThan(1);
  });
});

describe("matching", () => {
  it("osa distance counts transpositions as 1", () => {
    expect(osaDistance("towers", "towres")).toBe(1);
  });
  it("allows one typo only on 5+ letter words", () => {
    expect(wordsMatch("towers", "towres")).toBe(true);
    expect(wordsMatch("cat", "car")).toBe(false);
  });
  it("normalizes diacritics, case and number words", () => {
    expect(phraseKey("The Twelve Angry Men")).toBe(phraseKey("12 angry men"));
    expect(phraseKey("Pokémon")).toBe("pokemon");
  });
});

describe("evaluateGuess", () => {
  const answer = "I Know What You Did Last Summer";
  it("locks partial words and accumulates", () => {
    const a = evaluateGuess(answer, [], "know summer", []);
    expect(a.newlyLocked.sort()).toEqual([1, 6]);
    expect(a.solved).toBe(false);
    const b = evaluateGuess(answer, [], "i what you did last", a.newlyLocked);
    expect(b.solved).toBe(true);
  });
  it("one guessed word locks one answer word", () => {
    const r = evaluateGuess("The Lord of the Rings: The Two Towers", [], "the", []);
    expect(r.newlyLocked).toEqual([0]);
  });
  it("solves via alias", () => {
    const r = evaluateGuess("The Lord of the Rings: The Two Towers", ["The Two Towers"], "two towers", []);
    expect(r.solved).toBe(true);
  });
  it("ignores punctuation in the guess", () => {
    expect(evaluateGuess("Don't cry over spilt milk", [], "dont cry over spilt milk!", []).solved).toBe(true);
  });
});

import { fitsInitials, dailyItem, dayNumber, dayDate, checkPhrase, containsBlocked } from "../src";

describe("fake initials", () => {
  it("accepts matching initials, any case", () => {
    expect(fitsInitials("Piece of cake", "pizza or crumble")).toBe(true);
    expect(fitsInitials("Piece of cake", "pizza crumble")).toBe(false);
    expect(fitsInitials("The Lord of the Rings: The Two Towers", "Tiny Lamps on Tall Rocks: Ten Tiny Toads")).toBe(true);
  });
});

describe("daily", () => {
  it("day 1 is 2026-11-01 and is deterministic", () => {
    expect(dayNumber(Date.UTC(2026, 10, 1, 12))).toBe(1);
    expect(dayDate(1)).toBe("2026-11-01");
    expect(dailyItem(5)).toEqual(dailyItem(5));
    expect(dailyItem(5).id).not.toBe(dailyItem(6).id);
  });
});

describe("moderation", () => {
  it("blocks in family mode only", () => {
    expect(containsBlocked("what the fuck")).toBe(true);
    expect(checkPhrase("what the fuck", true).ok).toBe(false);
    expect(checkPhrase("what the fuck", false).ok).toBe(true);
    expect(checkPhrase("Scunthorpe is lovely", true).ok).toBe(true);
  });
});
