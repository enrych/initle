import { buildBoard } from "@initle/core/client";
import { Board } from "./Board";
import { ROUND_META } from "./ui";

const example = (stage: number) => buildBoard("Piece of cake", stage, new Set(), false);

export function HowToPlay() {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed">
      <p className="text-muted">
        Every puzzle is a phrase shown only as its <b className="text-ink">initials</b>. A game is 5–12 rounds of three kinds, so knowing trivia isn't the only way to win.
      </p>
      <section className="space-y-2">
        <h3 className={`font-display text-lg font-bold ${ROUND_META.crack.text}`}>Crack it</h3>
        <p>Guess the phrase. Every 8 seconds more is revealed: word lengths, a hint, then letters. Solve earlier for more points.</p>
        <div className="space-y-3 rounded-2xl bg-bg-deep p-4">
          <Board tiles={example(0)} type="crack" size="sm" />
          <Board tiles={example(3)} type="crack" size="sm" />
        </div>
        <p className="text-sm text-muted">Words you get right turn green on your screen, so partial guesses still count.</p>
      </section>
      <section className="space-y-2">
        <h3 className={`font-display text-lg font-bold ${ROUND_META.fake.text}`}>Fake it</h3>
        <p>
          Everyone writes a fake that fits the letters (<i>P·O·C</i> → “Pizza Or Crumble”). Then all the answers appear, the real one hidden among them. Vote for the real one:
          +300 if you find it, +150 for every player your fake fools.
        </p>
      </section>
      <section className="space-y-2">
        <h3 className={`font-display text-lg font-bold ${ROUND_META.set.text}`}>Set it</h3>
        <p>
          Before the game, everyone writes two short phrases about the group. They become puzzles. The author scores only if <b>some, but not all</b>, players crack it.
        </p>
      </section>
      <section className="panel-sm p-4 text-sm text-muted">
        <b className="text-ink">Scoring:</b> 500 → 100 points by reveal stage, +50 for the first solver, 20 per correct word if you don't finish. The final round counts double.
      </section>
    </div>
  );
}
