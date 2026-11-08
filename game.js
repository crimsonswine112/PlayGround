/**
 * Ash & Oath — A Gloaming Vale Tale
 * Main loop, quest, combat, camera and controls.
 */
import * as THREE from '../vendor/three.module.js';
import {
  QUALITY, COLORS, TAU, clamp, lerp, rand, damp, groundHeight, terrainHeight,
  WATER_Y, START, KEEPER_POS, SHRINE_POS, isTouch, glowSprite, color,
} from './js/util.js';
import { createWorld, SUN_DIR } from './js/world.js';
import { createPlayer, animatePlayer, createDog, createKeeper, createWisp } from './js/characters.js';
import { Particles, Shockwaves, Bolts } from './js/fx.js';
import { audio } from './js/audio.js';

const $ = id => document.getElementById(id);
const ui = {
  intro: $('intro'), dialog: $('dialog'), choice: $('choice'), ending: $('ending'),
  start: $('start'), accept: $('accept'), restart: $('restart'), hud: document.querySelector('.hud'),
  questTitle: $('questTitle'), questSub: $('questSub'), objective: $('objective'),
  hpFill: $('hpFill'), willFill: $('willFill'), hpText: $('hpText'), willText: $('willText'),
  sparks: Array.from(document.querySelectorAll('#sparks span')),
  compass: $('compass'), compassArrow: $('compassArrow'), compassLabel: $('compassLabel'), compassDist: $('compassDist'),
  prompt: $('prompt'), promptText: $('promptText'), promptKey: $('promptKey'),
  toast: $('toast'), vignette: $('vignette'), touch: $('touch'), stick: $('stick'), knob: $('knob'),
  qualityChip: $('qualityChip'), loader: $('loader'), soundBtn: $('soundBtn'),
  endingEyebrow: $('endingEyebrow'), endingTitle: $('endingTitle'), endingText: $('endingText'),
  endSparks: $('endSparks'), endMoral: $('endMoral'), endTime: $('endTime'),
  talk: document.querySelector('.act.talk'),
};

/* ------------------------------------------------------------------ *
 *  Renderer / scene
 * ------------------------------------------------------------------ */
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: QUALITY.antialias, powerPreference: 'high-performance', stencil: false,
});
renderer.setPixelRatio(QUALITY.pixelCap);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = QUALITY.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(COLORS.fog, 0.0068);
scene.background = new THREE.Color(COLORS.fog);
const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.1, 460);

const hemi = new THREE.HemisphereLight(0x8fb6c8, 0x3f4e2e, 0.68);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9b0, 1.95);
sun.position.copy(SUN_DIR).multiplyScalar(60);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadows, QUALITY.shadows);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 130;
sun.shadow.camera.left = -QUALITY.shadowRadius;
sun.shadow.camera.right = QUALITY.shadowRadius;
sun.shadow.camera.top = QUALITY.shadowRadius;
sun.shadow.camera.bottom = -QUALITY.shadowRadius;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight(0x9fc6cf, 0.95);
fill.position.set(35, 24, 46);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffb87c, 0.42);
rim.position.set(26, 14, -46);
scene.add(rim);

const particles = new Particles(scene, QUALITY.particles);
const waves = new Shockwaves(scene, 8);
const bolts = new Bolts(scene, 12);
const world = createWorld(scene, particles);

/* ------------------------------------------------------------------ *
 *  Actors
 * ------------------------------------------------------------------ */
const playerRig = createPlayer();
scene.add(playerRig.root);
const dog = createDog();
scene.add(dog.root);
const keeperRig = createKeeper();
keeperRig.root.position.set(KEEPER_POS.x, terrainHeight(KEEPER_POS.x, KEEPER_POS.z), KEEPER_POS.z);
keeperRig.root.rotation.y = 0.35;
scene.add(keeperRig.root);

const WISP_HOMES = [
  { x: -38, z: -2 }, { x: -14, z: -32 }, { x: 10, z: -44 },
  { x: -31, z: 57 }, { x: 24, z: 36 },
];
const wisps = WISP_HOMES.map((home, i) => {
  const w = createWisp(i);
  w.home.set(home.x, terrainHeight(home.x, home.z), home.z);
  w.root.position.set(home.x, w.home.y + 1.35, home.z);
  w.baseY = w.home.y + 1.35;
  scene.add(w.root);
  return w;
});

const player = {
  x: START.x, z: START.z, vx: 0, vz: 0, face: Math.PI, y: 0,
  yaw: Math.PI, speed: 0, wading: false,
};
player.y = groundHeight(player.x, player.z);

const game = {
  mode: 'intro', started: false, ended: false, hp: 100, will: 100, embers: 0, moral: 65,
  time: 0, playTime: 0, attackT: 0, attackCd: 0, spellT: 0, spellCd: 0,
  rollT: 0, rollCd: 0, invuln: 0, hurt: 0, shake: 0, hurtFlash: 0,
  camYaw: 0.18, camPitch: 0.3, camDist: 9.4, lastLook: -10, lastCombat: -99,
  toastT: 0, promptTarget: null, regenDelay: 0, dead: false, shrineLit: false,
  touch: false, attackFlash: 0, dogBark: 0, cameraSnap: true,
};

/* Floating quest marker */
const marker = new THREE.Group();
const markerGem = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.3, 0),
  new THREE.MeshBasicMaterial({ color: 0xffe1a1, transparent: true, opacity: 0.95 })
);
const markerGlow = glowSprite(0xffc96e, 2.6, 0.65);
marker.add(markerGem, markerGlow);
marker.visible = false;
scene.add(marker);

/* ------------------------------------------------------------------ *
 *  Audio / UI helpers
 * ------------------------------------------------------------------ */
function toast(text, dur = 3.2) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  game.toastT = dur;
}

function setVignette(state) {
  ui.vignette.className = state || '';
}

function setModal(open) {
  document.body.classList.toggle('modal-open', open);
}

