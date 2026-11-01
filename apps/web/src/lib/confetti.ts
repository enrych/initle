/** Tiny dependency-free confetti burst (tile-shaped pieces in brand colours). */
const COLORS = ["#3f8cff", "#ff4fa0", "#ffc531", "#3ee07f", "#fff3d6"];

export function confetti(opts: { count?: number; originY?: number; spread?: number } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const count = opts.count ?? 120;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:70";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const c = canvas.getContext("2d");
  if (!c) return canvas.remove();
  c.scale(dpr, dpr);

  const originY = (opts.originY ?? 0.35) * innerHeight;
  const spread = opts.spread ?? 1;
  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: innerWidth / 2 + (Math.random() - 0.5) * 80,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 8 + Math.random() * 8,
      h: 10 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.color;
      c.strokeStyle = "#160731";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
      c.fill();
      c.stroke();
      c.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
