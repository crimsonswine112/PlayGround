/**
 * Ash & Oath — procedural valley: sky, terrain, water, forest, camp, shrine.
 */
import * as THREE from '../vendor/three.module.js';
import {
  QUALITY, COLORS, WATER_Y, START, KEEPER_POS, SHRINE_POS, BRIDGE,
  TAU, clamp, lerp, smoothstep, rand, seeded, pathDist, streamDist,
  terrainHeight, groundHeight, STREAM_SAMPLES, PATH_SAMPLES,
  glowSprite, glowTexture, shadowBlob,
} from './util.js';

export const SUN_DIR = new THREE.Vector3(-0.52, 0.31, -0.7).normalize();

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ *
 *  Sky
 * ------------------------------------------------------------------ */
function buildSky(scene) {
  const geo = new THREE.SphereGeometry(330, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR.clone() },
      uMoon: { value: new THREE.Vector3(0.5, 0.42, -0.76).normalize() },
      cTop: { value: new THREE.Color(COLORS.skyTop) },
      cMid: { value: new THREE.Color(COLORS.skyMid) },
      cHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
      cSun: { value: new THREE.Color(COLORS.sun) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSun, uMoon, cTop, cMid, cHorizon, cSun;
      varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(cHorizon, cMid, smoothstep(-0.02, 0.2, h));
        col = mix(col, cTop, smoothstep(0.18, 0.8, h));
        float sd = max(dot(d, uSun), 0.0);
        col += cSun * pow(sd, 420.0) * 3.2;
        col += cSun * pow(sd, 18.0) * 0.38;
        col += cSun * pow(sd, 4.0) * 0.06;
        // A pale rising moon on the eastern shoulder of the vale.
        float md = max(dot(d, uMoon), 0.0);
        col += vec3(0.78, 0.9, 1.0) * smoothstep(0.99925, 0.99965, md) * 2.4;
        col += vec3(0.5, 0.68, 0.85) * pow(md, 90.0) * 0.3;
        // A few dusk stars high above the vale.
        vec3 sp = floor(d * 260.0);
        float st = hash(sp);
        float tw = 0.65 + 0.35 * sin(uTime * 1.4 + hash(sp + 3.1) * 30.0);
        col += vec3(0.72, 0.84, 0.92) * step(0.9984, st) * smoothstep(0.22, 0.55, h) * tw;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  return { sky, mat };
}

/* ------------------------------------------------------------------ *
 *  Distant mountains + skirt
 * ------------------------------------------------------------------ */
function ridgeRing(innerR, outerR, baseY, minH, maxH, seed, hexInner, hexOuter, segments = 140) {
  const rng = seeded(seed);
  const p1 = rng() * TAU, p2 = rng() * TAU, p3 = rng() * TAU;
  const ci = new THREE.Color(hexInner), co = new THREE.Color(hexOuter);
  const positions = [], colors = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    const wave = 0.5 + 0.3 * Math.sin(a * 2.3 + p1) + 0.15 * Math.sin(a * 5.7 + p2) + 0.07 * Math.sin(a * 11.3 + p3);
    const h = minH + (maxH - minH) * clamp(wave, 0, 1);
    const ca = Math.cos(a), sa = Math.sin(a);
    positions.push(ca * innerR, baseY, sa * innerR);
    positions.push(ca * outerR, baseY + h, sa * outerR);
    const t = clamp((h - minH) / Math.max(1, maxH - minH), 0, 1);
    const cInner = ci.clone().multiplyScalar(0.82);
    const cOuter = ci.clone().lerp(co, 0.35 + t * 0.65);
    colors.push(cInner.r, cInner.g, cInner.b, cOuter.r, cOuter.g, cOuter.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const idx = [];
  for (let i = 0; i < segments; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ *
 *  Terrain
 * ------------------------------------------------------------------ */
function buildTerrain(scene) {
  const size = 214, seg = QUALITY.terrainSeg;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color(0x24371f), light = new THREE.Color(0x55693a);
  const heather = new THREE.Color(0x594b52), path = new THREE.Color(0x8f7c56);
  const mud = new THREE.Color(0x3d4133), rock = new THREE.Color(0x5b5d49);
  const c = new THREE.Color();
  const shrineTint = new THREE.Color(0x767250);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    const patch = (Math.sin(x * 0.22 + 1.7) + Math.sin(z * 0.19 - 0.4) + Math.sin((x + z) * 0.11) + 3) / 6;
    c.copy(dark).lerp(light, clamp(patch * 1.15, 0, 1));
    const hp = Math.sin(x * 0.087 + 2.1) * Math.sin(z * 0.075 - 1.2);
    if (hp > 0.34) c.lerp(heather, smoothstep(0.34, 0.75, hp) * 0.42);
    const dp = pathDist(x, z);
    if (dp < 3.6) c.lerp(path, smoothstep(3.6, 0.8, dp) * 0.95);
    const ds = streamDist(x, z);
    if (ds < 9.5) c.lerp(mud, smoothstep(9.5, 4.4, ds) * 0.85);
    if (y > 3.4) c.lerp(rock, smoothstep(3.4, 5.8, y) * 0.5);
    const shrineD = Math.hypot(x - SHRINE_POS.x, z - SHRINE_POS.z);
    if (shrineD < 13) c.lerp(shrineTint, smoothstep(13, 4, shrineD) * 0.45);
    const jitter = 0.92 + ((Math.sin(x * 12.9 + z * 7.3) * 0.5 + 0.5) * 0.16);
    colors[i * 3] = c.r * jitter; colors[i * 3 + 1] = c.g * jitter; colors[i * 3 + 2] = c.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ *
 *  Water ribbon
 * ------------------------------------------------------------------ */
function buildWater(scene) {
  const pts = STREAM_SAMPLES;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    const w = 3.0 + Math.sin(i * 0.21) * 0.55 + Math.sin(i * 0.07) * 0.45;
    positions.push(pts[i].x - nx * w, WATER_Y, pts[i].z - nz * w);
    positions.push(pts[i].x + nx * w, WATER_Y, pts[i].z + nz * w);
    uvs.push(0, i * 0.12, 1, i * 0.12);
    if (i < pts.length - 1) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x31524f) },
        uShallow: { value: new THREE.Color(0x67897a) },
        uSun: { value: new THREE.Color(0xffd39a) },
        uSunDir: { value: SUN_DIR.clone() },
      },
    ]),
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec3 p = position;
        p.y += sin(p.x * 1.7 + uTime * 1.2) * 0.016 + sin(p.z * 2.4 - uTime * 0.8) * 0.012;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uSun, uSunDir;
      varying vec3 vWorld;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 2.2);
        float r1 = sin(vWorld.x * 2.2 + uTime * 1.1) * 0.5 + 0.5;
        float r2 = sin(vWorld.z * 1.8 - uTime * 0.85 + sin(vWorld.x * 0.6)) * 0.5 + 0.5;
        float ripple = r1 * r2;
        vec3 col = mix(uDeep, uShallow, 0.2 + fres * 0.55 + ripple * 0.22);
        float streak = pow(max(0.0, 1.0 - abs(vWorld.x * 0.045 + 0.4)), 5.0);
        col += uSun * streak * 0.10 * (0.6 + ripple);
        float glint = pow(ripple, 26.0);
        col += uSun * glint * 0.5;
        gl_FragColor = vec4(col, 0.87);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, mat };
}