function updateHud(force = false) {
  const hp = Math.max(0, game.hp), will = Math.max(0, game.will);
  ui.hpFill.style.width = hp + '%';
  ui.willFill.style.width = will + '%';
  ui.hpText.textContent = Math.ceil(hp);
  ui.willText.textContent = Math.floor(will);
  ui.sparks.forEach((s, i) => s.classList.toggle('on', i < game.embers));
  if (force) {
    ui.hpText.textContent = Math.ceil(hp);
  }
}

function updateQuestUI() {
  if (game.mode === 'hunt') {
    ui.questTitle.textContent = game.embers >= 5 ? 'The shrine is awake' : 'The ember hunt';
    ui.questSub.textContent = game.embers >= 5 ? 'Every spark has been gathered. Return to the old shrine.' : 'Gather five ember-sparks from the mire.';
    ui.objective.innerHTML = game.embers >= 5
      ? 'All five sparks gathered. <b>Bring them to the old shrine</b> across the ford.'
      : `Ember-sparks gathered: <b>${game.embers} / 5</b> — follow the compass to the nearest wisp.`;
  }
}

function setObjective(html) { ui.objective.innerHTML = html; }

/* ------------------------------------------------------------------ *
 *  Start / quest
 * ------------------------------------------------------------------ */
function startGame() {
  if (game.started) return;
  audio.init();
  game.started = true;
  game.mode = 'explore';
  ui.intro.classList.add('hidden');
  ui.hud.style.transition = 'opacity 1s ease';
  ui.hud.style.opacity = '1';
  setModal(false);
  document.body.classList.toggle('touch-ui', game.touch);
  if (game.touch) ui.touch.classList.add('on');
  setObjective(game.touch
    ? 'Find the lantern-keeper by the old ford. <b>◈ Talk</b> when close.'
    : 'Find the lantern-keeper by the old ford. <b>E</b> to speak.');
  toast('Lantern-light flickers west of the ford.');
  game.camYaw = 0.2;
  game.camPitch = 0.24;
  game.camDist = 8.8;
  game.cameraSnap = true;
}

function acceptQuest() {
  if (game.mode !== 'dialog') return;
  ui.dialog.classList.add('hidden');
  game.mode = 'hunt';
  setModal(false);
  setObjective('Find and defeat the <b>five ember-wisps</b> scattered across the vale.');
  updateQuestUI();
  toast('Five sparks. The vale holds its breath.');
  audio.ui();
  // Wake the wisps.
  wisps.forEach(w => { w.aggro = false; });
}

function openChoice() {
  game.mode = 'choice';
  ui.choice.classList.remove('hidden');
  setModal(true);
  audio.ui();
}

function finish(which) {
  setModal(true);
  if (which === 'death') {
    game.mode = 'ending';
    game.ended = true;
    game.dead = true;
    setVignette('dark');
    ui.endingEyebrow.textContent = 'The mire keeps its own';
    ui.endingTitle.innerHTML = 'The light <span>fades</span>';
    ui.endingText.textContent = 'The ember-wisps crowd the dark around you. Somewhere far off, Mara’s lantern still swings — waiting for a champion who will not come.';
    ui.endSparks.textContent = `${game.embers} / 5`;
    ui.endMoral.textContent = 'Untended';
    ui.endTime.textContent = formatTime(game.playTime);
    audio.death();
  } else {
    game.mode = 'ending';
    game.ended = true;
    ui.choice.classList.add('hidden');
    game.moral = which === 'kind' ? 96 : 8;
    world.setShrineLit(true);
    world.setShrineMood(which);
    if (which === 'kind') {
      setVignette('');
      ui.endingEyebrow.textContent = 'A gentle light';
      ui.endingTitle.innerHTML = 'The vale <span>blooms</span>';
      ui.endingText.textContent = 'You pour the gathered fire into the vale. One by one, warm windows kindle across the Gloaming; the ford sings, the reeds grow gold, and Mara’s lantern burns brighter than it has in a hundred years. Your hound barks at the dawn. They will speak your name with gratitude.';
    } else {
      setVignette('');
      ui.endingEyebrow.textContent = 'A hungry light';
      ui.endingTitle.innerHTML = 'The vale <span>kneels</span>';
      ui.endingText.textContent = 'You bind the fire to your own heart. Power floods your veins as the hearths beyond the ford gutter and die. The hound stays close — but it watches you differently now. The vale will remember your name. It will not speak it kindly.';
    }
    ui.endSparks.textContent = `${game.embers} / 5`;
    ui.endMoral.textContent = which === 'kind' ? 'Kind' : 'Feared';
    ui.endTime.textContent = formatTime(game.playTime);
    audio.win(which);
  }
  ui.ending.classList.remove('hidden');
  ui.prompt.classList.remove('show');
  ui.compass.classList.add('hide');
  marker.visible = false;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function resetGame() {
  game.mode = 'explore';
  game.ended = false;
  game.dead = false;
  game.hp = 100; game.will = 100; game.embers = 0; game.moral = 65;
  game.playTime = 0; game.attackT = 0; game.attackCd = 0; game.spellT = 0;
  game.spellCd = 0; game.rollT = 0; game.rollCd = 0; game.invuln = 0;
  game.hurt = 0; game.shake = 0; game.shrineLit = false; game.regenDelay = 0;
  player.x = START.x; player.z = START.z; player.vx = player.vz = 0;
  player.face = Math.PI; player.y = groundHeight(player.x, player.z);
  playerRig.root.position.set(player.x, player.y, player.z);
  playerRig.root.rotation.y = player.face;
  game.camYaw = 0.2; game.camPitch = 0.24; game.camDist = 8.8; game.cameraSnap = true;
  wisps.forEach((w, i) => {
    w.hp = w.maxHp; w.alive = true; w.aggro = false; w.hit = 0; w.root.visible = true;
    w.root.position.set(w.home.x, w.home.y + 1.35, w.home.z);
    w.baseY = w.home.y + 1.35; w.fire = 2 + i * 0.4; w.kx = 0; w.kz = 0;
  });
  bolts.items.forEach(b => { b.alive = false; b.mesh.visible = false; });
  world.setShrineLit(false);
  world.setShrineMood('kind');
  dog.root.position.set(START.x + 2, terrainHeight(START.x + 2, START.z + 2), START.z + 2);
  ui.ending.classList.add('hidden');
  ui.choice.classList.add('hidden');
  ui.dialog.classList.add('hidden');
  setModal(false);
  setVignette('');
  ui.touch.classList.toggle('on', game.touch);
  document.body.classList.toggle('touch-ui', game.touch);
  ui.questTitle.textContent = 'A light in the mire';
  ui.questSub.textContent = 'Seek the lantern-keeper west of the ford.';
  setObjective(game.touch
    ? 'Find the lantern-keeper by the old ford. <b>◈ Talk</b> when close.'
    : 'Find the lantern-keeper by the old ford. <b>E</b> to speak.');
  updateHud(true);
  toast('The vale waits for you again.');
}

/* ------------------------------------------------------------------ *
 *  Input
 * ------------------------------------------------------------------ */
const keys = Object.create(null);
const joy = { x: 0, y: 0, active: false, id: null };
const look = { id: null, x: 0, y: 0, moved: 0, start: 0, type: 'mouse' };

function canAct() {
  return game.started && !game.ended && (game.mode === 'explore' || game.mode === 'hunt');
}

function moveInput() {
  let ix = 0, fwd = 0;
  if (keys.w || keys.arrowup) fwd += 1;
  if (keys.s || keys.arrowdown) fwd -= 1;
  if (keys.a || keys.arrowleft) ix -= 1;
  if (keys.d || keys.arrowright) ix += 1;
  if (joy.active) { ix += joy.x; fwd += -joy.y; }
  const len = Math.hypot(ix, fwd);
  if (len > 1) { ix /= len; fwd /= len; }
  return { ix, fwd };
}

function attack() {
  if (!canAct() || game.attackCd > 0) return;
  game.attackCd = 0.44;
  game.attackT = 0.42;
  game.lastCombat = game.time;
  audio.swing();
  const fx = Math.sin(player.face), fz = Math.cos(player.face);
  let hitAny = false;
  if (game.mode === 'hunt') {
    for (const w of wisps) {
      if (!w.alive) continue;
      const dx = w.root.position.x - player.x, dz = w.root.position.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.5) continue;
      const dot = dist < 0.001 ? 1 : (dx * fx + dz * fz) / dist;
      if (dot < 0.05) continue;
      damageWisp(w, 45, dx, dz);
      hitAny = true;
    }
  }
  if (!hitAny) {
    particles.emit(player.x + fx * 1.6, player.y + 1.0, player.z + fz * 1.6, 0xcfe6de,
      { count: 4, speed: 0.9, spread: 0.6, up: 0.5, life: 0.35, gravity: -2, drag: 3 });
  }
}

