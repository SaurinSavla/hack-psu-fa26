// Shared Three.js scene: renders air-sculpture strokes as glowing tubes and drives the cameras.
//
// Camera modes
//   'reveal'   – guessers & TV: orbit that starts edge-on (unreadable) and swings to the front view
//   'showcase' – gentle sway around the front view (end of turn)
//   'spin'     – continuous 360° turntable (podium gallery)
//   'drawer'   – camera sits at the origin and follows the phone's orientation ("magic window")
//   'peek'     – the drawer steps outside to see the sculpture from the audience's side (drag to orbit)
//
// The drawer can also spin the sculpture on a turntable to paint its sides and back. Strokes are always
// stored and sent in "sculpture space"; only the drawer's own view is rotated (see turnBy / toSculpture).

import * as THREE from 'three';

const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const IDENTITY = new THREE.Matrix4();
const tmpM1 = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();

export class Sculpture {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.mode = opts.mode || 'reveal';
    this.progressFn = () => 0;
    this.strokes = new Map(); // id -> { color, width, points: Vector3[], mesh, dirty, lastBuild }
    this.order = [];
    this.target = new THREE.Vector3(0, 0, -1);
    this.radius = 0.8;
    this.bbox = new THREE.Box3();
    this.time = 0;
    this.playbackJob = null;
    this.framing = { x: 0.5, y: 0.5, zoom: 1 };

    this.offscreen = !!opts.offscreen;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: !this.offscreen,
      preserveDrawingBuffer: this.offscreen,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(this.offscreen ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    if (this.offscreen) renderer.setClearColor(0x0b0d1a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0d1a, 0.09);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(opts.fov || 50, 1, 0.02, 100);
    this.camera.position.set(0, 0.5, 2);

    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x2a1838, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 2);
    scene.add(key);
    const rim = new THREE.PointLight(0xff5d73, 6, 8);
    rim.position.set(-2, 1, -3);
    scene.add(rim);

    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false; // driven by the turntable
    scene.add(this.root);
    this.turn = { angle: 0, target: 0, pivot: new THREE.Vector3(0, 0, -1) };
    this.turnMatrix = new THREE.Matrix4();
    this.turnInverse = new THREE.Matrix4();
    this.drawerEye = new THREE.Vector3(); // where the sculptor stands, in sculpture space

    this._buildEnvironment();
    this._buildCursor();
    this._buildGuide();
    this.setMode(this.mode);

    this._last = performance.now();
    if (this.offscreen) {
      // Used for GIF export: fixed size, no animation loop, the caller drives frames with step().
      this.renderer.setSize(opts.width, opts.height, false);
      this._w = opts.width;
      this._h = opts.height;
      this.camera.aspect = opts.width / opts.height;
      this.camera.updateProjectionMatrix();
      this.instant = true;
      return;
    }
    this._resize = this._resize.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(canvas.parentElement || canvas);
    this._resize();

    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  // ---------- environment ----------

