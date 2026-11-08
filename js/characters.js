/**
 * Ash & Oath — low-poly characters built from primitives.
 */
import * as THREE from '../vendor/three.module.js';
import { glowSprite, shadowBlob, TAU } from './util.js';

const flat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.88, flatShading: true, ...extra });

/* ------------------------------------------------------------------ *
 *  The wanderer
 * ------------------------------------------------------------------ */
export function createPlayer() {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);

  const cloak = flat(0x53796b);
  const leather = flat(0x57422e);
  const skin = flat(0xe0b488);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd6e0db, roughness: 0.3, metalness: 0.75, emissive: 0x2b4a45, emissiveIntensity: 0.6 });
  const rust = flat(0xb06a48);
  const boot = flat(0x3b2c20);

  const blob = shadowBlob(0.72);
  blob.position.y = 0.02;
  root.add(blob);

  // Legs
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.135, 0.54, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.46, 6), leather);
    leg.position.y = -0.23; leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.26), boot);
    foot.position.set(0, -0.48, 0.05); foot.castShadow = true;
    hip.add(leg, foot);
    visual.add(hip);
    legs.push(hip);
  }

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.29, 0.66, 8), flat(0x5a7163));
  torso.position.y = 0.9; torso.castShadow = true;
  visual.add(torso);

  const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), new THREE.MeshStandardMaterial({ color: 0xe8c37c, metalness: 0.7, roughness: 0.35, emissive: 0x6b4a1a, emissiveIntensity: 0.4 }));
  clasp.position.set(0, 1.16, 0.235);
  visual.add(clasp);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.09, 8), leather);
  belt.position.y = 0.63; belt.castShadow = true;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), flat(0xc3a36a, { metalness: 0.5, roughness: 0.5 }));
  buckle.position.set(0, 0.63, 0.29);
  visual.add(belt, buckle);

  // Cloak (open cone) with a collar
  const cloakMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.02, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x527869, roughness: 0.92, flatShading: true, side: THREE.DoubleSide })
  );
  cloakMesh.position.y = 0.64;
  cloakMesh.scale.z = 0.8;
  cloakMesh.castShadow = true;
  visual.add(cloakMesh);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.075, 5, 10), flat(0x45665d));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.2;
  visual.add(collar);

  const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.08), rust);
  scarf.position.set(0.02, 1.06, -0.27);
  scarf.rotation.x = -0.18;
  scarf.castShadow = true;
  visual.add(scarf);

  // Head & hood
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.36;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 11, 9), skin);
  head.castShadow = true;
  const hoodCap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 9, 0, TAU, 0, Math.PI * 0.6), flat(0x527869));
  hoodCap.position.set(0, 0.04, -0.02);
  hoodCap.rotation.x = 0.08;
  const hoodBack = new THREE.Mesh(new THREE.SphereGeometry(0.205, 10, 8, 0, TAU, 0, Math.PI), flat(0x46685f));
  hoodBack.position.set(0, -0.015, -0.075);
  hoodBack.scale.set(1.04, 1.06, 0.86);
  const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.048, 6, 14), flat(0x46685f));
  cowl.position.set(0, 0.01, 0.07);
  const hoodPeak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 7), flat(0x46685f));
  hoodPeak.position.set(0, 0.18, -0.12);
  hoodPeak.rotation.x = -0.5;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5), new THREE.MeshBasicMaterial({ color: 0x2a2018 }));
  eyeL.position.set(-0.06, 0.0, 0.17);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.06;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), new THREE.MeshBasicMaterial({ color: 0x8a5f48 }));
  mouth.position.set(0, -0.075, 0.172);
  headGroup.add(head, hoodCap, hoodBack, cowl, hoodPeak, eyeL, eyeR, mouth);
  visual.add(headGroup);

  // Arms
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 1.14, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.5, 6), cloak);
    arm.position.y = -0.25; arm.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), skin);
    hand.position.y = -0.51;
    shoulder.add(arm, hand);
    visual.add(shoulder);
    arms.push(shoulder);
  }
  const leftArm = arms[0], rightArm = arms[1];
  leftArm.rotation.x = -0.16;
  leftArm.rotation.z = -0.3;
  rightArm.rotation.x = 0.12;
  rightArm.rotation.z = 0.32;

  // Sword in the right hand
  const sword = new THREE.Group();
  sword.position.set(0, -0.53, 0);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 6), leather);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.045, 0.06), flat(0xb5985e, { metalness: 0.6, roughness: 0.45 }));
  guard.position.y = -0.11;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.82, 0.022), steel);
  blade.position.y = 0.55;
  blade.castShadow = true;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.14, 4), steel);
  tip.position.y = 1.02; tip.rotation.y = Math.PI / 4;
  sword.add(grip, guard, blade, tip);
  rightArm.add(sword);

  // Lantern in the left hand
  const lantern = new THREE.Group();
  lantern.position.set(-0.05, -0.56, 0.02);
  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 0.17, 6),
    new THREE.MeshStandardMaterial({ color: 0xffcf87, emissive: 0xffa24c, emissiveIntensity: 2.2, roughness: 0.35 })
  );
  const lanternTop = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.1, 6), flat(0x2a2822));
  lanternTop.position.y = 0.16;
  const lanternBase = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.035, 6), flat(0x2a2822));
  lanternBase.position.y = -0.105;
  const lanternGlow = glowSprite(0xffb363, 1.25, 0.5);
  lantern.add(lanternGlass, lanternTop, lanternBase, lanternGlow);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.2, 0.014), flat(0x2a2822));
    const a = i * Math.PI / 2;
    bar.position.set(Math.cos(a) * 0.088, 0.01, Math.sin(a) * 0.088);
    lantern.add(bar);
  }
  const lanternLight = new THREE.PointLight(0xffa55e, 5.5, 9, 2);
  lantern.add(lanternLight);
  leftArm.add(lantern);

  const backClasp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 6), new THREE.MeshStandardMaterial({ color: 0xe8c37c, metalness: 0.7, roughness: 0.35 }));
  backClasp.position.set(0, 1.1, -0.26);
  visual.add(backClasp);

  const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.1), leather);
  satchel.position.set(-0.18, 0.56, -0.16);
  satchel.rotation.z = 0.12;
  visual.add(satchel);

  const rig = {
    root, visual, legs, arms, leftArm, rightArm, sword, lantern, lanternGlow, lanternLight,
    headGroup, cloakMesh, scarf, blob,
    walk: 0, attack: 0, spell: 0, roll: 0, hurt: 0, moving: 0, grounded: true,
    eyeColor: new THREE.Color(0xffa55e),
  };
  return rig;
}