function castSpell() {
  if (!canAct() || game.spellCd > 0) return;
  if (game.will < 34) { toast('Not enough Will. Let it gather.'); audio.ui(); return; }
  game.will -= 34;
  game.spellCd = 1.25;
  game.spellT = 0.7;
  game.lastCombat = game.time;
  audio.spell();
  waves.spawn(player.x, player.y + 0.15, player.z, 0x8fe8d7, 6.2, 0.55);
  particles.emit(player.x, player.y + 0.9, player.z, 0xa8f5e5,
    { count: 34, speed: 3.4, spread: 2.8, up: 2.2, life: 0.9, gravity: -1.5, drag: 1.5 });
  game.shake = Math.max(game.shake, 0.16);
  if (game.mode === 'hunt') {
    for (const w of wisps) {
      if (!w.alive) continue;
      const dx = w.root.position.x - player.x, dz = w.root.position.z - player.z;
      if (Math.hypot(dx, dz) < 6.4) damageWisp(w, 60, dx, dz);
    }
  }
  updateHud();
}

function roll() {
  if (!canAct() || game.rollCd > 0) return;
  const { ix, fwd } = moveInput();
  let dx, dz;
  if (ix || fwd) {
    const c = cameraBasis();
    dx = c.rx * ix + c.fx * fwd;
    dz = c.rz * ix + c.fz * fwd;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    player.face = Math.atan2(dx, dz);
  } else {
    dx = Math.sin(player.face); dz = Math.cos(player.face);
  }
  game.rollT = 0.42;
  game.rollCd = 0.95;
  game.invuln = Math.max(game.invuln, 0.46);
  player.vx = dx * 15;
  player.vz = dz * 15;
  audio.roll();
  particles.emit(player.x, player.y + 0.18, player.z, 0xb9a98a,
    { count: 12, speed: 1.8, spread: 0.9, up: 0.4, life: 0.5, gravity: 0.5, drag: 2.5 });
}

function cameraBasis() {
  const yaw = game.camYaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return { fx, fz, rx: -fz, rz: fx };
}

