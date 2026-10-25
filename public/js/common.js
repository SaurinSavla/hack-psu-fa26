// Small helpers shared by the host and phone pages.

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function initials(name) {
  // Only use parts that start with a letter or digit (skips emoji like "🤖"), and whole characters.
  const parts = String(name || '?').trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  if (!parts.length) return '?';
  const first = (w, n = 1) => Array.from(w).slice(0, n).join('');
  return (parts.length > 1 ? first(parts[0]) + first(parts[1]) : first(parts[0], 2)).toUpperCase();
}

export function avatar(p, extraClass = '') {
  return `<div class="avatar ${extraClass}" style="--c:${esc(p.color)}">${p.isAI ? '🤖' : esc(initials(p.name))}</div>`;
}

export function renderMask(el, mask) {
  if (!mask) {
    el.innerHTML = '';
    return;
  }
  // `mask` is a string ("g_r_ffe") or an array whose "*x" entries are secret letters only this player sees.
  el.innerHTML = [...mask]
    .map((c) => {
      if (c === ' ') return '<span class="sp"></span>';
      if (c === '_') return '<span class="ch"></span>';
      if (c.length === 2 && c[0] === '*') return `<span class="ch secret">${esc(c[1])}</span>`;
      return `<span class="ch shown">${esc(c)}</span>`;
    })
    .join('');
}

export function pips(d) {
  return `<span class="pips">${[1, 2, 3].map((i) => `<i class="${i <= d ? 'on' : ''}"></i>`).join('')}</span>`;
}

/** Tracks a server phase deadline using local time (avoids clock skew between devices). */
export class PhaseClock {
  constructor() {
    this.endsAt = 0;
    this.duration = 0;
  }
  sync(state) {
    this.duration = state.durationMs || 0;
    this.endsAt = performance.now() + (state.remainingMs || 0);
  }
  remaining() {
    return Math.max(0, this.endsAt - performance.now());
  }
  progress() {
    return this.duration ? 1 - this.remaining() / this.duration : 0;
  }
}

export function setTimer(el, textEl, clock) {
  const rem = clock.remaining();
  const secs = Math.ceil(rem / 1000);
  textEl.textContent = secs;
  el.style.setProperty('--p', clock.duration ? rem / clock.duration : 0);
  el.classList.toggle('low', secs <= 10 && secs > 0);
  return secs;
}

/** A procedurally generated sculpture for the lobby: a spiral tree with a star on top. */
export function demoStrokes() {
  const strokes = [];
  const helix = [];
  for (let i = 0; i <= 260; i++) {
    const t = i / 260;
    const a = t * Math.PI * 2 * 5;
    const r = 0.55 * (1 - t) + 0.04;
    helix.push(Math.cos(a) * r, -0.85 + t * 1.45, -1 + Math.sin(a) * r);
  }
  strokes.push({ color: '#3dffa8', width: 0.022, pts: helix });
  const trunk = [];
  for (let i = 0; i <= 10; i++) trunk.push(0, -1.15 + i * 0.03, -1);
  strokes.push({ color: '#ffb53d', width: 0.05, pts: trunk });
  const star = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2 * 2) / 5;
    star.push(Math.cos(a) * 0.16, 0.78 + Math.sin(a) * 0.16, -1);
  }
  strokes.push({ color: '#ffe53d', width: 0.02, pts: star });
  const colors = ['#ff5d73', '#3de0ff', '#a77bff', '#ff7ad9'];
  for (let k = 0; k < 9; k++) {
    const t = 0.12 + (k / 9) * 0.7;
    const a = k * 2.4;
    const r = 0.55 * (1 - t) + 0.07;
    const x = Math.cos(a) * r, y = -0.85 + t * 1.45, z = -1 + Math.sin(a) * r;
    strokes.push({ color: colors[k % colors.length], width: 0.045, pts: [x, y, z] });
  }
  return strokes;
}
