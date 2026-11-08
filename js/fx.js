/**
 * Ash & Oath — effects: pooled particles, shockwave rings, projectiles.
 */
import * as THREE from '../vendor/three.module.js';
import { dotTexture, rand, clamp, glowSprite } from './util.js';

export class Particles {
  constructor(scene, max = 600) {
    this.max = max;
    this.cursor = 0;
    this.items = new Array(max).fill(null).map(() => ({ life: 0, max: 1 }));
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.19, map: dotTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.geo = geo;
    this._c = new THREE.Color();
  }

  emit(x, y, z, hex, opts = {}) {
    const {
      count = 8, speed = 2.4, spread = 1, up = 1.2, life = 0.7,
      gravity = -5, drag = 2.2, size = 1, warm = false, dir = null,
    } = opts;
    this._c.setHex(hex);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.items[i];
      p.life = p.max = life * rand(1.2, 0.6);
      if (dir) {
        p.vx = dir.x * speed * rand(1.2, 0.5) + rand(spread, -spread) * 0.5;
        p.vz = dir.z * speed * rand(1.2, 0.5) + rand(spread, -spread) * 0.5;
      } else {
        const a = Math.random() * Math.PI * 2;
        const rs = speed * rand(1.0, 0.25);
        p.vx = Math.cos(a) * rs + rand(spread, -spread) * 0.35;
        p.vz = Math.sin(a) * rs + rand(spread, -spread) * 0.35;
      }
      p.vy = up * rand(1.3, 0.35);
      p.x = x + rand(0.2, -0.2); p.y = y + rand(0.2, -0.2); p.z = z + rand(0.2, -0.2);
      p.g = gravity; p.drag = drag;
      const tint = rand(1.25, 0.85) * size;
      p.r = Math.min(1, this._c.r * tint); p.g2 = Math.min(1, this._c.g * tint); p.b = Math.min(1, this._c.b * tint);
    }
  }

  update(dt) {
    const pos = this.pos, col = this.col;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { pos[i * 3 + 1] = -9999; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      p.vy += p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = clamp(p.life / p.max, 0, 1);
      const fade = k * k * (3 - 2 * k);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * fade; col[i * 3 + 1] = p.g2 * fade; col[i * 3 + 2] = p.b * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class Shockwaves {
  constructor(scene, count = 8) {
    this.items = [];
    const geo = new THREE.RingGeometry(0.86, 1, 56);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9fe8d8, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.items.push({ mesh: m, t: 0, dur: 1, maxR: 5 });
    }
    this.cursor = 0;
  }
  spawn(x, y, z, hex, maxR = 5, dur = 0.5) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.mesh.position.set(x, y + 0.12, z);
    it.mesh.material.color.setHex(hex);
    it.mesh.material.opacity = 0.7;
    it.mesh.scale.setScalar(0.4);
    it.mesh.visible = true;
    it.t = 0; it.dur = dur; it.maxR = maxR;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt;
      const k = clamp(it.t / it.dur, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      it.mesh.scale.setScalar(0.4 + e * it.maxR);
      it.mesh.material.opacity = 0.65 * (1 - k) * (1 - k);
      if (k >= 1) it.mesh.visible = false;
    }
  }
}

/* A tiny glowing ember bolt used by the wisps. */
export class Bolts {
  constructor(scene, count = 12) {
    this.items = [];
    const geo = new THREE.IcosahedronGeometry(0.17, 1);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb877 });
      const core = new THREE.Mesh(geo, mat);
      const glow = glowSprite(0xff9a4d, 1.6, 0.9);
      core.add(glow);
      core.visible = false;
      core.renderOrder = 4;
      scene.add(core);
      this.items.push({ mesh: core, alive: false, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    this.cursor = 0;
  }
  spawn(origin, target, speed = 9) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.mesh.visible = true;
    it.mesh.position.copy(origin);
    const d = new THREE.Vector3().subVectors(target, origin).normalize();
    it.vx = d.x * speed; it.vy = d.y * speed + 0.5; it.vz = d.z * speed;
    it.life = 4;
    it.alive = true;
    return it;
  }
  update(dt) {
    const out = [];
    for (const it of this.items) {
      if (!it.alive) continue;
      it.life -= dt;
      it.vy -= 1.6 * dt;
      it.mesh.position.x += it.vx * dt;
      it.mesh.position.y += it.vy * dt;
      it.mesh.position.z += it.vz * dt;
      if (it.life <= 0 || it.mesh.position.y < -2) { it.alive = false; it.mesh.visible = false; out.push(it); }
    }
    return out;
  }
}
