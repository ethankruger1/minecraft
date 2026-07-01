import * as THREE from 'three';
import { buildAtlas, buildCrackAtlas, TILE } from './textures.js';
import { World, CHUNK, WORLD_H } from './world.js';
import { Player } from './player.js';
import { BY_ID, HOTBAR, hardness } from './blocks.js';

const SKY = 0x8fc7ec;
const RADIUS = 7;            // render distance in chunks

// ---------------- renderer / scene ----------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(SKY);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, RADIUS * CHUNK * 0.55, RADIUS * CHUNK - 6);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, RADIUS * CHUNK + 40);

// lights
const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
sun.position.set(0.6, 1.0, 0.35);
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x55633a, 0.65));
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// ---------------- textures / materials ----------------
const atlas = buildAtlas();
const crack = buildCrackAtlas();

const opaqueMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
opaqueMat.map.flipY = false;
const transMat = new THREE.MeshLambertMaterial({
  map: atlas.texture, vertexColors: true, transparent: true,
  alphaTest: 0.1, side: THREE.DoubleSide, depthWrite: true,
});
transMat.map.flipY = false;

// ---------------- world / player ----------------
const world = new World();
world.setMaterials(atlas, opaqueMat, transMat);
scene.add(world.group);

const player = new Player(camera);
// spawn on dry, tree-free land with clear sky above
{
  let best = { x: 8, z: 8, h: world.columnHeight(8, 8) };
  outer:
  for (let r = 0; r <= 12; r++) {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const x = 8 + dx, z = 8 + dz;
        const h = world.columnHeight(x, z);
        if (h <= 26) continue;                       // not underwater
        let treeNear = false;
        for (let tx = -2; tx <= 2 && !treeNear; tx++)
          for (let tz = -2; tz <= 2; tz++)
            if (world.treeAt(x + tx, z + tz)) { treeNear = true; break; }
        if (treeNear) continue;
        best = { x, z, h };
        break outer;
      }
  }
  player.pos.set(best.x + 0.5, best.h + 2.2, best.z + 0.5);
}

// ---------------- block selection highlight ----------------
const hlGeo = new THREE.BoxGeometry(1.001, 1.001, 1.001);
const hlEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(hlGeo),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);
hlEdges.visible = false;
scene.add(hlEdges);

// crack overlay cube
const crackMat = new THREE.MeshBasicMaterial({
  map: crack.texture, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
});
crack.texture.repeat.set(1 / crack.stages, 1);
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), crackMat);
crackMesh.visible = false;
scene.add(crackMesh);

// ---------------- particles ----------------
const tileColorCache = {};
function tileColor(name) {
  if (tileColorCache[name]) return tileColorCache[name];
  const i = atlas.index[name];
  const col = i % atlas.cols, row = (i / atlas.cols) | 0;
  const ctx = atlas.canvas.getContext('2d');
  const d = ctx.getImageData(col * TILE + 8, row * TILE + 8, 1, 1).data;
  const c = new THREE.Color(d[0] / 255, d[1] / 255, d[2] / 255);
  tileColorCache[name] = c;
  return c;
}

const PARTICLES = [];
const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
function spawnBreakParticles(bx, by, bz, id) {
  const block = BY_ID[id];
  const color = tileColor(block.tiles[2]);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(particleGeo, new THREE.MeshLambertMaterial({ color }));
    m.position.set(bx + 0.2 + Math.random() * 0.6, by + 0.2 + Math.random() * 0.6, bz + 0.2 + Math.random() * 0.6);
    scene.add(m);
    PARTICLES.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 5 + 1, (Math.random() - 0.5) * 4),
      life: 0.6 + Math.random() * 0.3,
    });
  }
}
function updateParticles(dt) {
  for (let i = PARTICLES.length - 1; i >= 0; i--) {
    const p = PARTICLES[i];
    p.life -= dt;
    p.vel.y -= 22 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 4; p.mesh.rotation.y += dt * 3;
    if (p.life <= 0) {
      scene.remove(p.mesh); p.mesh.material.dispose();
      PARTICLES.splice(i, 1);
    } else {
      p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.7));
    }
  }
}

// ---------------- input ----------------
const input = { forward: false, back: false, left: false, right: false, up: false, down: false, sprint: false };
let locked = false;
let selected = 0;        // hotbar index
let breaking = false;
let breakTarget = null;  // 'x,y,z'
let breakProgress = 0;

const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('play-btn');
const crosshair = document.getElementById('crosshair');
const hotbarEl = document.getElementById('hotbar');
const hud = document.getElementById('hud');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function lockPointer() {
  if (isTouch) { startGame(); return; }
  canvas.requestPointerLock();
}
function startGame() {
  overlay.classList.add('hidden');
  crosshair.style.display = 'block';
  hotbarEl.style.display = 'flex';
  hud.style.display = 'block';
  if (isTouch) { document.getElementById('touch-controls').classList.remove('hidden'); locked = true; }
}

