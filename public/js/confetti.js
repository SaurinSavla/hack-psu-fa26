// Lightweight confetti bursts on a full-screen canvas.

const COLORS = ['#ff5d73', '#3de0ff', '#c6ff3d', '#ffb53d', '#a77bff', '#ff7ad9', '#ffffff'];
let canvas, ctx, parts = [], raf = null;

function ensure() {
  if (canvas) return true;
  canvas = document.getElementById('confetti');
  if (!canvas) return false;
  ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  };
  resize();
  addEventListener('resize', resize);
  return true;
}

/** Burst from a point given as fractions of the screen (0..1). */
export function confetti({ x = 0.5, y = 0.4, count = 120, spread = 1, colors = COLORS } = {}) {
  if (!ensure()) return;
  const W = canvas.width, H = canvas.height, s = devicePixelRatio;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 9) * spread * s;
    parts.push({
      x: x * W, y: y * H,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * s,
      w: (6 + Math.random() * 6) * s, h: (3 + Math.random() * 4) * s,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0], life: 0,
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

function step() {
  const s = devicePixelRatio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life < 220 && p.y < canvas.height + 40);
  for (const p of parts) {
    p.life++;
    p.vy += 0.25 * s;
    p.vx *= 0.99;
    p.vy *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.life / 220);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : null;
  if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