export function animatePlayer(rig, dt, time, state) {
  const { speed = 0, attack = 0, spell = 0, roll = 0, hurt = 0 } = state;
  const sp = Math.min(1, speed / 4.5);
  rig.walk += dt * (2.2 + speed * 1.9);

  if (roll > 0) {
    const k = 1 - roll / 0.42;
    rig.visual.rotation.x = k * TAU;
    rig.visual.position.y = Math.sin(k * Math.PI) * 0.35;
    rig.rightArm.rotation.x = -1.2;
    rig.leftArm.rotation.x = -1.4;
    rig.legs[0].rotation.x = 1.4;
    rig.legs[1].rotation.x = 1.4;
  } else {
    rig.visual.rotation.x = dampTo(rig.visual.rotation.x, 0, 14, dt);
    rig.visual.position.y = dampTo(rig.visual.position.y, 0, 14, dt);

    const swing = Math.sin(rig.walk) * 0.62 * sp;
    rig.legs[0].rotation.x = dampTo(rig.legs[0].rotation.x, swing, 16, dt);
    rig.legs[1].rotation.x = dampTo(rig.legs[1].rotation.x, -swing, 16, dt);
    rig.leftArm.rotation.x = dampTo(rig.leftArm.rotation.x, -0.16 - swing * 0.28, 12, dt);
    rig.rightArm.rotation.x = dampTo(rig.rightArm.rotation.x, 0.12 + swing * 0.3, 12, dt);
    rig.visual.position.y = Math.abs(Math.sin(rig.walk)) * 0.035 * sp;
    rig.cloakMesh.rotation.x = dampTo(rig.cloakMesh.rotation.x, -0.08 * sp - Math.sin(rig.walk) * 0.03 * sp, 8, dt);
    rig.scarf.rotation.x = dampTo(rig.scarf.rotation.x, -0.18 - sp * 0.25 - Math.sin(rig.walk * 2) * 0.05, 8, dt);
  }

  if (attack > 0) {
    const k = 1 - attack / 0.42;
    const arc = Math.sin(Math.min(1, k * 1.25) * Math.PI);
    rig.rightArm.rotation.x = -0.9 - arc * 2.2;
    rig.rightArm.rotation.z = 0.32 - 0.52 * arc;
    rig.visual.rotation.y = -0.35 * Math.sin(k * Math.PI);
    rig.sword.rotation.z = arc * 0.3;
  } else {
    rig.rightArm.rotation.z = dampTo(rig.rightArm.rotation.z, 0.28, 10, dt);
    rig.sword.rotation.z = dampTo(rig.sword.rotation.z, 0, 10, dt);
    rig.visual.rotation.y = dampTo(rig.visual.rotation.y, 0, 10, dt);
  }

  if (spell > 0) {
    const k = 1 - spell / 0.7;
    rig.leftArm.rotation.x = -0.4 - Math.sin(k * Math.PI) * 1.7;
    rig.lanternGlow.material.opacity = 0.55 + Math.sin(k * Math.PI) * 0.28;
    rig.lanternLight.intensity = 5.5 + Math.sin(k * Math.PI) * 13;
  } else {
    rig.lanternGlow.material.opacity = 0.46 + Math.sin(time * 4.1) * 0.04 + Math.sin(time * 9.3) * 0.025;
    rig.lanternLight.intensity = 5.5 + Math.sin(time * 6.7) * 0.5;
  }

  if (hurt > 0) {
    rig.visual.rotation.z = Math.sin(hurt * 55) * 0.06;
  } else {
    rig.visual.rotation.z = dampTo(rig.visual.rotation.z, 0, 10, dt);
  }
  rig.moving = sp;
  rig.attack = attack;
  rig.spell = spell;
  rig.roll = roll;
  rig.hurt = hurt;
}