playBtn.addEventListener('click', lockPointer);

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) startGame();
  else if (!isTouch) {
    overlay.classList.remove('hidden');
    crosshair.style.display = 'none';
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const s = 0.0022;
  player.addLook(e.movementX * s, e.movementY * s);
});

const keyMap = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  ShiftLeft: 'down', ShiftRight: 'down',
};
addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (!e.repeat) { input.up = true; player.tryToggleFly(); }
    e.preventDefault();
  }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.sprint = true;
  if (keyMap[e.code]) input[keyMap[e.code]] = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.down = true;
  if (/^Digit[1-9]$/.test(e.code)) {
    const n = +e.code.slice(5) - 1;
    if (n < HOTBAR.length) setSelected(n);
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') input.up = false;
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') input.sprint = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.down = false;
  if (keyMap[e.code]) input[keyMap[e.code]] = false;
});

addEventListener('wheel', (e) => {
  if (!locked) return;
  setSelected((selected + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length);
}, { passive: true });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (!locked) { lockPointer(); return; }
  if (e.button === 0) breaking = true;
  else if (e.button === 2) placeBlock();
  else if (e.button === 1) pickBlock();
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) { breaking = false; breakProgress = 0; breakTarget = null; crackMesh.visible = false; }
});

// ---------------- block actions ----------------
function currentRay() {
  return world.raycast(player.eyePos, player.lookDir(), 7);
}

function placeBlock() {
  const r = currentRay();
  if (!r) return;
  const { x, y, z } = r.place;
  if (y < 0 || y >= WORLD_H) return;
  // don't place inside the player
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  if (x + 1 > px - 0.3 && x < px + 0.3 && z + 1 > pz - 0.3 && z < pz + 0.3 &&
      y + 1 > py && y < py + 1.8) return;
  world.setBlock(x, y, z, HOTBAR[selected]);
}

function pickBlock() {
  const r = currentRay();
  if (!r) return;
  const idx = HOTBAR.indexOf(r.id);
  if (idx >= 0) setSelected(idx);
}

// ---------------- hotbar UI ----------------
function drawBlockIcon(cv, id) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  const block = BY_ID[id];
  if (!block || id === 0) return;
  const tileRect = (name) => {
    const i = atlas.index[name];
    return { sx: (i % atlas.cols) * TILE, sy: ((i / atlas.cols) | 0) * TILE };
  };
  const cx = 32, hw = 22, qh = 12, sh = 22, y0 = 6;
  const topTop = [cx, y0], topRight = [cx + hw, y0 + qh], topBottom = [cx, y0 + 2 * qh], topLeft = [cx - hw, y0 + qh];
  const leftBottom = [cx - hw, y0 + qh + sh], midBottom = [cx, y0 + 2 * qh + sh], rightBottom = [cx + hw, y0 + qh + sh];

  function face(name, O, X, Y, dim) {
    const { sx, sy } = tileRect(name);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(O[0], O[1]);
    ctx.lineTo(O[0] + X[0], O[1] + X[1]);
    ctx.lineTo(O[0] + X[0] + Y[0], O[1] + X[1] + Y[1]);
    ctx.lineTo(O[0] + Y[0], O[1] + Y[1]);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(X[0] / TILE, X[1] / TILE, Y[0] / TILE, Y[1] / TILE, O[0], O[1]);
    ctx.drawImage(atlas.canvas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fill();
    ctx.restore();
  }
  // top, left, right faces
  face(block.tiles[2], topLeft, [hw, -qh], [hw, qh], 0.0);
  face(block.tiles[5], topLeft, [hw, qh], [0, sh], 0.28);
  face(block.tiles[0], topBottom, [hw, -qh], [0, sh], 0.14);
}

function buildHotbar() {
  hotbarEl.innerHTML = '';
  HOTBAR.forEach((id, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selected ? ' active' : '');
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    drawBlockIcon(cv, id);
    slot.appendChild(cv);
    const num = document.createElement('div');
    num.className = 'num'; num.textContent = i + 1;
    slot.appendChild(num);
    const name = document.createElement('div');
    name.className = 'name'; name.textContent = BY_ID[id].name;
    slot.appendChild(name);
    slot.addEventListener('click', () => setSelected(i));
    hotbarEl.appendChild(slot);
  });
}
function setSelected(i) {
  selected = i;
  [...hotbarEl.children].forEach((el, idx) => el.classList.toggle('active', idx === i));
}
buildHotbar();