function interact() {
  if (!game.started || game.ended) return;
  if (game.mode === 'dialog' || game.mode === 'choice' || game.mode === 'ending') return;
  const dk = Math.hypot(player.x - KEEPER_POS.x, player.z - KEEPER_POS.z);
  const ds = Math.hypot(player.x - SHRINE_POS.x, player.z - SHRINE_POS.z);
  if (game.mode === 'explore' && dk < 4.6) {
    game.mode = 'dialog';
    ui.dialog.classList.remove('hidden');
    ui.prompt.classList.remove('show');
    setModal(true);
    audio.ui();
    return;
  }
  if (game.mode === 'hunt' && ds < 5.6) {
    if (game.embers >= 5) openChoice();
    else { toast(`The shrine is cold. ${5 - game.embers} spark${5 - game.embers === 1 ? '' : 's'} still drift in the mire.`); audio.ui(); }
    return;
  }
  if (dk < 4.6) { toast('Mara watches the ford. Her quest is not yet done.'); return; }
  if (ds < 6.4) { toast('The old shrine hums, faintly.'); return; }
  toast('Nothing here answers you.');
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  keys[k] = true;
  if (e.repeat) return;
  if (k === 'e') interact();
  if (k === ' ' || k === 'shift') roll();
  if (k === 'q' || k === 'f') castSpell();
  if (k === 'j' || k === 'enter') attack();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!game.started || game.ended) return;
  if (e.pointerType === 'mouse' && e.button === 0) attack();
  if (look.id === null) {
    look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    look.moved = 0; look.start = performance.now(); look.type = e.pointerType;
    canvas.setPointerCapture?.(e.pointerId);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (look.id !== e.pointerId) return;
  const dx = e.clientX - look.x, dy = e.clientY - look.y;
  look.x = e.clientX; look.y = e.clientY;
  look.moved += Math.abs(dx) + Math.abs(dy);
  game.camYaw -= dx * 0.0055;
  game.camPitch = clamp(game.camPitch + dy * 0.0035, 0.1, 0.62);
  game.lastLook = game.time;
});
function endLook(e) {
  if (look.id !== e.pointerId) return;
  look.id = null;
}
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  game.camDist = clamp(game.camDist + Math.sign(e.deltaY) * 0.7, 6, 14);
}, { passive: false });

/* Touch joystick */
let stickId = null;
function stickStart(e) {
  e.preventDefault();
  if (stickId !== null) return;
  stickId = e.pointerId;
  joy.active = true;
  ui.stick.setPointerCapture?.(e.pointerId);
  stickMove(e);
}
function stickMove(e) {
  if (e.pointerId !== stickId) return;
  const r = ui.stick.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const max = r.width * 0.34, len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  joy.x = dx / max; joy.y = dy / max;
  ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
function stickEnd(e) {
  if (e.pointerId !== stickId) return;
  stickId = null; joy.active = false; joy.x = 0; joy.y = 0;
  ui.knob.style.transform = 'translate(0,0)';
}
ui.stick.addEventListener('pointerdown', stickStart);
ui.stick.addEventListener('pointermove', stickMove);
ui.stick.addEventListener('pointerup', stickEnd);
ui.stick.addEventListener('pointercancel', stickEnd);

document.querySelectorAll('.act').forEach(btn => {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    btn.classList.add('hit');
    setTimeout(() => btn.classList.remove('hit'), 130);
    if (!game.started || game.ended) return;
    if (act === 'strike') attack();
    if (act === 'spell') castSpell();
    if (act === 'roll') roll();
    if (act === 'interact') interact();
  });
});

ui.start.addEventListener('click', startGame);
ui.accept.addEventListener('click', acceptQuest);
ui.restart.addEventListener('click', resetGame);
document.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => finish(b.dataset.choice)));
ui.soundBtn.addEventListener('click', () => {
  audio.init();
  const m = !audio.muted;
  audio.setMuted(m);
  ui.soundBtn.textContent = m ? '✕' : '♪';
});

/* ------------------------------------------------------------------ *
 *  Combat & wisps
 * ------------------------------------------------------------------ */
function damageWisp(w, dmg, dx, dz) {
  w.hp -= dmg;
  w.hit = 0.3;
  w.aggro = true;
  const d = Math.hypot(dx, dz) || 1;
  w.kx = (dx / d) * 4.2;
  w.kz = (dz / d) * 4.2;
  game.shake = Math.max(game.shake, 0.14);
  game.lastCombat = game.time;
  particles.emit(w.root.position.x, w.root.position.y, w.root.position.z, 0xb8fff1,
    { count: 16, speed: 2.6, spread: 1.5, up: 1.4, life: 0.55, gravity: -2.5, drag: 2.2 });
  particles.emit(w.root.position.x, w.root.position.y, w.root.position.z, 0xffd08a,
    { count: 8, speed: 1.7, spread: 1.1, up: 1.8, life: 0.4, gravity: -1, drag: 2 });
  audio.hit();
  if (w.hp <= 0) killWisp(w);
}

function killWisp(w) {
  if (!w.alive) return;
  w.alive = false;
  w.root.visible = false;
  game.embers++;
  game.hp = Math.min(100, game.hp + 16);
  game.will = Math.min(100, game.will + 24);
  game.lastCombat = game.time;
  waves.spawn(w.root.position.x, w.root.position.y - 0.6, w.root.position.z, 0xffcf87, 5.6, 0.6);
  particles.emit(w.root.position.x, w.root.position.y, w.root.position.z, 0xffd693,
    { count: 40, speed: 3.6, spread: 2.4, up: 2.2, life: 1.0, gravity: -1.4, drag: 1.6 });
  particles.emit(w.root.position.x, w.root.position.y, w.root.position.z, 0x9df3e3,
    { count: 22, speed: 3.0, spread: 2.0, up: 1.6, life: 0.8, gravity: -1, drag: 1.8 });
  audio.pickup();
  game.dogBark = 1;
  updateHud();
  updateQuestUI();
  if (game.embers >= 5) {
    if (!game.shrineLit) { game.shrineLit = true; world.setShrineLit(true); }
    toast('Five sparks! The old shrine wakes across the ford.');
    setObjective('All five sparks gathered. <b>Bring them to the old shrine</b> across the ford.');
    game.shake = Math.max(game.shake, 0.25);
  } else {
    toast(`Ember-spark gathered — ${game.embers} of 5.`);
  }
}

function hurtPlayer(dmg) {
  if (game.invuln > 0 || game.ended) return;
  if (game.mode === 'dialog' || game.mode === 'choice' || game.mode === 'ending') return;
  game.hp -= dmg;
  game.invuln = 0.85;
  game.hurt = 0.32;
  game.shake = Math.max(game.shake, 0.3);
  game.hurtFlash = 0.42;
  game.lastCombat = game.time;
  game.regenDelay = 8;
  setVignette('hurt');
  particles.emit(player.x, player.y + 1.0, player.z, 0xff8b68,
    { count: 12, speed: 2.2, spread: 1.4, up: 1.5, life: 0.5, gravity: -2, drag: 2 });
  audio.hurt();
  updateHud();
  if (game.hp <= 0) { game.hp = 0; updateHud(); finish('death'); }
}

