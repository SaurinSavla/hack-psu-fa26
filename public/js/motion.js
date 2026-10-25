// Phone motion input: orientation → 3D pointing, wrist-twist → depth, and shake detection.

import * as THREE from 'three';

const DEG = Math.PI / 180;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// Rotate -90° about X so the camera looks out of the back of the phone, not the top.
const Q_BACK = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

export async function requestMotionPermission() {
  // iOS 13+ requires an explicit permission prompt, triggered from a user tap.
  const results = [];
  for (const Ev of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
    if (Ev && typeof Ev.requestPermission === 'function') {
      try {
        results.push(await Ev.requestPermission());
      } catch {
        results.push('denied');
      }
    }
  }
  if (!results.length) return window.DeviceOrientationEvent ? 'granted' : 'unsupported';
  return results.every((r) => r === 'granted') ? 'granted' : 'denied';
}

export class MotionInput {
  constructor() {
    this.hasOrientation = false;
    this.raw = { alpha: 0, beta: 90, gamma: 0 };
    this.qRaw = new THREE.Quaternion();
    this.qOut = new THREE.Quaternion();
    this.qYaw = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.q0 = new THREE.Quaternion();
    this.primed = false;
    this.shakeHandlers = [];
    this.flickHandlers = [];
    this.lastFlick = 0;
    this.peaks = [];
    this.lastShake = 0;
    this.gravity = new THREE.Vector3();
    this._onOrient = this._onOrient.bind(this);
    this._onMotion = this._onMotion.bind(this);
  }

  start() {
    window.addEventListener('deviceorientation', this._onOrient);
    window.addEventListener('devicemotion', this._onMotion);
  }

  stop() {
    window.removeEventListener('deviceorientation', this._onOrient);
    window.removeEventListener('devicemotion', this._onMotion);
  }

  onShake(fn) {
    this.shakeHandlers.push(fn);
  }

  /** A fast wrist flick (high rotation rate), used to "throw" power-ups. */
  onFlick(fn) {
    this.flickHandlers.push(fn);
  }

  _onOrient(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    this.raw.alpha = e.alpha;
    this.raw.beta = e.beta;
    this.raw.gamma = e.gamma;
    if (!this.hasOrientation) {
      this.hasOrientation = true;
      this._computeRaw();
      this.recenter();
    }
  }

  _onMotion(e) {
    let ax, ay, az;
    if (e.acceleration && e.acceleration.x != null) {
      ({ x: ax, y: ay, z: az } = e.acceleration);
    } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
      // High-pass filter out gravity.
      const g = e.accelerationIncludingGravity;
      this.gravity.x = this.gravity.x * 0.85 + g.x * 0.15;
      this.gravity.y = this.gravity.y * 0.85 + g.y * 0.15;
      this.gravity.z = this.gravity.z * 0.85 + g.z * 0.15;
      ax = g.x - this.gravity.x;
      ay = g.y - this.gravity.y;
      az = g.z - this.gravity.z;
    } else return;
    this.hasMotion = true;
    const mag = Math.hypot(ax, ay, az);
    const now = performance.now();
    const rr = e.rotationRate;
    if (rr && rr.alpha != null) {
      const spin = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0); // degrees per second
      if (spin > 320 && now - this.lastFlick > 900) {
        this.lastFlick = now;
        this.flickHandlers.forEach((fn) => fn());
      }
    }
    if (mag > 15) {
      const last = this.peaks[this.peaks.length - 1] || 0;
      if (now - last > 70) this.peaks.push(now);
    }
    this.peaks = this.peaks.filter((t) => now - t < 900);
    if (this.peaks.length >= 3 && now - this.lastShake > 1500) {
      this.lastShake = now;
      this.peaks = [];
      this.shakeHandlers.forEach((fn) => fn());
    }
  }

  _computeRaw() {
    const { alpha, beta, gamma } = this.raw;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * DEG;
    this.euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
    this.qRaw.setFromEuler(this.euler);
    this.qRaw.multiply(Q_BACK);
    this.qRaw.multiply(this.q0.setFromAxisAngle(Z_AXIS, -orient));
  }

  /** Make the direction the phone is pointing right now the scene's "front" (-Z). */
  recenter() {
    this._computeRaw();
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.qRaw);
    const heading = Math.atan2(-f.x, -f.z);
    this.qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading);
    this.primed = false;
  }

  /** Smoothed world orientation of the phone (camera looking out the back). */
  quaternion(dt = 1 / 60) {
    this._computeRaw();
    const target = this.qYaw.clone().multiply(this.qRaw);
    if (!this.primed) {
      this.qOut.copy(target);
      this.primed = true;
    } else {
      this.qOut.slerp(target, 1 - Math.exp(-dt * 28));
    }
    return this.qOut;
  }
}

/** Signed wrist twist (radians) around the pointing axis. Positive = clockwise, as seen by the user. */
export function twistOf(q) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const r = new THREE.Vector3(0, 1, 0).addScaledVector(f, -f.y);
  if (r.lengthSq() < 0.04) return null; // pointing straight up/down: undefined
  r.normalize();
  return Math.atan2(f.dot(new THREE.Vector3().crossVectors(r, u)), r.dot(u));
}
