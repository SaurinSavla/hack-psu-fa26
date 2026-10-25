// "64" theme for the 3D scene: chunky low-resolution pixels, flat-shaded low-poly strokes and shapes,
// a checkerboard floor and a deep blue sky. It patches the Sculpture class before any page creates one,
// so the TV, the phones and the GIF export all pick it up.
// To turn the theme off, remove the theme-64 <script> and <link> tags from host.html and play.html.

import * as THREE from 'three';
import { Sculpture } from './scene.js';

const SKY = 0x0a0f33;
const PIXEL_SCALE = 0.55; // render at about half the screen resolution, then scale up without smoothing

function checkerFloor(radius) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#2a44c4' : '#141c55';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  // An octagon instead of a smooth circle: low-poly, like the era.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.28, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  return floor;
}

const proto = Sculpture.prototype;

const buildEnvironment = proto._buildEnvironment;
if (buildEnvironment) {
  proto._buildEnvironment = function () {
    buildEnvironment.call(this);
    this.scene.fog?.color.setHex(SKY);
    if (this.offscreen) this.renderer.setClearColor(SKY, 1);
    if (this.stars) this.stars.material.size = 0.1; // bigger, blockier stars
    if (this.floor) {
      const floor = checkerFloor(3.2);
      floor.position.copy(this.floor.position);
      this.scene.remove(this.floor);
      this.floor = floor;
      this.scene.add(floor);
    }
  };
}

const addStroke = proto.addStroke;
if (addStroke) {
  proto.addStroke = function (...args) {
    const s = addStroke.apply(this, args);
    const mat = s?.mesh?.material;
    if (mat && !Array.isArray(mat)) {
      mat.flatShading = true; // faceted tubes and shapes instead of smooth ones
      mat.needsUpdate = true;
    }
    return s;
  };
}

const resize = proto._resize;
if (resize) {
  proto._resize = function () {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * PIXEL_SCALE);
    resize.call(this);
  };
}
