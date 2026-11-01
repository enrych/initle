import type { Award, View } from "@initle/core/client";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Native share sheet when available, clipboard otherwise. Returns what happened. */
export async function shareOrCopy(data: { title?: string; text: string; url?: string }): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "failed";
    }
  }
  return (await copyText(data.url ? `${data.text}\n${data.url}` : data.text)) ? "copied" : "failed";
}

export function inviteUrl(code: string): string {
  return `${location.origin}/r/${code}`;
}

/** Wordle-style Daily share: one square per stage. */
export function dailyShareText(day: number, solvedStage: number | null, stages: number): string {
  const squares = Array.from({ length: stages }, (_, i) => {
    if (solvedStage === null) return "🟥";
    if (i < solvedStage) return "🟧";
    if (i === solvedStage) return "🟩";
    return "⬛";
  }).join("");
  const score = solvedStage === null ? "X" : String(solvedStage + 1);
  return `Initle #${day} · ${score}/${stages}\n${squares}`;
}

// ---------- Podium share card (rendered client-side to a PNG) ----------

const W = 1080;
const H = 1350;

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export async function renderPodiumCard(view: View, awards: Award[]): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return null;
  await document.fonts?.ready;

  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#151a3d");
  bg.addColorStop(1, "#0b0d1a");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Logo tiles
  const letters = "INITLE";
  const colors = ["#4f8cff", "#4f8cff", "#ff4fa3", "#ff4fa3", "#ffb020", "#ffb020"];
  letters.split("").forEach((ch, i) => {
    const x = 170 + i * 125;
    roundRect(c, x, 80, 105, 120, 18);
    c.fillStyle = colors[i]!;
    c.fill();
    c.fillStyle = i >= 4 ? "#0b0d1a" : "#ffffff";
    c.font = "700 76px 'Space Grotesk', sans-serif";
    c.textAlign = "center";
    c.fillText(ch, x + 52, 168);
  });

  const byId = new Map(view.players.map((p) => [p.id, p]));
  const standings = view.standings ?? [];
  const podium = standings.slice(0, 3);
  const heights = [300, 220, 170];
  const order = [1, 0, 2];
  const medal = ["#ffd54a", "#c9d1e8", "#e3a06b"];
  c.textAlign = "center";
  for (const slot of order) {
    const row = podium[slot];
    if (!row) continue;
    const p = byId.get(row.id);
    const x = 140 + [1, 0, 2].indexOf(slot) * 290;
    const h = heights[slot]!;
    const y = 820 - h;
    roundRect(c, x, y, 250, h, 24);
    c.fillStyle = "#1e2346";
    c.fill();
    c.fillStyle = medal[slot]!;
    c.font = "700 64px 'Space Grotesk', sans-serif";
    c.fillText(String(row.rank), x + 125, y + 80);
    c.font = "120px serif";
    c.fillText(p?.avatar ?? "?", x + 125, y - 40);
    c.fillStyle = "#f4f5ff";
    c.font = "700 40px Inter, sans-serif";
    c.fillText((p?.name ?? "").slice(0, 12), x + 125, y + 140);
    c.fillStyle = "#9aa0c7";
    c.font = "600 34px Inter, sans-serif";
    c.fillText(`${row.score} pts`, x + 125, y + 190);
  }

  c.textAlign = "left";
  let y = 920;
  for (const a of awards.slice(0, 3)) {
    const p = byId.get(a.playerId);
    roundRect(c, 120, y, 840, 104, 20);
    c.fillStyle = "#151933";
    c.fill();
    c.fillStyle = "#ffb020";
    c.font = "700 34px 'Space Grotesk', sans-serif";
    c.fillText(a.title, 156, y + 46);
    c.fillStyle = "#f4f5ff";
    c.font = "500 30px Inter, sans-serif";
    c.fillText(`${p?.avatar ?? ""} ${p?.name ?? ""} · ${a.detail}`, 156, y + 86);
    y += 124;
  }

  c.fillStyle = "#9aa0c7";
  c.font = "500 32px Inter, sans-serif";
  c.textAlign = "center";
  c.fillText(`Play at ${location.host}`, W / 2, H - 50);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export async function shareImage(blob: Blob, filename: string, text: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch {
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