function dampTo(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }

/* ------------------------------------------------------------------ *
 *  Hound companion
 * ------------------------------------------------------------------ */
export function createDog() {
  const root = new THREE.Group();
  const fur = flat(0x9a7050);
  const cream = flat(0xc39a6c);
  const dark = flat(0x4c3727);
  const blob = shadowBlob(0.5);
  blob.position.y = 0.02;
  root.add(blob);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 4, 8), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.43;
  body.castShadow = true;
  root.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.24, 6), cream);
  neck.position.set(0, 0.52, 0.24);
  neck.rotation.x = 0.5;
  root.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.33);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 8), fur);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.16), cream);
  muzzle.position.set(0, -0.03, 0.13);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), dark);
  nose.position.set(0, -0.02, 0.22);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 4), dark);
  earL.position.set(-0.08, 0.13, -0.02);
  earL.rotation.z = 0.25;
  const earR = earL.clone(); earR.position.x = 0.08; earR.rotation.z = -0.25;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.017, 5, 5), new THREE.MeshBasicMaterial({ color: 0x21180f }));
  eyeL.position.set(-0.06, 0.03, 0.115);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.06;
  head.add(skull, muzzle, nose, earL, earR, eyeL, eyeR);
  root.add(head);

  const legs = [];
  for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.34, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.08), cream);
    leg.position.y = -0.16; leg.castShadow = true;
    hip.add(leg);
    root.add(hip);
    legs.push(hip);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.52, -0.28);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.34, 5), cream);
  tailMesh.position.y = 0.16;
  tail.add(tailMesh);
  root.add(tail);

  return { root, head, legs, tail, walk: 0, bark: 0 };
}