  _buildEnvironment() {
    // Starfield for a sense of depth from any angle.
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * TAU;
      const r = 14 + Math.random() * 10;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb3ff, size: 0.06, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.7 }));
    this.scene.add(this.stars);

    // Floor rings give orientation when the camera swings around.
    const floor = new THREE.PolarGridHelper(3.2, 16, 6, 64, 0x3a3f73, 0x23264a);
    floor.position.y = -1.35;
    floor.material.transparent = true;
    floor.material.opacity = 0.55;
    this.floor = floor;
    this.scene.add(floor);

    // The drawer, represented as a little glowing orb at the origin.
    const avatar = new THREE.Group();
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })
    );
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.065, 0.078, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    halo.rotation.x = Math.PI / 2;
    avatar.add(orb, halo);
    this.avatar = avatar;
    this.avatarOrb = orb;
    this.scene.add(avatar);
  }

  _buildCursor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    this.cursor.scale.setScalar(0.03);
    this.cursor.visible = false;
    this.scene.add(this.cursor);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.ray = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.04, gapSize: 0.04, transparent: true, opacity: 0.35 }));
    this.ray.visible = false;
    this.scene.add(this.ray);
  }

  _buildGuide() {
    // Faint lat/long sphere around the drawer so they can feel the drawing surface.
    const pts = [];
    const r = 1;
    for (let lat = -60; lat <= 60; lat += 20) {
      const y = Math.sin((lat * Math.PI) / 180) * r;
      const rr = Math.cos((lat * Math.PI) / 180) * r;
      for (let i = 0; i < 72; i++) {
        const a0 = (i / 72) * TAU, a1 = ((i + 1) / 72) * TAU;
        pts.push(rr * Math.cos(a0), y, rr * Math.sin(a0), rr * Math.cos(a1), y, rr * Math.sin(a1));
      }
    }
    for (let lon = 0; lon < 360; lon += 20) {
      const a = (lon * Math.PI) / 180;
      for (let i = 0; i < 36; i++) {
        const t0 = -Math.PI / 2 + (i / 36) * Math.PI, t1 = -Math.PI / 2 + ((i + 1) / 36) * Math.PI;
        pts.push(
          Math.cos(t0) * Math.cos(a) * r, Math.sin(t0) * r, Math.cos(t0) * Math.sin(a) * r,
          Math.cos(t1) * Math.cos(a) * r, Math.sin(t1) * r, Math.cos(t1) * Math.sin(a) * r
        );
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.guide = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x6b74d6, transparent: true, opacity: 0.16, fog: false }));
    this.guide.visible = false;
    this.scene.add(this.guide);

    // "Front" marker: where everyone is watching from.
    const front = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.075, 32),
      new THREE.MeshBasicMaterial({ color: 0xc6ff3d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, fog: false })
    );
    front.position.set(0, 0, -1);
    this.frontMarker = front;
    this.frontMarker.visible = false;
    this.scene.add(front);

    // Reticle: where ink will land (drawer only).
    this.reticle = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false })
    );
    this.reticle.renderOrder = 10;
    this.reticle.scale.setScalar(0.02);
    this.reticle.visible = false;
    this.scene.add(this.reticle);
  }

  // ---------- modes & camera ----------

  setMode(mode) {
    this.mode = mode;
    const drawer = mode === 'drawer';
    this.camera.fov = drawer ? 72 : 50;
    if (drawer) this.framing = { x: 0.5, y: 0.5, zoom: 1 };
    this._applyFraming();
    this.guide.visible = drawer;
    this.frontMarker.visible = drawer;
    this.avatar.visible = !drawer;
    this.reticle.visible = drawer;
    this._applyTurn();
    if (drawer) {
      this.manual = null;
      this.camera.position.set(0, 0, 0);
      this.cursor.visible = false;
      this.ray.visible = false;
    }
  }

  /** Place the sculpture at a fraction of the screen (x, y in 0..1) and scale its distance. */
  setFraming(x = 0.5, y = 0.5, zoom = 1) {
    this.framing = { x, y, zoom };
    this._applyFraming();
  }

  _applyFraming() {
    const { x, y } = this.framing;
    const w = this._w || 1, h = this._h || 1;
    if (this.mode === 'drawer' || (x === 0.5 && y === 0.5)) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, -(x - 0.5) * w, -(y - 0.5) * h, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Let a viewer orbit the sculpture by hand (radians). Starts from the current automatic angle. */
  orbitBy(dAz, dEl) {
    if (this.mode === 'drawer') return;
    if (!this.manual) {
      const az = this._autoAz || 0, el = this._autoEl || 0.2;
      this.manual = { az, el, zoom: 1, tAz: az, tEl: el, tZoom: 1 };
    }
    this.manual.tAz += dAz;
    this.manual.tEl = Math.max(-1.35, Math.min(1.45, this.manual.tEl + dEl));
  }

  zoomBy(factor) {
    if (this.mode === 'drawer') return;
    if (!this.manual) this.orbitBy(0, 0);
    this.manual.tZoom = Math.max(0.45, Math.min(2.5, this.manual.tZoom * factor));
  }

  resetOrbit() {
    this.manual = null;
  }

  get isManual() {
    return !!this.manual;
  }

  dizzy(ms) {
    this.dizzyUntil = performance.now() + ms;
  }

  setProgressSource(fn) {
    this.progressFn = fn;
  }

  // ---------- turntable (drawer) ----------

  /** Spin the sculpture by `delta` radians around a vertical axis, so its sides and back face the drawer. */
  turnBy(delta) {
    const tr = this.turn;
    if (!tr.angle && !tr.target) {
      // Spin around the middle of what has been sculpted so far (or the usual sculpting spot).
      const c = this.bbox.isEmpty() ? new THREE.Vector3(0, 0, -1) : this.bbox.getCenter(new THREE.Vector3());
      tr.pivot.set(c.x, 0, c.z);
    }
    tr.target += delta;
  }

  resetTurn() {
    this.turn.angle = this.turn.target = 0;
    this._applyTurn();
  }

  /** A point the drawer sees (world space) in sculpture space, which is what gets stored and sent. */
  toSculpture(v) {
    return v.clone().applyMatrix4(this.turnInverse);
  }

  /** The drawer's own position in sculpture space. */
  eye() {
    return new THREE.Vector3().applyMatrix4(this.turnInverse);
  }

  _applyTurn() {
    const { angle, pivot } = this.turn;
    this.turnMatrix
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(tmpM1.makeRotationY(angle))
      .multiply(tmpM2.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    this.turnInverse.copy(this.turnMatrix).invert();
    // Only the drawer's own view is spun; everyone else (and a peeking drawer) sees the sculpture as stored.
    this.root.matrix.copy(this.mode === 'drawer' ? this.turnMatrix : IDENTITY);
    this.root.matrixWorldNeedsUpdate = true;
    if (this.mode === 'drawer') this.frontMarker.visible = Math.abs(angle) < 0.02;
  }

  _stepTurn(dt) {
    const tr = this.turn;
    if (tr.angle === tr.target) return;
    tr.angle += (tr.target - tr.angle) * (this.instant ? 1 : 1 - Math.exp(-dt * 10));
    if (Math.abs(tr.target - tr.angle) < 0.002) {
      // Settled: wrap full turns so the angle stays small.
      tr.target -= Math.round(tr.target / TAU) * TAU;
      tr.angle = tr.target;
    }
    this._applyTurn();
  }

  /** Viewers: where the sculptor stands relative to the sculpture ([x,y,z] in sculpture space, or null for the origin). */
  setDrawerEye(e) {
    if (e) this.drawerEye.set(e[0], e[1], e[2]);
    else this.drawerEye.set(0, 0, 0);
    this.avatar.position.copy(this.drawerEye);
    const pos = this.ray.geometry.attributes.position;
    pos.setXYZ(0, this.drawerEye.x, this.drawerEye.y, this.drawerEye.z);
    pos.needsUpdate = true;
    this.ray.computeLineDistances();
  }

  setDrawerQuaternion(q) {
    this.camera.quaternion.copy(q);
  }

  setReticle(pos, color, drawing) {
    this.reticle.position.copy(pos);
    this.reticle.material.color.set(color || '#ffffff');
    // Bigger when drawing, scaled with distance so it reads as depth.
    this.reticle.scale.setScalar((drawing ? 0.03 : 0.02) * Math.max(0.6, pos.length()));
  }

  setCursor(p, color, drawing) {
    if (this.mode === 'drawer' || !p) return;
    this.cursor.position.set(p[0], p[1], p[2]);
    this.cursor.material.color.set(color || '#ffffff');
    this.cursor.visible = true;
    this.cursorDrawing = drawing;
    this.cursorSeen = performance.now();
    const pos = this.ray.geometry.attributes.position;
    pos.setXYZ(1, p[0], p[1], p[2]);
    pos.needsUpdate = true;
    this.ray.computeLineDistances();
    this.ray.material.color.set(color || '#ffffff');
    this.ray.visible = true;
    this.avatarOrb.material.emissive.set(color || '#ffffff');
  }

  hideCursor() {
    this.cursor.visible = false;
    this.ray.visible = false;
  }

  /** Total number of stroke points (used to tell whether the sculpture changed). */
  inkCount() {
    let n = 0;
    for (const st of this.strokes.values()) n += st.points.length;
    return n;
  }

  /** JPEG snapshot of exactly what this view shows right now (for the Gemini rival / critic). */
  snapshot(size = 512, quality = 0.72) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const r = size / Math.max(src.width, src.height);
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * r);
    c.height = Math.round(src.height * r);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0d1a';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }

  /** Point along a camera ray (normalized device coords) at a given distance from the camera. */
  rayPoint(ndcX, ndcY, dist) {
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return this.camera.position.clone().addScaledVector(v, dist);
  }

  _updateCamera(dt) {
    if (this.mode === 'drawer') return;
    // Smoothly track the sculpture's bounds.
    const hasInk = !this.bbox.isEmpty();
    let center = hasInk ? this.bbox.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, -1);
    let size = hasInk ? this.bbox.getSize(new THREE.Vector3()).length() / 2 : 0.8;
    if (this.lockedFrame) ({ center, size } = this.lockedFrame);
    const k = this.instant ? 1 : 1 - Math.exp(-dt * 2.5);
    this.target.lerp(center, k);
    this.radius += (Math.max(0.55, size) - this.radius) * k;

    const t = this.time;
    let az, el;
    if (this.mode === 'reveal') {
      const e = smoothstep(0.04, 0.85, this.progressFn());
      az = Math.PI * 0.5 * (1 - e) + Math.sin(t * 0.55) * 0.28 * (1 - 0.6 * e);
      el = 1.22 * (1 - e) + 0.16 * e + Math.sin(t * 0.37) * 0.05;
    } else if (this.mode === 'showcase') {
      az = Math.sin(t * 0.45) * 0.65;
      el = 0.18 + Math.sin(t * 0.3) * 0.12;
    } else if (this.mode === 'peek') {
      az = 0; // straight on, as the audience will finally see it
      el = 0.2;
    } else {
      az = t * 0.55;
      el = 0.22 + Math.sin(t * 0.4) * 0.1;
    }
    this._autoAz = az;
    this._autoEl = el;
    if (this.fixedView) {
      az = this.fixedView.az;
      el = this.fixedView.el;
    }
    // A viewer who drags takes over the camera until they reset it.
    let zoom = 1;
    if (this.manual) {
      const m = this.manual;
      const kk = 1 - Math.exp(-dt * 12);
      m.az += (m.tAz - m.az) * kk;
      m.el += (m.tEl - m.el) * kk;
      m.zoom += (m.tZoom - m.zoom) * kk;
      az = m.az;
      el = m.el;
      zoom = m.zoom;
    }
    // "Dizzy" power-up: the camera spins out of control for a few seconds.
    if (this.dizzyUntil && performance.now() < this.dizzyUntil) {
      az += t * 7;
      el += Math.sin(t * 9) * 0.6;
      zoom *= 1 + Math.sin(t * 5) * 0.35;
    }
    // Fit the sculpture in whichever field of view is narrower (portrait phones are tall & thin).
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fov = Math.min(vfov, hfov);
    const dist = Math.max(1.4, (this.radius / Math.sin(fov / 2)) * 1.12) * this.framing.zoom * zoom;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    this.camera.position.copy(this.target).addScaledVector(dir, dist);
    this.camera.lookAt(this.target);
    // Hide the drawer orb if the camera is about to clip through it.
    this.avatar.visible = !this.hideAvatar && this.camera.position.distanceTo(this.avatar.position) > 0.35;
  }

  // ---------- strokes ----------

  addStroke({ id, color, width, pts }) {
    if (this.strokes.has(id)) this.removeStroke(id);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.15,
    });
    const s = { id, color, width: width || 0.02, points: [], mesh: new THREE.Mesh(new THREE.BufferGeometry(), mat), dirty: true, lastBuild: 0 };
    this.root.add(s.mesh);
    this.strokes.set(id, s);
    this.order.push(id);
    if (pts && pts.length) this.appendPoints(id, pts);
    return s;
  }

  appendPoints(id, pts) {
    const s = this.strokes.get(id);
    if (!s) return;
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const v = new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]);
      s.points.push(v);
      this.bbox.expandByPoint(v);
    }
    s.dirty = true;
  }

  removeStroke(id) {
    const s = this.strokes.get(id);
    if (!s) return;
    this.root.remove(s.mesh);
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
    this.strokes.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this._recomputeBounds();
  }

  undoLast() {
    const id = this.order[this.order.length - 1];
    if (id) this.removeStroke(id);
    return id;
  }

  clear() {
    this.cancelPlayback();
    for (const id of [...this.strokes.keys()]) {
      const s = this.strokes.get(id);
      this.root.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    this.strokes.clear();
    this.order = [];
    this.bbox.makeEmpty();
  }

  load(list) {
    this.clear();
    (list || []).forEach((s, i) => this.addStroke({ ...s, id: s.id || `s${i}` }));
  }

  /** Re-draw a finished sculpture stroke by stroke over `ms` milliseconds. */
  playback(list, ms = 4000) {
    this.clear();
    const total = list.reduce((n, s) => n + s.pts.length / 3, 0) || 1;
    const job = { list, ms, start: performance.now(), done: 0, idx: 0, offset: 0, total };
    list.forEach((s, i) => this.addStroke({ id: `p${i}`, color: s.color, width: s.width, pts: [] }));
    this.playbackJob = job;
  }

  cancelPlayback() {
    this.playbackJob = null;
  }

  _stepPlayback() {
    const job = this.playbackJob;
    if (!job) return;
    const want = Math.min(job.total, Math.floor(((performance.now() - job.start) / job.ms) * job.total));
    while (job.done < want && job.idx < job.list.length) {
      const s = job.list[job.idx];
      const n = s.pts.length / 3;
      const take = Math.min(n - job.offset, want - job.done);
      this.appendPoints(`p${job.idx}`, s.pts.slice(job.offset * 3, (job.offset + take) * 3));
      job.offset += take;
      job.done += take;
      if (job.offset >= n) {
        job.idx++;
        job.offset = 0;
      }
    }
    if (job.done >= job.total) this.playbackJob = null;
  }

  _recomputeBounds() {
    this.bbox.makeEmpty();
    for (const s of this.strokes.values()) for (const v of s.points) this.bbox.expandByPoint(v);
  }

  _rebuild(s, now) {
    // Throttle rebuilds of long, actively-growing strokes.
    if (s.points.length > 120 && now - s.lastBuild < 60) return;
    s.dirty = false;
    s.lastBuild = now;
    const old = s.mesh.geometry;
    let geo;
    const pts = s.points;
    if (pts.length === 0) {
      geo = new THREE.BufferGeometry();
    } else if (pts.length === 1 || (pts.length === 2 && pts[0].distanceTo(pts[1]) < 1e-4)) {
      geo = new THREE.SphereGeometry(s.width * 1.2, 16, 12);
      geo.translate(pts[0].x, pts[0].y, pts[0].z);
    } else {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const segs = Math.min(900, Math.max(8, pts.length * 3));
      geo = new THREE.TubeGeometry(curve, segs, s.width, 7, false);
    }
    s.mesh.geometry = geo;
    old.dispose();
  }

  // ---------- loop ----------

  _resize() {
    const el = this.canvas.parentElement || this.canvas;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this._w = w;
    this._h = h;
    this.camera.aspect = w / h;
    this._applyFraming();
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    this.step(dt, now);
  }

  /** Advance one frame and render it. */
  step(dt, now = performance.now()) {
    this.time += dt;
    this._stepPlayback();
    this._stepTurn(dt);
    for (const s of this.strokes.values()) if (s.dirty) this._rebuild(s, now);
    if (this.cursor.visible) {
      const pulse = this.cursorDrawing ? 0.045 + Math.sin(this.time * 14) * 0.008 : 0.03;
      this.cursor.scale.setScalar(pulse);
      if (now - this.cursorSeen > 1500) this.hideCursor();
    }
    this.stars.rotation.y += dt * 0.01;
    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro?.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