/* ------------------------------------------------------------------ *
 *  Update
 * ------------------------------------------------------------------ */
let markerTarget = null;

function updatePlayer(dt) {
  if (!game.started || game.ended) {
    player.vx = damp(player.vx, 0, 8, dt);
    player.vz = damp(player.vz, 0, 8, dt);
  } else if (game.rollT > 0) {
    // rolling: velocity handled by roll impulse
  } else if (game.mode === 'explore' || game.mode === 'hunt') {
    const { ix, fwd } = moveInput();
    const c = cameraBasis();
    const dx = c.rx * ix + c.fx * fwd;
    const dz = c.rz * ix + c.fz * fwd;
    let speed = 4.6;
    if (player.wading) speed *= 0.55;
    const targetVx = dx * speed, targetVz = dz * speed;
    const accel = 14;
    player.vx = damp(player.vx, targetVx, accel, dt);
    player.vz = damp(player.vz, targetVz, accel, dt);
    if (dx || dz) {
      const target = Math.atan2(dx, dz);
      let diff = ((target - player.face + Math.PI * 3) % TAU) - Math.PI;
      player.face += diff * Math.min(1, dt * 14);
    }
  } else {
    player.vx = damp(player.vx, 0, 12, dt);
    player.vz = damp(player.vz, 0, 12, dt);
  }

  player.x += player.vx * dt;
  player.z += player.vz * dt;
  const r = Math.hypot(player.x, player.z);
  if (r > 88) { player.x = player.x / r * 88; player.z = player.z / r * 88; }

  // Trees & landmarks
  for (const t of world.treeColliders) {
    const dx = player.x - t.x, dz = player.z - t.z;
    const d = Math.hypot(dx, dz);
    const min = t.r + 0.45;
    if (d < min && d > 0.001) {
      player.x = t.x + dx / d * min;
      player.z = t.z + dz / d * min;
    }
  }
  const ds = Math.hypot(player.x - SHRINE_POS.x, player.z - SHRINE_POS.z);
  if (ds < 3.9 && ds > 0.01) {
    const k = 3.9 / ds;
    player.x = SHRINE_POS.x + (player.x - SHRINE_POS.x) * k;
    player.z = SHRINE_POS.z + (player.z - SHRINE_POS.z) * k;
  }

  player.y = groundHeight(player.x, player.z);
  const rawGround = player.y;
  if (rawGround < WATER_Y - 0.26) player.y = WATER_Y - 0.26;
  player.wading = rawGround < WATER_Y + 0.02;
  player.speed = Math.hypot(player.vx, player.vz);

  if (player.wading && player.speed > 1 && Math.random() < dt * 16) {
    particles.emit(player.x, WATER_Y + 0.05, player.z, 0x9fd8cf,
      { count: 2, speed: 1.1, spread: 0.7, up: 1.2, life: 0.5, gravity: -5, drag: 1 });
  } else if (player.speed > 2 && Math.random() < dt * 5) {
    particles.emit(player.x - Math.sin(player.face) * 0.2, player.y + 0.06, player.z - Math.cos(player.face) * 0.2, 0x9d9a7e,
      { count: 1, speed: 0.5, spread: 0.3, up: 0.35, life: 0.5, gravity: 0.2, drag: 3 });
  }

  playerRig.root.position.set(player.x, player.y, player.z);
  playerRig.root.rotation.y = player.face;
  animatePlayer(playerRig, dt, game.time, {
    speed: player.speed,
    attack: game.attackT,
    spell: game.spellT,
    roll: game.rollT,
    hurt: game.hurt,
  });
  game.attackT = Math.max(0, game.attackT - dt);
  game.spellT = Math.max(0, game.spellT - dt);
  game.rollT = Math.max(0, game.rollT - dt);
  game.attackCd = Math.max(0, game.attackCd - dt);
  game.spellCd = Math.max(0, game.spellCd - dt);
  game.rollCd = Math.max(0, game.rollCd - dt);
  game.invuln = Math.max(0, game.invuln - dt);
  game.hurt = Math.max(0, game.hurt - dt);
  game.shake = Math.max(0, game.shake - dt);
  game.attackFlash = Math.max(0, game.attackFlash - dt);

  if (game.hurtFlash > 0) {
    game.hurtFlash -= dt;
    if (game.hurtFlash <= 0) setVignette('');
  }

  // slow out-of-combat recovery
  game.regenDelay = Math.max(0, game.regenDelay - dt);
  if (game.regenDelay <= 0 && game.hp < 100 && !game.ended) {
    game.hp = Math.min(100, game.hp + dt * 3.2);
  }
  game.will = Math.min(100, game.will + dt * 6.5);
}