/* ------------------------------------------------------------------ *
 *  Instancing helpers
 * ------------------------------------------------------------------ */
/* Merge transformed geometry copies into one buffer. */
function mergeParts(parts) {
  const geos = [];
  for (const part of parts) {
    const g = part.geo.clone();
    if (part.scale) g.scale(part.scale[0], part.scale[1], part.scale[2]);
    if (part.pos) g.translate(part.pos[0], part.pos[1], part.pos[2]);
    geos.push(g);
  }
  const positions = [], normals = [], uvs = [], indices = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, idx = g.index;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      if (u) uvs.push(u.getX(i), u.getY(i));
    }
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) indices.push(i + offset);
    offset += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/* Merge a few crossed, slightly bent blades into one tuft geometry. */
function tuftGeometry(bladeW, bladeH, blades, lean = 0.06) {
  const geos = [];
  for (let i = 0; i < blades; i++) {
    const g = new THREE.PlaneGeometry(bladeW, bladeH, 1, 3);
    g.translate(0, bladeH / 2, 0);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const y = p.getY(j);
      p.setX(j, p.getX(j) + (y / bladeH) ** 2 * lean);
    }
    g.rotateY(i * Math.PI / blades);
    geos.push(g);
  }
  const positions = [], normals = [], uvs = [], indices = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, idx = g.index;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(u.getX(i), u.getY(i));
    }
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    offset += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

const dummy = new THREE.Object3D();
function fillInstance(mesh, i, x, y, z, rot, sx, sy, sz) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rot, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

let _grassTexture = null;
function grassTexture() {
  if (_grassTexture) return _grassTexture;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.lineCap = 'round';
  const r = seeded(3311);
  for (let i = 0; i < 26; i++) {
    const bx = 8 + r() * 112;
    const tx = bx + (r() - 0.5) * 40;
    const ty = 6 + r() * 54;
    const cx = bx + (r() - 0.5) * 18;
    const cy = 60 + r() * 24;
    const w = 1.4 + r() * 2.8;
    const shade = 200 + r() * 50;
    g.strokeStyle = `rgba(${shade},${shade + 20},${shade - 35},${0.75 + r() * 0.25})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(bx, 128);
    g.quadraticCurveTo(cx, cy, tx, ty);
    g.stroke();
    if (r() > 0.7) {
      g.fillStyle = `rgba(${shade + 20},${shade + 30},${shade - 20},0.85)`;
      g.beginPath();
      g.ellipse(tx, ty, 1.7 + r() * 1.6, 3.5 + r() * 3, (r() - 0.5) * 0.5, 0, TAU);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  _grassTexture = tex;
  return tex;
}

function windMaterial(hex, height, map = null) {
  const timeU = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({
    color: hex, side: THREE.DoubleSide, map,
    alphaTest: map ? 0.32 : 0, transparent: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.55 + instanceMatrix[3].z * 0.71;
        float sway = sin(uTime * 1.45 + ph) * 0.15 + sin(uTime * 2.9 + ph * 1.7) * 0.045;
        float w = pow(max(position.y, 0.0) / ${height.toFixed(2)}, 1.65);
        transformed.x += sway * w;
        transformed.z += sway * 0.55 * w;
      #endif`);
  };
  mat.userData.timeU = timeU;
  return mat;
}

