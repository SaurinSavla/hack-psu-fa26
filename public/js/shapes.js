// Solid 3D shapes the sculptor can stamp into a sculpture.
// Every geometry is built once, centred, and sized to fit roughly in a 1×1×1 box; a placed shape is
// that geometry scaled by its size `k` and rotated by its quaternion `q`.

import * as THREE from 'three';

const TAU = Math.PI * 2;

function extrude(shape, depth = 0.3) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 24 });
  return g;
}

function starShape(points = 5, outer = 0.5, inner = 0.22) {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return s;
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.42);
  s.bezierCurveTo(-0.08, -0.32, -0.5, -0.1, -0.5, 0.15);
  s.bezierCurveTo(-0.5, 0.42, -0.2, 0.5, 0, 0.3);
  s.bezierCurveTo(0.2, 0.5, 0.5, 0.42, 0.5, 0.15);
  s.bezierCurveTo(0.5, -0.1, 0.08, -0.32, 0, -0.42);
  return s;
}

function crescentShape() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.5, Math.PI * 0.35, Math.PI * 1.65, false);
  s.absarc(0.2, 0, 0.4, Math.PI * 1.55, Math.PI * 0.45, true);
  return s;
}

function lathe(points, segs = 40) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

class Helix extends THREE.Curve {
  getPoint(t, target = new THREE.Vector3()) {
    const turns = 4;
    const a = t * TAU * turns;
    return target.set(Math.cos(a) * 0.32, t - 0.5, Math.sin(a) * 0.32);
  }
}

// [id, label, icon, builder]
export const SHAPES = [
  ['cube', 'Cube', '⬛', () => new THREE.BoxGeometry(1, 1, 1)],
  ['cuboid', 'Cuboid', '▬', () => new THREE.BoxGeometry(1.6, 0.8, 0.8)],
  ['sphere', 'Sphere', '⚪', () => new THREE.SphereGeometry(0.5, 32, 20)],
  ['pyramid', 'Pyramid', '🔺', () => new THREE.ConeGeometry(0.62, 1, 4).rotateY(Math.PI / 4)],
  ['cylinder', 'Cylinder', '🥫', () => new THREE.CylinderGeometry(0.45, 0.45, 1, 36)],
  ['cone', 'Cone', '🍦', () => new THREE.ConeGeometry(0.5, 1, 36)],
  ['tube', 'Tube', '⭕', () => lathe([[0.33, -0.5], [0.5, -0.5], [0.5, 0.5], [0.33, 0.5], [0.33, -0.5]], 40)],
  ['board', 'Board', '▭', () => new THREE.BoxGeometry(1.3, 0.06, 1.3)],
  ['wall', 'Wall', '▯', () => new THREE.BoxGeometry(1.3, 1.3, 0.06)],
  ['dome', 'Dome', '◓', () => lathe([[0, 0.5], ...Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * (Math.PI / 2); return [Math.sin(a) * 0.6, Math.cos(a) * 0.6 - 0.1]; }), [0, -0.1]], 40)],
  ['torus', 'Ring', '🍩', () => new THREE.TorusGeometry(0.38, 0.13, 18, 48).rotateX(Math.PI / 2)],
  ['capsule', 'Capsule', '💊', () => new THREE.CapsuleGeometry(0.28, 0.5, 8, 20)],
  ['egg', 'Egg', '🥚', () => lathe(Array.from({ length: 25 }, (_, i) => { const t = i / 24; const y = -0.5 + t; const r = Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2))) * (0.36 + 0.1 * (1 - t)); return [Math.max(r, 0.0001), y]; }), 40)],
  ['prism', 'Prism', '🔼', () => new THREE.CylinderGeometry(0.55, 0.55, 1, 3)],
  ['hexprism', 'Hexagon', '⬢', () => new THREE.CylinderGeometry(0.5, 0.5, 0.6, 6)],
  ['wedge', 'Ramp', '◢', () => { const s = new THREE.Shape(); s.moveTo(-0.5, -0.4); s.lineTo(0.5, -0.4); s.lineTo(0.5, 0.4); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); }],
  ['arch', 'Arch', '🌈', () => new THREE.TorusGeometry(0.42, 0.12, 14, 32, Math.PI)],
  ['tetra', 'Tetra', '🔻', () => new THREE.TetrahedronGeometry(0.6)],
  ['diamond', 'Diamond', '🔷', () => new THREE.OctahedronGeometry(0.55)],
  ['gem', 'Gem', '💎', () => new THREE.IcosahedronGeometry(0.55, 0)],
  ['star', 'Star', '⭐', () => extrude(starShape(), 0.22)],
  ['heart', 'Heart', '❤️', () => extrude(heartShape(), 0.22)],
  ['crescent', 'Moon', '🌙', () => extrude(crescentShape(), 0.2)],
  ['knot', 'Knot', '🪢', () => new THREE.TorusKnotGeometry(0.3, 0.09, 120, 14)],
  ['spring', 'Spring', '🌀', () => new THREE.TubeGeometry(new Helix(), 160, 0.05, 10, false)],
];

const cache = new Map();

/** Shared, centred geometry for a shape type, plus how far its base sits below its centre. */
export function shapeGeometry(type) {
  if (cache.has(type)) return cache.get(type);
  const def = SHAPES.find((s) => s[0] === type) || SHAPES[0];
  const geo = def[3]();
  geo.computeBoundingBox();
  geo.center();
  geo.computeBoundingBox();
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const entry = { geo, halfHeight: -geo.boundingBox.min.y, halfDepth: geo.boundingBox.max.z, radius: geo.boundingSphere.radius, edges: new THREE.EdgesGeometry(geo, 28) };
  cache.set(type, entry);
  return entry;
}

/** A mesh for a placed shape (geometry is shared; dispose only the materials). */
export function makeShapeMesh(type, color, { ghost = false } = {}) {
  const { geo, edges } = shapeGeometry(type);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: ghost ? 0.5 : 0.28,
    roughness: 0.45,
    metalness: 0.1,
    transparent: ghost,
    opacity: ghost ? 0.55 : 1,
    side: THREE.DoubleSide,
    flatShading: ['cube', 'cuboid', 'pyramid', 'prism', 'hexprism', 'wedge', 'tetra', 'diamond', 'gem', 'board', 'wall'].includes(type),
  });
  const mesh = new THREE.Mesh(geo, mat);
  const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: ghost ? 0.5 : 0.28 }));
  lines.raycast = () => {}; // only the solid surface is a drawing target
  mesh.add(lines);
  mesh.userData.isShape = true;
  return mesh;
}