function updateDog(dt) {
  const back = -Math.sin(player.face), backz = -Math.cos(player.face);
  const side = Math.cos(player.face), sidez = -Math.sin(player.face);
  const tx = player.x + back * 1.6 + side * 1.1;
  const tz = player.z + backz * 1.6 + sidez * 1.1;
  const dx = tx - dog.root.position.x, dz = tz - dog.root.position.z;
  const d = Math.hypot(dx, dz);
  let moving = 0;
  if (d > 0.5) {
    const speed = d > 6 ? 6.2 : 3.4;
    dog.root.position.x += dx / d * Math.min(d, speed * dt);
    dog.root.position.z += dz / d * Math.min(d, speed * dt);
    moving = 1;
    const ang = Math.atan2(dx, dz);
    let diff = ((ang - dog.root.rotation.y + Math.PI * 3) % TAU) - Math.PI;
    dog.root.rotation.y += diff * Math.min(1, dt * 8);
  }
  dog.root.position.y = groundHeight(dog.root.position.x, dog.root.position.z);
  dog.walk += dt * (moving ? player.speed * 2.4 + 4 : 1.5);
  const sw = Math.sin(dog.walk) * 0.55;
  dog.legs[0].rotation.x = sw;
  dog.legs[1].rotation.x = -sw;
  dog.legs[2].rotation.x = -sw;
  dog.legs[3].rotation.x = sw;
  dog.tail.rotation.x = -0.2 + Math.sin(game.time * 5) * 0.15;
  dog.tail.rotation.z = Math.sin(game.time * 3.5) * 0.18;
  dog.head.rotation.y = Math.sin(game.time * 0.6) * 0.12;
  if (game.dogBark > 0) {
    game.dogBark = Math.max(0, game.dogBark - dt * 1.8);
    dog.head.position.y = 0.6 + Math.sin(game.dogBark * 18) * 0.035;
    if (Math.random() < dt * 6) audio.bark();
  } else {
    dog.head.position.y = 0.6;
  }
  if (moving && player.speed > 4 && Math.random() < dt * 4) {
    particles.emit(dog.root.position.x, dog.root.position.y + 0.05, dog.root.position.z, 0xa89a82,
      { count: 1, speed: 0.4, spread: 0.3, up: 0.3, life: 0.4, gravity: 0.2, drag: 3 });
  }
}

function updateWisps(dt) {
  const px = player.x, pz = player.z;
  for (const w of wisps) {
    if (!w.alive) continue;
    w.phase += dt;
    w.hit = Math.max(0, w.hit - dt);
    const pos = w.root.position;
    const dx = px - pos.x, dz = pz - pos.z;
    const dist = Math.hypot(dx, dz);

    // knockback
    pos.x += (w.kx || 0) * dt;
    pos.z += (w.kz || 0) * dt;
    w.kx = damp(w.kx || 0, 0, 6, dt);
    w.kz = damp(w.kz || 0, 0, 6, dt);

    const active = game.mode === 'hunt' && !game.ended;
    if (active && dist < 25) w.aggro = true;

    let hoverY;
    if (active && w.aggro) {
      if (dist > 4.1) {
        const sp = 2.15 + Math.sin(w.phase * 1.3) * 0.4;
        pos.x += dx / (dist || 1) * sp * dt;
        pos.z += dz / (dist || 1) * sp * dt;
      } else if (dist < 2.5) {
        pos.x -= dx / (dist || 1) * 1.2 * dt;
        pos.z -= dz / (dist || 1) * 1.2 * dt;
      } else {
        pos.x += (-dz / (dist || 1)) * 0.8 * dt;
        pos.z += (dx / (dist || 1)) * 0.8 * dt;
      }
      hoverY = groundHeight(pos.x, pos.z) + 1.45 + Math.sin(w.phase * 2.2) * 0.22;
      w.fire -= dt;
      const canSee = dist < 20;
      if (w.fire <= 0 && canSee && game.mode === 'hunt') {
        w.fire = 2.4 + Math.random() * 1.2;
        const origin = new THREE.Vector3(pos.x, pos.y, pos.z);
        const target = new THREE.Vector3(player.x, player.y + 0.95, player.z);
        bolts.spawn(origin, target, 8.5);
        audio.bolt();
        w.glow.material.opacity = 1;
        particles.emit(pos.x, pos.y, pos.z, 0xffb066, { count: 8, speed: 1.6, spread: 0.8, up: 1.2, life: 0.4, gravity: -1, drag: 2 });
      }
      if (dist < 1.6) {
        w.contact = (w.contact || 0) - dt;
        if (w.contact <= 0) { hurtPlayer(8); w.contact = 1.4; }
      }
    } else {
      // drift around home
      const hx = w.home.x + Math.sin(w.phase * 0.5 + w.phase) * 1.4;
      const hz = w.home.z + Math.cos(w.phase * 0.4) * 1.4;
      pos.x = damp(pos.x, hx, 0.8, dt);
      pos.z = damp(pos.z, hz, 0.8, dt);
      hoverY = w.home.y + 1.35 + Math.sin(w.phase * 1.4) * 0.2;
    }
    pos.y = damp(pos.y, hoverY, 5, dt);
    w.root.rotation.y = Math.atan2(px - pos.x, pz - pos.z);

    const pulse = 1 + Math.sin(w.phase * 3.1) * 0.06;
    w.core.scale.setScalar(w.hit > 0 ? 1.22 : pulse);
    w.shell.rotation.y += dt * 0.7;
    w.shell.rotation.x += dt * 0.3;
    w.shell.scale.setScalar(0.94 + Math.sin(w.phase * 2) * 0.05);
    w.glow.material.opacity = 0.48 + Math.sin(w.phase * 2.7) * 0.1;
    w.innerGlow.scale.setScalar(1.0 + Math.sin(w.phase * 5) * 0.12);
    w.coreMat.emissiveIntensity = w.hit > 0 ? 4.5 : 2.4 + Math.sin(w.phase * 3.4) * 0.35;
    w.coreMat.color.setHex(w.hit > 0 ? 0xfff1cd : 0xa9f2e4);
    for (let i = 0; i < w.shards.length; i++) {
      const s = w.shards[i];
      const a = w.phase * 0.8 + i / w.shards.length * TAU;
      s.position.set(Math.cos(a) * 0.62, Math.sin(a * 2.1) * 0.16, Math.sin(a) * 0.62);
      s.rotation.x += dt * 2; s.rotation.y += dt * 1.7;
    }
    if (Math.random() < dt * 6) {
      particles.emit(pos.x, pos.y + 0.1, pos.z, 0x6fe6d2,
        { count: 1, speed: 0.25, spread: 0.2, up: -0.1, life: 0.9, gravity: 0.1, drag: 0.6 });
    }
  }
}