/* ------------------------------------------------------------------ *
 *  Mara, the lantern-keeper
 * ------------------------------------------------------------------ */
export function createKeeper() {
  const root = new THREE.Group();
  const robe = flat(0x7d6242);
  const trim = flat(0xa58457);
  const skin = flat(0xd7ab83);

  const blob = shadowBlob(0.6);
  blob.position.y = 0.02;
  root.add(blob);

  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.35, 9), robe);
  skirt.position.y = 0.68; skirt.castShadow = true;
  const shawl = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 9), trim);
  shawl.position.y = 1.18; shawl.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
  head.position.y = 1.5;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, TAU, 0, Math.PI * 0.62), flat(0x5e4a32));
  hood.position.y = 1.54; hood.rotation.x = 0.1;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), flat(0x9c9484));
  hair.position.set(0, 1.5, -0.12);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.56, 6), robe);
  arm.position.set(0.34, 1.1, 0.04); arm.rotation.z = -0.45;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), skin);
  hand.position.set(0.48, 0.86, 0.08);
  root.add(skirt, shawl, head, hood, hair, arm, hand);

  const staff = new THREE.Group();
  staff.position.set(-0.42, 0.9, 0.05);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.1, 5), flat(0x4a3a28));
  pole.position.y = 0.05;
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.34, 0.26),
    new THREE.MeshStandardMaterial({ color: 0xffce86, emissive: 0xffa54c, emissiveIntensity: 2.8, roughness: 0.4 })
  );
  lamp.position.set(0, 1.18, 0);
  const lampGlow = glowSprite(0xffbd72, 2.4, 0.65);
  lampGlow.position.copy(lamp.position);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), flat(0x3d3122));
  cap.position.set(0, 1.43, 0); cap.rotation.y = Math.PI / 4;
  staff.add(pole, lamp, lampGlow, cap);
  root.add(staff);

  return { root, lampGlow, staff, head, shawl };
}

/* ------------------------------------------------------------------ *
 *  Ember-wisp
 * ------------------------------------------------------------------ */
export function createWisp(index) {
  const root = new THREE.Group();
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xa9f2e4, emissive: 0x4fd9c2, emissiveIntensity: 2.4,
    roughness: 0.25, metalness: 0.1, flatShading: true,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), coreMat);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x87e6d6, wireframe: true, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 1), shellMat);

  const shards = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09, 0), coreMat);
    const a = i / 5 * TAU;
    s.position.set(Math.cos(a) * 0.62, Math.sin(a * 2.1) * 0.16, Math.sin(a) * 0.62);
    root.add(s);
    shards.push(s);
  }
  const glow = glowSprite(0x6fe6d2, 3.4, 0.55);
  const innerGlow = glowSprite(0xd8fff6, 1.1, 0.9);
  const eyes = new THREE.Group();
  const eL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), new THREE.MeshBasicMaterial({ color: 0x143a37 }));
  eL.position.set(-0.075, 0.03, 0.23);
  const eR = eL.clone(); eR.position.x = 0.075;
  eyes.add(eL, eR);

  root.add(core, shell, glow, innerGlow, eyes);
  root.position.y = 1.2;
  return {
    root, core, coreMat, shell, shellMat, shards, glow, innerGlow, eyes,
    phase: index * 1.37, home: new THREE.Vector3(), hp: 100, maxHp: 100,
    alive: true, hit: 0, fire: 2 + index * 0.4, aggro: false, deadT: 0,
    baseY: 0,
  };
}