function cameraFade(mat, near = 2.4, far = 5.6) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vCamFade;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vCamFade = smoothstep(${near.toFixed(2)}, ${far.toFixed(2)}, distance(cameraPosition, instanceMatrix[3].xyz));
    `);
    shader.fragmentShader = 'varying float vCamFade;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if (vCamFade < 0.45) discard;
    `);
  };
  mat.customProgramCacheKey = () => `camfade-${near}-${far}`;
}

/* ------------------------------------------------------------------ *
 *  World
 * ------------------------------------------------------------------ */
export function createWorld(scene, particles) {
  const updaters = [];
  const sky = buildSky(scene);
  updaters.push((dt, t) => { sky.mat.uniforms.uTime.value = t; });

  // Ground skirt beyond the playable terrain.
  const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(320, 48),
    new THREE.MeshBasicMaterial({ color: 0x2c3a33, fog: true })
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -4.5;
  scene.add(skirt);

  const ridgeMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide });
  const ridgeNear = new THREE.Mesh(ridgeRing(99, 127, -8, 6, 19, 19, 0x1e322e, 0x3a5a52), ridgeMat);
  scene.add(ridgeNear);
  const ridgeMid = new THREE.Mesh(ridgeRing(124, 166, -10, 15, 36, 41, 0x294743, 0x4e6f67), ridgeMat);
  scene.add(ridgeMid);
  const ridgeFar = new THREE.Mesh(ridgeRing(162, 238, -14, 28, 58, 77, 0x3e5c56, 0x71877e), ridgeMat);
  scene.add(ridgeFar);

  const terrain = buildTerrain(scene);
  const water = buildWater(scene);
  updaters.push((dt, t) => { water.mat.uniforms.uTime.value = t; });

  /* --- forest ----------------------------------------------------- */
  const rng = seeded(90210);
  const treeData = [];
  const minD = (x, z) => Math.min(
    Math.hypot(x - KEEPER_POS.x, z - KEEPER_POS.z),
    Math.hypot(x - SHRINE_POS.x, z - SHRINE_POS.z),
    Math.hypot(x - START.x, z - START.z),
  );
  let attempts = 0;
  while (treeData.length < QUALITY.trees && attempts++ < 4000) {
    const x = rand(94, -94), z = rand(94, -94);
    if (pathDist(x, z) < 5.4 || streamDist(x, z) < 11.5) continue;
    if (minD(x, z) < 12) continue;
    if (Math.hypot(x, z) > 92) continue;
    if (treeData.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 17)) continue;
    treeData.push({ x, z, s: rand(1.45, 0.72), r: rand(TAU, 0), type: rng() < 0.34 ? 'conifer' : 'broad' });
  }
  const treeColliders = treeData.map(t => {
    const base = terrainHeight(t.x, t.z);
    return {
      x: t.x, z: t.z, r: 0.55 * t.s,
      canopy: 1.55 * t.s, base: base + 1.4, top: base + 6.9 * t.s,
    };
  });

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 3.5, 6);
  trunkGeo.translate(0, 1.75, 0);
  const coneGeo = new THREE.ConeGeometry(1.62, 3.5, 7);
  coneGeo.translate(0, 3.9, 0);
  const coneTopGeo = new THREE.ConeGeometry(1.08, 2.4, 7);
  coneTopGeo.translate(0, 5.7, 0);
  const broadGeo = mergeParts([
    { geo: new THREE.IcosahedronGeometry(1, 1), pos: [0, 4.15, 0], scale: [1.72, 1.38, 1.72] },
    { geo: new THREE.IcosahedronGeometry(1, 1), pos: [1.02, 3.35, 0.34], scale: [1.08, 0.82, 1.08] },
    { geo: new THREE.IcosahedronGeometry(1, 1), pos: [-0.98, 3.4, -0.28], scale: [1.0, 0.78, 1.0] },
    { geo: new THREE.IcosahedronGeometry(1, 1), pos: [0.1, 5.25, -0.12], scale: [0.94, 0.74, 0.94] },
  ]);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x66513b, roughness: 0.95, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
  cameraFade(leafMat, 2.6, 5.8);

  const broadTrees = treeData.filter(t => t.type === 'broad');
  const conifTrees = treeData.filter(t => t.type === 'conifer');
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeData.length);
  const broadLeaves = new THREE.InstancedMesh(broadGeo, leafMat, broadTrees.length);
  const coneLeaves = new THREE.InstancedMesh(coneGeo, leafMat, conifTrees.length);
  const coneTops = new THREE.InstancedMesh(coneTopGeo, leafMat, conifTrees.length);
  const leafA = new THREE.Color(), leafB = new THREE.Color();

  treeData.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z) - 0.15;
    fillInstance(trunks, i, t.x, y, t.z, t.r, t.s, t.s, t.s);
  });
  broadTrees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z) - 0.15;
    fillInstance(broadLeaves, i, t.x, y, t.z, t.r, t.s, t.s, t.s);
    leafA.setHSL(0.235 + rng() * 0.09, 0.4 + rng() * 0.16, 0.2 + rng() * 0.13);
    broadLeaves.setColorAt(i, leafA);
  });
  conifTrees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z) - 0.15;
    fillInstance(coneLeaves, i, t.x, y, t.z, t.r, t.s, t.s, t.s);
    fillInstance(coneTops, i, t.x, y, t.z, t.r + 0.35, t.s, t.s, t.s);
    const hue = 0.29 + rng() * 0.06;
    const light = 0.17 + rng() * 0.1;
    leafA.setHSL(hue, 0.36, light);
    leafB.setHSL(hue, 0.34, light + 0.05);
    coneLeaves.setColorAt(i, leafA);
    coneTops.setColorAt(i, leafB);
  });
  [trunks, broadLeaves, coneLeaves, coneTops].forEach(m => {
    m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; scene.add(m);
  });

  /* --- blossom trees near shrine -------------------------------- */
  const blossomSpots = [
    [24, -18], [42, -36], [17, -40], [6, -16], [-13, 4], [45, -10], [-39, 30],
  ];
  const blossomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, emissive: 0x2a0d10, emissiveIntensity: 0.5 });
  cameraFade(blossomMat, 2.6, 5.8);
  const blossomTrees = new THREE.InstancedMesh(broadGeo, blossomMat, blossomSpots.length);
  const blossomTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5d4937, roughness: 0.95, flatShading: true }), blossomSpots.length);
  const blossomGlows = [];
  const pinkA = new THREE.Color(0xe2a19c), pinkB = new THREE.Color(0xffd0c1);
  blossomSpots.forEach(([x, z], i) => {
    const y = terrainHeight(x, z) - 0.1;
    const s = rand(1.05, 0.78);
    fillInstance(blossomTrunks, i, x, y, z, rand(TAU, 0), s, s, s);
    fillInstance(blossomTrees, i, x, y, z, rand(TAU, 0), s, s, s);
    blossomTrees.setColorAt(i, pinkA.clone().lerp(pinkB, rand(1, 0)));
    const glow = glowSprite(0xffd9c4, 3.2, 0.16);
    glow.position.set(x, y + 4.7 * s, z);
    scene.add(glow);
    blossomGlows.push({ sprite: glow, phase: rand(TAU, 0), y: y + 4.7 * s });
  });
  [blossomTrunks, blossomTrees].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; scene.add(m); });
  updaters.push((dt, t) => {
    for (const b of blossomGlows) {
      const k = 0.13 + 0.06 * Math.sin(t * 1.1 + b.phase);
      b.sprite.material.opacity = k;
      b.sprite.position.y = b.y + Math.sin(t * 0.7 + b.phase) * 0.15;
    }
    if (particles && Math.random() < dt * 3.2) {
      const p = blossomSpots[Math.floor(Math.random() * blossomSpots.length)];
      particles.emit(p[0] + rand(1.4, -1.4), terrainHeight(p[0], p[1]) + rand(4.2, 3.2), p[1] + rand(1.4, -1.4), 0xe7b7ab, { count: 1, speed: 0.12, up: -0.25, gravity: -0.22, drag: 0.5, life: 4.5, spread: 0.18 });
    }
  });

  /* --- rocks ----------------------------------------------------- */
  const rockData = [];
  let ra = 0;
  while (rockData.length < QUALITY.rocks && ra++ < 900) {
    const angle = rand(TAU, 0), radius = rand(88, 9);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (pathDist(x, z) < 2.5) continue;
    if (minD(x, z) < 8) continue;
    const nearWater = streamDist(x, z) < 12;
    if (!nearWater && rng() > 0.45) continue;
    rockData.push({ x, z, s: rand(nearWater ? 1.4 : 0.7, nearWater ? 0.35 : 0.22), r: rand(TAU, 0) });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), rockData.length);
  const rockCol = new THREE.Color();
  rockData.forEach((r, i) => {
    fillInstance(rocks, i, r.x, terrainHeight(r.x, r.z) - r.s * 0.2, r.z, r.r, r.s * rand(1.3, 0.8), r.s * rand(0.7, 0.4), r.s * rand(1.2, 0.7));
    rockCol.setHSL(0.24, 0.06, 0.24 + rng() * 0.09);
    rocks.setColorAt(i, rockCol);
  });
  rocks.castShadow = true; rocks.receiveShadow = true; rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  /* --- grass & reeds --------------------------------------------- */
  const bladeGeo = tuftGeometry(0.56, 0.44, 3, 0.04);
  const grassMat = windMaterial(0xffffff, 0.44, grassTexture());
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, QUALITY.grass);
  const gc = new THREE.Color();
  for (let i = 0; i < QUALITY.grass; i++) {
    let x, z, ok = false, tries = 0;
    do {
      const a = rand(TAU, 0), r = Math.sqrt(Math.random()) * 76;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      ok = pathDist(x, z) > 2.2 && streamDist(x, z) > 8.4;
      tries++;
    } while (!ok && tries < 20);
    const s = rand(1.25, 0.6);
    fillInstance(grass, i, x, terrainHeight(x, z) - 0.02, z, rand(TAU, 0), s, rand(1.35, 0.65), s);
    gc.setHSL(0.21 + rand(0.09, -0.01), rand(0.52, 0.3), rand(0.5, 0.32));
    grass.setColorAt(i, gc);
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.receiveShadow = false;
  scene.add(grass);

  const reedGeo = tuftGeometry(0.34, 1.3, 2, 0.09);
  const reedMat = windMaterial(0xffffff, 1.3, grassTexture());
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, QUALITY.reeds);
  const rc = new THREE.Color();
  for (let i = 0; i < QUALITY.reeds; i++) {
    const idx = Math.floor(rng() * STREAM_SAMPLES.length);
    const p = STREAM_SAMPLES[idx];
    const a = rand(TAU, 0), off = rand(9, 5.2);
    const x = p.x + Math.cos(a) * off, z = p.z + Math.sin(a) * off * 1.2;
    const s = rand(1.5, 0.7);
    fillInstance(reeds, i, x, terrainHeight(x, z), z, rand(TAU, 0), s, rand(1.35, 0.7), s);
    rc.setHSL(rand(0.17, 0.11), rand(0.5, 0.3), rand(0.44, 0.28));
    reeds.setColorAt(i, rc);
  }
  reeds.instanceMatrix.needsUpdate = true;
  scene.add(reeds);
  updaters.push((dt, t) => {
    grassMat.userData.timeU.value = t;
    reedMat.userData.timeU.value = t;
  });

  /* --- wildflowers ----------------------------------------------- */
  const flowerCount = QUALITY.mobile ? 260 : 520;
  const flowers = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.045, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, emissive: 0x151008, emissiveIntensity: 0.5 }),
    flowerCount
  );
  const fc = new THREE.Color();
  const flowerPalette = [0xf5e8c0, 0xf0c979, 0xe4a7a0, 0xd8e7c8, 0xa8d7cc];
  for (let i = 0; i < flowerCount; i++) {
    let x, z, tries = 0;
    do {
      const a = rand(TAU, 0), r = Math.sqrt(Math.random()) * 72;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      tries++;
    } while ((pathDist(x, z) < 2.4 || streamDist(x, z) < 8.6) && tries < 20);
    const s = rand(1.1, 0.5);
    fillInstance(flowers, i, x, terrainHeight(x, z) + rand(0.42, 0.18), z, rand(TAU, 0), s, s, s);
    fc.setHex(flowerPalette[Math.floor(rng() * flowerPalette.length)]);
    flowers.setColorAt(i, fc);
  }
  flowers.instanceMatrix.needsUpdate = true;
  scene.add(flowers);

  /* --- glowing mushrooms ----------------------------------------- */
  const clusters = QUALITY.mobile ? 10 : 15;
  const perCluster = 6;
  const shroomCount = clusters * perCluster;
  const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.26, 5);
  stemGeo.translate(0, 0.13, 0);
  const capGeo = new THREE.ConeGeometry(0.19, 0.18, 7);
  capGeo.translate(0, 0.31, 0);
  const shroomStems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xc6b995, roughness: 0.9 }), shroomCount);
  const shroomCaps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x7ad8bd, emissive: 0x35a98a, emissiveIntensity: 1.8, roughness: 0.55 }), shroomCount);
  let si = 0;
  for (let c = 0; c < clusters; c++) {
    let cx, cz, tries = 0;
    do {
      const a = rand(TAU, 0), r = rand(64, 8);
      cx = Math.cos(a) * r; cz = Math.sin(a) * r;
      tries++;
    } while ((streamDist(cx, cz) < 6.2 || pathDist(cx, cz) < 2.6) && tries < 30);
    const cy = terrainHeight(cx, cz);
    for (let k = 0; k < perCluster; k++) {
      const a = rand(TAU, 0), rr = rand(1.5, 0.15);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const y = terrainHeight(x, z) - 0.03, s = rand(2.3, 0.9);
      fillInstance(shroomStems, si, x, y, z, rand(TAU, 0), s, s, s);
      fillInstance(shroomCaps, si, x, y, z, rand(TAU, 0), s, s, s);
      si++;
    }
    const glow = glowSprite(0x59d3b5, 1.7, 0.1);
    glow.position.set(cx, cy + 0.35, cz);
    scene.add(glow);
  }
  shroomStems.instanceMatrix.needsUpdate = true; shroomCaps.instanceMatrix.needsUpdate = true;
  scene.add(shroomStems, shroomCaps);

  /* --- path lanterns -------------------------------------------- */
  const lanterns = [];
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2f28, roughness: 0.8, metalness: 0.2, flatShading: true });
  const lampGlassMat = new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: 0xffa646, emissiveIntensity: 2.4, roughness: 0.4 });
  const lanternIndices = [18, 52, 88, 124, 163, 195];
  for (const idx of lanternIndices) {
    const p = PATH_SAMPLES[idx], q = PATH_SAMPLES[Math.min(idx + 1, PATH_SAMPLES.length - 1)];
    const ang = Math.atan2(q.z - p.z, q.x - p.x);
    const side = idx % 2 ? 1 : -1;
    const x = p.x + Math.cos(ang + Math.PI / 2) * 2.0 * side;
    const z = p.z + Math.sin(ang + Math.PI / 2) * 2.0 * side;
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = -ang;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 2.7, 6), postMat);
    pole.position.y = 1.35; pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), postMat);
    arm.position.set(0.3, 2.66, 0);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), lampGlassMat);
    lamp.position.set(0.62, 2.45, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.2, 4), postMat);
    cap.position.set(0.62, 2.74, 0); cap.rotation.y = Math.PI / 4;
    const glow = glowSprite(0xffb45f, 2.2, 0.5);
    glow.position.set(0.62, 2.45, 0);
    g.add(pole, arm, lamp, cap, glow);
    scene.add(g);
    lanterns.push({ group: g, glow, x, z, phase: rand(TAU, 0) });
  }
  updaters.push((dt, t) => {
    for (const l of lanterns) {
      l.glow.material.opacity = 0.42 + Math.sin(t * 7.3 + l.phase) * 0.06 + Math.sin(t * 2.1 + l.phase) * 0.05;
    }
  });

  /* --- camp ------------------------------------------------------ */
  const camp = new THREE.Group();
  camp.position.set(-26.5, 0, 27.5);
  scene.add(camp);
  const groundAt = (x, z) => terrainHeight(x, z);
  const tentX = -3.6, tentZ = 1.2;
  const tentY = groundAt(camp.position.x + tentX, camp.position.z + tentZ);
  const tent = new THREE.Mesh(
    new THREE.ConeGeometry(2.5, 2.7, 4),
    new THREE.MeshStandardMaterial({ color: 0x8a7450, roughness: 0.92, flatShading: true, side: THREE.DoubleSide })
  );
  tent.position.set(tentX, tentY + 1.32, tentZ);
  tent.rotation.y = Math.PI / 4;
  tent.castShadow = true; tent.receiveShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 5), postMat);
  pole.position.set(tentX, tentY + 1.4, tentZ);
  camp.add(tent, pole);

  const candle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), lampGlassMat);
  candle.position.set(tentX + 0.4, tentY + 0.2, tentZ + 1.9);
  camp.add(candle);
  const candleGlow = glowSprite(0xffb45f, 1.4, 0.5);
  candleGlow.position.copy(candle.position);
  camp.add(candleGlow);

  const fireX = 2.2, fireZ = 0.5;
  const fireY = groundAt(camp.position.x + fireX, camp.position.z + fireZ);
  const fireBase = new THREE.Group();
  fireBase.position.set(fireX, fireY, fireZ);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.15, 6, 14), new THREE.MeshStandardMaterial({ color: 0x4c4a41, roughness: 0.95, flatShading: true }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; ring.castShadow = true;
  fireBase.add(ring);
  const logMat = new THREE.MeshStandardMaterial({ color: 0x30241a, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 5), logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = i * Math.PI / 4;
    log.position.y = 0.16;
    fireBase.add(log);
  }
  const fireGlow = glowSprite(0xff9c4f, 5.5, 0.6);
  fireGlow.position.y = 0.55;
  const flameA = glowSprite(0xffbd6b, 1.7, 0.95); flameA.position.y = 0.62;
  const flameB = glowSprite(0xff7b32, 1.15, 0.85); flameB.position.y = 0.48;
  fireBase.add(fireGlow, flameA, flameB);
  const fireLight = new THREE.PointLight(0xff9b52, 22, 19, 2);
  fireLight.position.y = 1.15;
  fireBase.add(fireLight);
  camp.add(fireBase);

  // Crates & a barrel for a lived-in camp.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b5639, roughness: 0.95, flatShading: true });
  [[-0.2, 2.4], [0.6, 2.7]].forEach(([dx, dz], i) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), crateMat);
    crate.position.set(dx, groundAt(camp.position.x + dx, camp.position.z + dz) + 0.3, dz);
    crate.rotation.y = i * 0.5;
    crate.castShadow = true;
    camp.add(crate);
  });

  updaters.push((dt, t) => {
    const f = 0.86 + Math.sin(t * 9.3) * 0.1 + Math.sin(t * 23.7) * 0.05;
    fireLight.intensity = 20 * f;
    flameA.scale.setScalar(1.55 + f * 0.35);
    flameB.scale.setScalar(1.0 + f * 0.22);
    flameA.position.y = 0.62 + Math.sin(t * 7.1) * 0.03;
    if (particles && Math.random() < dt * 15) {
      particles.emit(camp.position.x + fireX + rand(0.16, -0.16), fireY + 0.55, camp.position.z + fireZ + rand(0.16, -0.16), 0xffb05a,
        { count: 1, speed: 0.35, up: 1.05, gravity: 0.2, drag: 0.7, life: 1.5, spread: 0.35 });
    }
  });

  /* --- shrine ---------------------------------------------------- */
  const shrineGround = terrainHeight(SHRINE_POS.x, SHRINE_POS.z);
  const shrine = new THREE.Group();
  shrine.position.set(SHRINE_POS.x, shrineGround, SHRINE_POS.z);
  scene.add(shrine);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x777663, roughness: 0.95, flatShading: true });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x4a4c40, roughness: 0.95, flatShading: true });
  const stoneGeo = new THREE.BoxGeometry(1, 1, 0.44);
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 8);
  const stoneRng = seeded(4004);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2;
    const r = 4.9;
    const h = 2.2 + stoneRng() * 1.5;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    dummy.position.set(x, h / 2 - 0.2, z);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(0.8 + stoneRng() * 0.3, h, 1);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.castShadow = true; stones.receiveShadow = true; stones.instanceMatrix.needsUpdate = true;
  shrine.add(stones);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.9, 0.75, 8), darkStone);
  pedestal.position.y = 0.36; pedestal.castShadow = true; pedestal.receiveShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 0.62, 0.6, 8), stoneMat);
  bowl.position.y = 1.02; bowl.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.075, 6, 18), new THREE.MeshStandardMaterial({ color: 0x9b8a66, roughness: 0.7, metalness: 0.2 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.3;
  shrine.add(pedestal, bowl, rim);

  const outdoorRing = new THREE.Mesh(
    new THREE.RingGeometry(3.35, 3.95, 56),
    new THREE.MeshBasicMaterial({ color: 0xe4b76f, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  outdoorRing.rotation.x = -Math.PI / 2;
  outdoorRing.position.y = 0.06;
  shrine.add(outdoorRing);

  const shrineGlow = glowSprite(0xffbb6b, 8, 0.5);
  shrineGlow.position.y = 1.9;
  const shrineFlameA = glowSprite(0xffd08a, 2.4, 0.9); shrineFlameA.position.y = 1.75;
  const shrineFlameB = glowSprite(0xff9a4a, 1.7, 0.9); shrineFlameB.position.y = 1.6;
  shrine.add(shrineGlow, shrineFlameA, shrineFlameB);
  const shrineLight = new THREE.PointLight(0xffb160, 16, 24, 2);
  shrineLight.position.y = 2.4;
  shrine.add(shrineLight);

  // Beacon column, lit when the five sparks are gathered.
  const beaconGeo = new THREE.CylinderGeometry(0.55, 1.05, 26, 10, 1, true);
  const beaconMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0xffcc7d) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main(){
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main(){
        float a = pow(1.0 - vUv.y, 2.0) * uOpacity;
        float band = 0.65 + 0.35 * sin(vUv.y * 34.0 - uTime * 2.4);
        float edge = smoothstep(0.0, 0.45, abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPos))));
        gl_FragColor = vec4(uColor * (0.8 + band * 0.22), a * edge * 0.26);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 13;
  beacon.visible = false;
  shrine.add(beacon);
  const beaconGlow = glowSprite(0xffdd9a, 14, 0);
  beaconGlow.position.y = 2.4;
  shrine.add(beaconGlow);

  const shrineState = { lit: false, mood: 'kind', t: 0, baseLight: 16 };
  updaters.push((dt, t) => {
    shrineState.t = t;
    const lit = shrineState.lit ? 1 : 0.45;
    const flick = 0.9 + Math.sin(t * 8.1) * 0.08 + Math.sin(t * 19.3) * 0.04;
    shrineLight.intensity = shrineState.baseLight * (shrineState.lit ? 1.8 : 1) * flick;
    shrineFlameA.scale.setScalar((2.1 + Math.sin(t * 6.4) * 0.18) * lit);
    shrineFlameB.scale.setScalar((1.55 + Math.sin(t * 11.7) * 0.12) * lit);
    shrineGlow.material.opacity = (shrineState.lit ? 0.72 : 0.4) * flick;
    outdoorRing.rotation.z = t * 0.06;
    outdoorRing.material.opacity = (shrineState.lit ? 0.46 : 0.18) + Math.sin(t * 1.7) * 0.05;
    beacon.rotation.y = t * 0.14;
    beaconMat.uniforms.uTime.value = t;
    beaconGlow.material.opacity = beaconMat.uniforms.uOpacity.value * (0.5 + Math.sin(t * 2.2) * 0.1);
  });
  updaters.push((dt, t) => {
    if (particles && shrineState.lit && Math.random() < dt * 9) {
      particles.emit(SHRINE_POS.x + rand(0.8, -0.8), shrineGround + 1.7, SHRINE_POS.z + rand(0.8, -0.8), 0xffc87a,
        { count: 1, speed: 0.3, up: 0.9, gravity: 0.15, drag: 0.6, life: 2.2, spread: 0.3 });
    }
  });

  /* --- bridge ---------------------------------------------------- */
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(BRIDGE.x, 0, BRIDGE.z);
  bridgeGroup.rotation.y = -BRIDGE.angle;
  scene.add(bridgeGroup);
  const plankGeo = new THREE.BoxGeometry(0.62, 0.11, 4.15);
  const plankCount = 24;
  const planks = new THREE.InstancedMesh(plankGeo, new THREE.MeshStandardMaterial({ color: 0x7b6344, roughness: 0.95, flatShading: true }), plankCount);
  for (let i = 0; i < plankCount; i++) {
    const u = -BRIDGE.halfLen + 0.35 + i * (BRIDGE.halfLen * 2 - 0.7) / (plankCount - 1);
    const arch = 0.16 * (1 - (u / BRIDGE.halfLen) ** 2);
    dummy.position.set(u, BRIDGE.deckY + arch, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    planks.setMatrixAt(i, dummy.matrix);
  }
  planks.receiveShadow = true; planks.castShadow = true; planks.instanceMatrix.needsUpdate = true;
  bridgeGroup.add(planks);

  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x4f3f2d, roughness: 0.9, flatShading: true });
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const u = -7.6 + i * 3.8;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.0, 0.13), bridgeMat);
      p.position.set(u, BRIDGE.deckY + 0.55, side * 2.05);
      p.castShadow = true;
      bridgeGroup.add(p);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.09, 0.09), bridgeMat);
    rail.position.set(0, BRIDGE.deckY + 1.0, side * 2.05);
    rail.castShadow = true;
    bridgeGroup.add(rail);
  }
  const bridgeLampGlow = glowSprite(0xffbd70, 2.4, 0.5);
  bridgeLampGlow.position.set(7.4, BRIDGE.deckY + 1.8, 1.9);
  const bridgeLamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), lampGlassMat);
  bridgeLamp.position.copy(bridgeLampGlow.position);
  bridgeGroup.add(bridgeLamp, bridgeLampGlow);

  /* --- fireflies ------------------------------------------------- */
  const fCount = QUALITY.fireflies;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(fCount * 3), fPhase = new Float32Array(fCount), fSize = new Float32Array(fCount);
  for (let i = 0; i < fCount; i++) {
    let x, z;
    if (i < fCount * 0.6) {
      const p = STREAM_SAMPLES[Math.floor(Math.random() * STREAM_SAMPLES.length)];
      x = p.x + rand(11, -11); z = p.z + rand(7, -7);
    } else {
      const a = rand(TAU, 0), r = rand(70, 12);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    fPos[i * 3] = x;
    fPos[i * 3 + 1] = terrainHeight(x, z) + rand(2.4, 0.4);
    fPos[i * 3 + 2] = z;
    fPhase[i] = rand(TAU, 0);
    fSize[i] = rand(2.6, 1.1);
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('aPhase', new THREE.BufferAttribute(fPhase, 1));
  fGeo.setAttribute('aSize', new THREE.BufferAttribute(fSize, 1));
  const fMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) } },
    vertexShader: `
      uniform float uTime; uniform float uPixelRatio;
      attribute float aPhase; attribute float aSize;
      varying float vAlpha;
      void main(){
        vec3 p = position;
        p.y += sin(uTime * 0.7 + aPhase) * 0.35;
        p.x += sin(uTime * 0.31 + aPhase * 1.7) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        vAlpha = (0.55 + 0.45 * sin(uTime * 1.9 + aPhase * 3.0)) * (1.0 - smoothstep(38.0, 78.0, dist)) * smoothstep(1.0, 4.0, dist);
        gl_PointSize = aSize * uPixelRatio * (200.0 / max(dist, 1.0));
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.42) * a, a * vAlpha);
        #include <colorspace_fragment>
      }`,
  });
  const fireflies = new THREE.Points(fGeo, fMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);
  updaters.push((dt, t) => { fMat.uniforms.uTime.value = t; });

  /* --- low mist over the water ---------------------------------- */
  const mistSprites = [];
  for (let i = 0; i < 7; i++) {
    const p = STREAM_SAMPLES[20 + i * 30];
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xcfe1d4, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.position.set(p.x + rand(4, -4), WATER_Y + rand(2.2, 0.8), p.z);
    m.scale.set(rand(30, 18), rand(11, 6), 1);
    scene.add(m);
    mistSprites.push({ sprite: m, phase: rand(TAU, 0), baseX: m.position.x });
  }
  updaters.push((dt, t) => {
    for (const m of mistSprites) {
      m.sprite.position.x = m.baseX + Math.sin(t * 0.06 + m.phase) * 3;
      m.sprite.material.opacity = 0.035 + Math.sin(t * 0.17 + m.phase) * 0.012;
    }
  });

  // A little ambient life: drifting leaf motes.
  updaters.push((dt, t) => {
    if (particles && Math.random() < dt * 2.5) {
      const a = rand(TAU, 0), r = rand(60, 5);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      particles.emit(x, terrainHeight(x, z) + rand(1.8, 0.4), z, 0x8fbf8a,
        { count: 1, speed: 0.15, up: 0.1, gravity: -0.02, drag: 0.2, life: 5, spread: 0.4 });
    }
  });

  function setShrineLit(v) {
    shrineState.lit = v;
    beacon.visible = v;
    beaconMat.uniforms.uOpacity.value = v ? 1 : 0;
    beaconGlow.material.opacity = v ? 0.5 : 0;
  }

  function setShrineMood(kind) {
    shrineState.mood = kind;
    if (kind === 'self') {
      beaconMat.uniforms.uColor.value.setHex(0x9f7bff);
      shrineLight.color.setHex(0x9b7bff);
      outdoorRing.material.color.setHex(0xa98bff);
      shrineGlow.material.color.setHex(0xbf9cff);
      shrineFlameA.material.color.setHex(0xc7a5ff);
      shrineFlameB.material.color.setHex(0x8f6bff);
      beaconGlow.material.color.setHex(0xc7a5ff);
      shrineState.baseLight = 22;
    } else {
      beaconMat.uniforms.uColor.value.setHex(0xffd489);
      shrineLight.color.setHex(0xffd090);
      outdoorRing.material.color.setHex(0xffd489);
      shrineGlow.material.color.setHex(0xffd489);
      shrineFlameA.material.color.setHex(0xffe0a8);
      shrineFlameB.material.color.setHex(0xffb060);
      beaconGlow.material.color.setHex(0xffe0a8);
      shrineState.baseLight = 26;
    }
  }

  return {
    terrain, water, treeColliders, lanterns,
    shrine: { pos: SHRINE_POS, ground: shrineGround, beacon, beaconGlow, group: shrine, light: shrineLight, state: shrineState },
    camp: { pos: { x: camp.position.x, z: camp.position.z }, fireLight },
    setShrineLit, setShrineMood,
    update(dt, time) { for (const u of updaters) u(dt, time); },
  };
}