function updateBolts(dt) {
  const expired = bolts.update(dt);
  for (const b of expired) {
    particles.emit(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 0xffa45c,
      { count: 7, speed: 1.4, spread: 0.8, up: 1, life: 0.4, gravity: -2, drag: 2 });
  }
  for (const b of bolts.items) {
    if (!b.alive) continue;
    const dx = b.mesh.position.x - player.x;
    const dz = b.mesh.position.z - player.z;
    const dy = b.mesh.position.y - (player.y + 1.0);
    if (dx * dx + dz * dz < 0.8 && Math.abs(dy) < 1.25) {
      b.alive = false; b.mesh.visible = false;
      hurtPlayer(9);
      particles.emit(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 0xff9a57,
        { count: 12, speed: 2.2, spread: 1.2, up: 1.5, life: 0.5, gravity: -2, drag: 2 });
    }
  }
}

function updateInteractions() {
  const dk = Math.hypot(player.x - KEEPER_POS.x, player.z - KEEPER_POS.z);
  const ds = Math.hypot(player.x - SHRINE_POS.x, player.z - SHRINE_POS.z);
  let show = false, text = '', key = game.touch ? '◈' : 'E';
  if ((game.mode === 'explore' || game.mode === 'hunt') && dk < 4.6) {
    if (game.mode === 'explore') { show = true; text = 'Speak with Mara'; }
    else { show = true; text = 'Mara waits by the fire'; }
  } else if (game.mode === 'hunt' && ds < 5.6) {
    show = true;
    text = game.embers >= 5 ? 'Kindle the old shrine' : `The shrine is cold — ${5 - game.embers} spark${5 - game.embers === 1 ? '' : 's'} remain`;
  }
  ui.prompt.classList.toggle('show', show);
  if (show) { ui.promptText.textContent = text; ui.promptKey.textContent = key; }
  ui.talk?.classList.toggle('ready', show);
}

function updateQuestMarker(dt) {
  if (!game.started || game.ended) { marker.visible = false; ui.compass.classList.add('hide'); return; }
  let tx = 0, tz = 0, ty = 0, label = '';
  if (game.mode === 'explore') {
    tx = KEEPER_POS.x; tz = KEEPER_POS.z; ty = keeperRig.root.position.y + 2.9; label = 'Mara';
  } else if (game.mode === 'hunt') {
    if (game.embers >= 5) {
      tx = SHRINE_POS.x; tz = SHRINE_POS.z; ty = world.shrine.ground + 5.4; label = 'Shrine';
    } else {
      let best = null, bd = 1e9;
      for (const w of wisps) {
        if (!w.alive) continue;
        const d = Math.hypot(w.root.position.x - player.x, w.root.position.z - player.z);
        if (d < bd) { bd = d; best = w; }
      }
      if (best) { tx = best.root.position.x; tz = best.root.position.z; ty = best.root.position.y + 1.7; label = 'Ember-wisp'; }
    }
  } else {
    marker.visible = false;
    ui.compass.classList.add('hide');
    return;
  }
  if (!label) { marker.visible = false; ui.compass.classList.add('hide'); return; }
  const near = Math.hypot(tx - player.x, tz - player.z);
  marker.visible = near > 5;
  marker.position.set(tx, ty + Math.sin(game.time * 2.2) * 0.18, tz);
  marker.rotation.y += dt * 1.6;
  markerGem.rotation.x = game.time * 1.3;
  markerGlow.material.opacity = 0.45 + Math.sin(game.time * 3) * 0.12;

  ui.compass.classList.toggle('hide', near < 4.5);
  if (near >= 4.5) {
    const ta = Math.atan2(tx - player.x, tz - player.z);
    const view = game.camYaw + Math.PI;
    let rel = ta - view;
    rel = ((rel + Math.PI * 3) % TAU) - Math.PI;
    ui.compassArrow.style.transform = `rotate(${-rel * 180 / Math.PI}deg)`;
    ui.compassLabel.textContent = label;
    ui.compassDist.textContent = `${Math.round(near)} m`;
  }
}

function updateCamera(dt) {
  const targetY = player.y + 1.3;
  if (game.mode === 'intro') {
    game.camYaw = 0.62 + Math.sin(game.time * 0.06) * 0.26;
    game.camPitch = 0.3;
    game.camDist = 10.6;
  } else if (game.camYaw === undefined) {
    game.camYaw = 0.18;
  }
  // Gently fall in behind the wanderer when moving and not steering the camera.
  if (game.started && !game.ended && game.time - game.lastLook > 2.4 && player.speed > 2.2) {
    const target = player.face + Math.PI;
    let diff = ((target - game.camYaw + Math.PI * 3) % TAU) - Math.PI;
    game.camYaw += diff * Math.min(1, dt * 0.75);
  }
  const yaw = game.camYaw, pitch = game.camPitch, dist = game.camDist;
  const hx = Math.sin(yaw) * Math.cos(pitch) * dist;
  const hz = Math.cos(yaw) * Math.cos(pitch) * dist;
  const hy = Math.sin(pitch) * dist;
  const desired = new THREE.Vector3(player.x + hx, targetY + hy, player.z + hz);

  // Clear the line of sight: thin tree trunks between the camera and the
  // wanderer pull the camera in, and a camera that would sit inside a canopy
  // slides forward until it is clear of the leaves.
  const focus = new THREE.Vector3(player.x, targetY, player.z);
  const segX = desired.x - focus.x, segZ = desired.z - focus.z;
  const segLen2 = segX * segX + segZ * segZ;
  if (segLen2 > 0.04) {
    let allowed = 1;
    for (const t of world.treeColliders) {
      const fx = focus.x - t.x, fz = focus.z - t.z;
      const b = 2 * (fx * segX + fz * segZ);
      const cT = fx * fx + fz * fz - (t.r + 0.24) ** 2;
      const discT = b * b - 4 * segLen2 * cT;
      if (discT > 0) {
        const k = (-b - Math.sqrt(discT)) / (2 * segLen2);
        const yAt = focus.y + (desired.y - focus.y) * k;
        if (k > 0.04 && k < allowed && yAt > t.base - 1 && yAt < t.top + 1) {
          allowed = Math.max(0.18, k - 0.025);
        }
      }
    }
    if (allowed < 1) {
      desired.x = focus.x + segX * allowed;
      desired.y = focus.y + (desired.y - focus.y) * allowed;
      desired.z = focus.z + segZ * allowed;
    }
  }

  // Keep the camera above the ground / out of hills.
  const minY = groundHeight(desired.x, desired.z) + 0.9;
  if (desired.y < minY) desired.y = minY;

  if (game.cameraSnap) {
    camera.position.copy(desired);
    game.cameraSnap = false;
  } else {
    const lambda = 12;
    camera.position.x = damp(camera.position.x, desired.x, lambda, dt);
    camera.position.y = damp(camera.position.y, desired.y, lambda, dt);
    camera.position.z = damp(camera.position.z, desired.z, lambda, dt);
  }
  const lookAt = new THREE.Vector3(player.x, targetY, player.z);
  camera.lookAt(lookAt);
  if (game.shake > 0) {
    const s = game.shake * 0.55;
    camera.position.x += rand(s, -s);
    camera.position.y += rand(s, -s);
    camera.position.z += rand(s, -s);
    camera.rotateZ(rand(s * 0.02, -s * 0.02));
  }
}