// ---------------- touch controls ----------------
if (isTouch) setupTouch();
function setupTouch() {
  const stick = document.getElementById('move-stick');
  const nub = stick.querySelector('.nub');
  let sid = null, sx0 = 0, sy0 = 0;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; sid = t.identifier;
    sx0 = t.clientX; sy0 = t.clientY; e.preventDefault();
  });
  stick.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      let dx = t.clientX - sx0, dy = t.clientY - sy0;
      const mag = Math.hypot(dx, dy) || 1, max = 45;
      const cl = Math.min(mag, max);
      dx = dx / mag * cl; dy = dy / mag * cl;
      nub.style.transform = `translate(${dx - 27}px,${dy - 27}px)`;
      input.forward = dy < -12; input.back = dy > 12;
      input.left = dx < -12; input.right = dx > 12;
    }
    e.preventDefault();
  });
  const endStick = (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      sid = null; nub.style.transform = 'translate(-27px,-27px)';
      input.forward = input.back = input.left = input.right = false;
    }
  };
  stick.addEventListener('touchend', endStick);
  stick.addEventListener('touchcancel', endStick);

  const pad = document.getElementById('look-pad');
  let lid = null, lx = 0, ly = 0, moved = 0, downT = 0;
  pad.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY;
    moved = 0; downT = performance.now(); e.preventDefault();
  });
  pad.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lid) {
      const dx = t.clientX - lx, dy = t.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      player.addLook(dx * 0.005, dy * 0.005);
      lx = t.clientX; ly = t.clientY;
    }
    e.preventDefault();
  });
  pad.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lid) {
      lid = null;
      if (moved < 10 && performance.now() - downT < 250) {
        // tap = break a block quickly
        const r = currentRay();
        if (r && !BY_ID[r.id].unbreakable) { world.setBlock(r.hit.x, r.hit.y, r.hit.z, 0); spawnBreakParticles(r.hit.x, r.hit.y, r.hit.z, r.id); }
      }
    }
  });
  document.getElementById('btn-jump').addEventListener('touchstart', (e) => { input.up = true; player.tryToggleFly(); e.preventDefault(); });
  document.getElementById('btn-jump').addEventListener('touchend', () => input.up = false);
  document.getElementById('btn-down').addEventListener('touchstart', (e) => { input.down = true; e.preventDefault(); });
  document.getElementById('btn-down').addEventListener('touchend', () => input.down = false);
  document.getElementById('btn-fly').addEventListener('touchstart', (e) => { player.flying = !player.flying; player.vel.y = 0; e.preventDefault(); });
}

// ---------------- resize ----------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- main loop ----------------
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;
let started = false;

function updateBreaking(dt) {
  if (!breaking || !locked) { crackMesh.visible = false; return; }
  const r = currentRay();
  if (!r || BY_ID[r.id].unbreakable) { crackMesh.visible = false; breakProgress = 0; breakTarget = null; return; }
  const key = `${r.hit.x},${r.hit.y},${r.hit.z}`;
  if (key !== breakTarget) { breakTarget = key; breakProgress = 0; }
  breakProgress += dt / hardness(r.id);
  if (breakProgress >= 1) {
    world.setBlock(r.hit.x, r.hit.y, r.hit.z, 0);
    spawnBreakParticles(r.hit.x, r.hit.y, r.hit.z, r.id);
    breakProgress = 0; breakTarget = null; crackMesh.visible = false;
    return;
  }
  const stage = Math.min(crack.stages - 1, Math.floor(breakProgress * crack.stages));
  crack.texture.offset.x = stage / crack.stages;
  crackMesh.position.set(r.hit.x + 0.5, r.hit.y + 0.5, r.hit.z + 0.5);
  crackMesh.visible = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (locked) {
    player.update(dt, world, input);
  }

  // chunk streaming around player
  const ccx = Math.floor(player.pos.x / CHUNK), ccz = Math.floor(player.pos.z / CHUNK);
  world.update(ccx, ccz, RADIUS, 2);

  // highlight + breaking
  if (locked) {
    const r = currentRay();
    if (r) { hlEdges.visible = true; hlEdges.position.set(r.hit.x + 0.5, r.hit.y + 0.5, r.hit.z + 0.5); }
    else hlEdges.visible = false;
  } else hlEdges.visible = false;
  updateBreaking(dt);
  updateParticles(dt);

  // sun follows player so shadows/fog stay centered
  sun.position.set(player.pos.x + 60, player.pos.y + 100, player.pos.z + 35);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);

  // hud
  fpsFrames++; fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsTimer)} fps`;
    fpsTimer = 0; fpsFrames = 0;
  }
  coordsEl.textContent =
    `x ${player.pos.x.toFixed(1)}  y ${player.pos.y.toFixed(1)}  z ${player.pos.z.toFixed(1)}  ${player.flying ? '✈ fly' : 'walk'}`;
}

// Build the spawn area before enabling play, so it looks ready.
function warmup() {
  const ccx = Math.floor(player.pos.x / CHUNK), ccz = Math.floor(player.pos.z / CHUNK);
  // build a few rings synchronously
  for (let i = 0; i < 30; i++) world.update(ccx, ccz, 4, 8);
  document.querySelector('.hint').textContent = 'Ready — click Play!';
  playBtn.disabled = false;
}
playBtn.disabled = true;
requestAnimationFrame(frame);
setTimeout(warmup, 50);

if (location.search.includes('debug')) {
  window.__game = { player, world, input, get locked() { return locked; } };
}
