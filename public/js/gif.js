// Renders a sculpture to an animated GIF: it builds up stroke by stroke, then does a full 360° spin.

import { GIFEncoder, quantize, applyPalette } from '/vendor/gifenc/gifenc.esm.js';
import { Sculpture } from './scene.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * @param {{word:string, drawerName:string, strokes:Array}} entry
 * @returns {Promise<Blob>}
 */
export async function sculptureGif(entry, { size = 320, buildFrames = 16, spinFrames = 32, delay = 75 } = {}) {
  const glCanvas = document.createElement('canvas');
  glCanvas.width = size;
  glCanvas.height = size;
  const sc = new Sculpture(glCanvas, { mode: 'spin', offscreen: true, width: size, height: size });
  sc.hideAvatar = true;
  sc.floor.material.opacity = 0.35;

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const gif = GIFEncoder();

  // Lock the framing to the finished sculpture so the build-up doesn't zoom around.
  sc.load(entry.strokes);
  const center = sc.bbox.isEmpty() ? null : sc.bbox.getCenter(sc.target.clone());
  if (center) sc.lockedFrame = { center, size: Math.max(0.55, sc.bbox.getSize(center.clone()).length() / 2) };

  // Build one palette from the finished sculpture and reuse it for every frame (much faster than per-frame).
  sc.fixedView = { az: 0.4, el: 0.2 };
  sc.step(0.05, 500);
  ctx.drawImage(glCanvas, 0, 0);
  drawCaption(ctx, size, entry);
  const palette = quantize(ctx.getImageData(0, 0, size, size).data, 256);

  const total = entry.strokes.reduce((n, s) => n + s.pts.length / 3, 0) || 1;
  let fakeNow = 1000;
  const frames = buildFrames + spinFrames;

  for (let f = 0; f < frames; f++) {
    if (f < buildFrames) {
      // Partial sculpture: the first N points across strokes, seen from the front.
      let left = Math.ceil(((f + 1) / buildFrames) * total);
      const partial = [];
      for (const s of entry.strokes) {
        if (left <= 0) break;
        const take = Math.min(s.pts.length / 3, left);
        partial.push({ ...s, pts: s.pts.slice(0, take * 3) });
        left -= take;
      }
      sc.load(partial);
      sc.fixedView = { az: Math.sin(f / 6) * 0.25, el: 0.18 };
    } else {
      if (f === buildFrames) sc.load(entry.strokes);
      const t = (f - buildFrames) / spinFrames;
      sc.fixedView = { az: t * Math.PI * 2, el: 0.22 + Math.sin(t * Math.PI * 2) * 0.12 };
    }
    sc.step(0.05, (fakeNow += 1000));

    ctx.drawImage(glCanvas, 0, 0);
    drawCaption(ctx, size, entry);
    const { data } = ctx.getImageData(0, 0, size, size);
    const index = applyPalette(data, palette);
    const isLast = f === frames - 1;
    gif.writeFrame(index, size, size, { palette, delay: isLast ? 1200 : delay });
    if (f % 2 === 0) await nextFrame(); // keep the page responsive
  }
  gif.finish();
  sc.dispose();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

function drawCaption(ctx, size, entry) {
  const pad = Math.round(size * 0.045);
  const grad = ctx.createLinearGradient(0, size * 0.7, 0, size);
  grad.addColorStop(0, 'rgba(11,13,26,0)');
  grad.addColorStop(1, 'rgba(11,13,26,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, size * 0.7, size, size * 0.3);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#c6ff3d';
  ctx.font = `800 ${Math.round(size * 0.085)}px "Bricolage Grotesque", system-ui, sans-serif`;
  ctx.fillText(String(entry.word || '').toUpperCase(), pad, size - pad - size * 0.06, size - pad * 2);
  ctx.fillStyle = '#9aa0c8';
  ctx.font = `500 ${Math.round(size * 0.042)}px system-ui, sans-serif`;
  ctx.fillText(`sculpted in the air by ${entry.drawerName}`, pad, size - pad, size - pad * 2);

  ctx.font = `800 ${Math.round(size * 0.04)}px "Bricolage Grotesque", system-ui, sans-serif`;
  ctx.fillStyle = '#eef0ff';
  ctx.fillText('SCULPT', pad, pad + size * 0.035);
  const w = ctx.measureText('SCULPT ').width;
  ctx.fillStyle = '#ff5d73';
  ctx.fillText('&', pad + w, pad + size * 0.035);
  const w2 = ctx.measureText('& ').width;
  ctx.fillStyle = '#3de0ff';
  ctx.fillText('SPIN', pad + w + w2, pad + size * 0.035);
}