function updateSun() {
  sun.position.set(player.x + SUN_DIR.x * 60, player.y + SUN_DIR.y * 60, player.z + SUN_DIR.z * 60);
  sun.target.position.set(player.x, player.y, player.z);
  sun.target.updateMatrixWorld();
}

function updateKeeper(dt) {
  keeperRig.root.rotation.y = 0.35 + Math.sin(game.time * 0.25) * 0.08;
  keeperRig.shawl.position.y = 1.18 + Math.sin(game.time * 1.2) * 0.012;
  keeperRig.lampGlow.material.opacity = 0.55 + Math.sin(game.time * 5.2) * 0.06;
}

/* ------------------------------------------------------------------ *
 *  Main loop & quality scaling
 * ------------------------------------------------------------------ */
let last = performance.now();
let elapsed = 0;
let frameAcc = 0, frameN = 0, renderScale = 1, nextQualityCheck = 0;

function applyRenderScale() {
  renderer.setPixelRatio(Math.max(0.7, QUALITY.pixelCap * renderScale));
}

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

function frame() {
  const now = performance.now();
  const raw = (now - last) / 1000;
  last = now;
  const dt = raw > 0 ? Math.min(0.05, raw) : 0.016;
  elapsed += dt;
  game.time += dt;
  if (game.started && !game.ended) game.playTime += dt;

  if (game.toastT > 0) {
    game.toastT -= dt;
    if (game.toastT <= 0) ui.toast.classList.remove('show');
  }

  if (game.started && !game.ended) {
    updatePlayer(dt);
  } else {
    updatePlayer(dt);
    playerRig.root.position.set(player.x, player.y, player.z);
    playerRig.root.rotation.y = player.face;
    animatePlayer(playerRig, dt, game.time, { speed: 0, attack: 0, spell: 0, roll: 0, hurt: 0 });
  }
  updateDog(dt);
  updateWisps(dt);
  updateBolts(dt);
  updateKeeper(dt);
  world.update(dt, elapsed);
  particles.update(dt);
  waves.update(dt);
  updateQuestMarker(dt);
  updateInteractions();
  updateCamera(dt);
  updateSun();
  updateHud();

  // quality governor
  frameAcc += raw; frameN++;
  if (frameN >= 75 && game.started) {
    const avg = frameAcc / frameN;
    frameAcc = 0; frameN = 0;
    if (avg > 0.023 && renderScale > 0.72) { renderScale = Math.max(0.72, renderScale - 0.1); applyRenderScale(); }
    else if (avg < 0.0145 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.05); applyRenderScale(); }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ *
 *  Boot
 * ------------------------------------------------------------------ */
game.touch = isTouch && matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch-ui', game.touch);
ui.hud.style.opacity = '0';
ui.promptKey.textContent = game.touch ? '◈' : 'E';
ui.soundBtn.style.display = game.touch ? 'grid' : 'none';
updateHud(true);
playerRig.root.position.set(player.x, player.y, player.z);
playerRig.root.rotation.y = player.face;
dog.root.position.set(player.x + 1.5, terrainHeight(player.x + 1.5, player.z + 1.4), player.z + 1.4);
keeperRig.root.position.y = terrainHeight(KEEPER_POS.x, KEEPER_POS.z);
ui.qualityChip.textContent = QUALITY.mobile ? `Mobile · ${QUALITY.tier} 3D` : 'High-fidelity 3D';
ui.loader.style.display = 'none';
ui.start.disabled = false;
resize();
updateCamera(0);
renderer.render(scene, camera);
requestAnimationFrame(frame);

// Small debug surface for automated visual checks.
window.__ash = {
  game, player, wisps, world, camera, renderer, playerRig,
  start: startGame, accept: acceptQuest, reset: resetGame,
  teleport(x, z, yaw) {
    player.x = x; player.z = z; player.y = groundHeight(x, z);
    player.vx = player.vz = 0;
    playerRig.root.position.set(x, player.y, z);
    if (yaw !== undefined) { player.face = yaw; game.camYaw = yaw + Math.PI; }
    game.cameraSnap = true;
  },
  hunt() { game.started = true; game.mode = 'hunt'; game.embers = 0; ui.intro.classList.add('hidden'); ui.hud.style.opacity = '1'; updateQuestUI(); },
  setEmbers(n) { game.embers = n; updateHud(true); updateQuestUI(); if (n >= 5) { game.shrineLit = true; world.setShrineLit(true); } },
  win(which) { finish(which); },
  hurt(d) { hurtPlayer(d); },
  look(yaw, pitch, dist) { game.camYaw = yaw; game.camPitch = pitch ?? game.camPitch; game.camDist = dist ?? game.camDist; game.cameraSnap = true; },
};
