import * as THREE from 'three';
import { Noise } from './noise.js';
import { BY_ID, isSolid, isTransparent, isLiquid } from './blocks.js';
import { TILE } from './textures.js';

export const CHUNK = 16;
export const WORLD_H = 72;
export const SEA_LEVEL = 26;

// is the block fully opaque & solid (used for face culling + AO)
function opaque(id) {
  if (id === 0) return false;
  const b = BY_ID[id];
  return b && b.solid && !b.transparent && !b.liquid;
}

// Face geometry table. corners order BL,BR,TR,TL. u,v are tangent unit axes.
const FACES = [
  { dir: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0],  corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, // +X
  { dir: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0],  corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] }, // -X
  { dir: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] }, // +Y
  { dir: [0, -1, 0], u: [-1, 0, 0], v: [0, 0, -1], corners: [[1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0]] }, // -Y
  { dir: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0],  corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] }, // +Z
  { dir: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0],  corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }, // -Z
];
// corner sign (su, sv) for BL,BR,TR,TL
const CORNER_SIGN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AO_LEVELS = [0.5, 0.7, 0.86, 1.0];

export class World {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.seed = seed;
    this.noise = new Noise(seed);
    this.noise2 = new Noise(seed ^ 0x1234);
    this.chunks = new Map();          // key -> chunk record
    this.group = new THREE.Group();   // holds all meshes
    this.material = null;
    this.transMaterial = null;
    this.atlas = null;
    this.remeshQueue = [];
  }

  setMaterials(atlas, opaqueMat, transMat) {
    this.atlas = atlas;
    this.material = opaqueMat;
    this.transMaterial = transMat;
  }

  key(cx, cz) { return cx + ',' + cz; }

  // ---------------- terrain generation ----------------
  columnHeight(wx, wz) {
    const n = this.noise;
    const continent = n.fbm2(wx / 220, wz / 220, 4) * 0.5 + 0.5;
    const hills = n.fbm2(wx / 60, wz / 60, 4);
    const detail = n.fbm2(wx / 22, wz / 22, 3);
    let h = SEA_LEVEL - 4 + continent * 26 + hills * 7 + detail * 3;
    return Math.max(2, Math.min(WORLD_H - 8, Math.round(h)));
  }

  // deterministic tree origin test
  treeAt(wx, wz) {
    // hash → pseudo-random in [0,1)
    let h = (wx * 374761393 + wz * 668265263) ^ this.seed;
    h = (h ^ (h >> 13)) * 1274126177;
    h = (h ^ (h >> 16)) >>> 0;
    return (h / 4294967296) < 0.018;
  }

  generateChunkData(cx, cz) {
    const blocks = new Uint8Array(CHUNK * CHUNK * WORLD_H);
    const idx = (x, y, z) => x + z * CHUNK + y * CHUNK * CHUNK;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;

    for (let x = 0; x < CHUNK; x++) {
      for (let z = 0; z < CHUNK; z++) {
        const wx = baseX + x, wz = baseZ + z;
        const h = this.columnHeight(wx, wz);
        const beach = h <= SEA_LEVEL + 1;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = 14;                     // bedrock
          else if (y < h - 3) id = 3;               // stone
          else if (y < h) id = beach ? 5 : 2;       // sand / dirt
          else id = beach ? 5 : (h > SEA_LEVEL + 14 ? 12 : 1); // sand / snow / grass
          blocks[idx(x, y, z)] = id;
        }
        // water fill
        for (let y = h + 1; y <= SEA_LEVEL; y++) blocks[idx(x, y, z)] = 11;
      }
    }

    // trees (scan a margin so canopies crossing borders are complete)
    for (let x = -2; x < CHUNK + 2; x++) {
      for (let z = -2; z < CHUNK + 2; z++) {
        const wx = baseX + x, wz = baseZ + z;
        if (!this.treeAt(wx, wz)) continue;
        const h = this.columnHeight(wx, wz);
        if (h <= SEA_LEVEL + 1 || h > SEA_LEVEL + 13) continue; // only on grassy land
        const th = 4 + (Math.abs((wx * 31 + wz * 17)) % 3);     // trunk height 4-6
        const place = (px, py, pz, id, overwriteLeaves) => {
          if (px < 0 || pz < 0 || px >= CHUNK || pz >= CHUNK) return;
          if (py < 0 || py >= WORLD_H) return;
          const cur = blocks[idx(px, py, pz)];
          if (cur !== 0 && !(overwriteLeaves && cur === 9)) {
            if (id === 7) blocks[idx(px, py, pz)] = id; // trunk overrides
            return;
          }
          blocks[idx(px, py, pz)] = id;
        };
        // canopy
        const top = h + th;
        for (let ly = -3; ly <= 1; ly++) {
          const r = ly <= -2 ? 2 : (ly === 1 ? 1 : 2);
          for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && (r === 2)) continue; // round corners
              if (ly === 1 && (Math.abs(dx) + Math.abs(dz) > 1)) continue;
              place(x + dx, top + ly, z + dz, 9, false);
            }
        }
        // trunk
        for (let ty = 0; ty < th; ty++) place(x, h + ty, z, 7, true);
      }
    }

    return blocks;
  }

  getChunkData(cx, cz) {
    const k = this.key(cx, cz);
    let rec = this.chunks.get(k);
    if (!rec) {
      rec = { cx, cz, blocks: this.generateChunkData(cx, cz), mesh: null, trans: null, dirty: true };
      this.chunks.set(k, rec);
    } else if (!rec.blocks) {
      rec.blocks = this.generateChunkData(cx, cz);
    }
    return rec;
  }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_H) return 0;
    const cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
    const rec = this.getChunkData(cx, cz);
    const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
    return rec.blocks[lx + lz * CHUNK + wy * CHUNK * CHUNK];
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_H) return;
    const cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
    const rec = this.getChunkData(cx, cz);
    const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
    rec.blocks[lx + lz * CHUNK + wy * CHUNK * CHUNK] = id;
    this.markDirty(cx, cz);
    // remesh neighbors if on a border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const rec = this.chunks.get(this.key(cx, cz));
    if (rec) { rec.dirty = true; if (!this.remeshQueue.includes(rec)) this.remeshQueue.push(rec); }
  }

  // UV rect for a tile name
  tileUV(name) {
    const i = this.atlas.index[name];
    const col = i % this.atlas.cols;
    const row = (i / this.atlas.cols) | 0;
    const W = this.atlas.canvas.width, H = this.atlas.canvas.height;
    const pad = 0.5; // half-texel inset to avoid bleeding
    const u0 = (col * TILE + pad) / W;
    const u1 = ((col + 1) * TILE - pad) / W;
    const v0 = (row * TILE + pad) / H;
    const v1 = ((row + 1) * TILE - pad) / H;
    return { u0, u1, v0, v1 };
  }

  aoFor(wx, wy, wz, face) {
    const [nx, ny, nz] = face.dir;
    const bx = wx + nx, by = wy + ny, bz = wz + nz;
    const out = [];
    for (const [su, sv] of CORNER_SIGN) {
      const s1 = opaque(this.getBlock(bx + face.u[0] * su, by + face.u[1] * su, bz + face.u[2] * su));
      const s2 = opaque(this.getBlock(bx + face.v[0] * sv, by + face.v[1] * sv, bz + face.v[2] * sv));
      const co = opaque(this.getBlock(
        bx + face.u[0] * su + face.v[0] * sv,
        by + face.u[1] * su + face.v[1] * sv,
        bz + face.u[2] * su + face.v[2] * sv));
      const level = (s1 && s2) ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (co ? 1 : 0));
      out.push(AO_LEVELS[level]);
    }
    return out;
  }

  buildMesh(rec) {
    const { cx, cz, blocks } = rec;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    const idx = (x, y, z) => x + z * CHUNK + y * CHUNK * CHUNK;

    const op = { pos: [], norm: [], uv: [], col: [], index: [] };
    const tr = { pos: [], norm: [], uv: [], col: [], index: [] };

    for (let y = 0; y < WORLD_H; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = blocks[idx(x, y, z)];
          if (id === 0) continue;
          const block = BY_ID[id];
          const wx = baseX + x, wy = y, wz = baseZ + z;
          const sink = (block.transparent || block.liquid) ? tr : op;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nId = this.getBlock(wx + face.dir[0], wy + face.dir[1], wz + face.dir[2]);
            // cull: skip if neighbor opaque, or same transparent kind, or liquid behind liquid
            if (opaque(nId)) continue;
            if (nId === id && (block.transparent || block.liquid)) continue;
            if (isLiquid(id) && isLiquid(nId)) continue;

            const tileName = block.tiles[f];
            const { u0, u1, v0, v1 } = this.tileUV(tileName);
            const ao = this.aoFor(wx, wy, wz, face);
            const vBase = sink.pos.length / 3;

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              sink.pos.push(x + corner[0], y + corner[1], z + corner[2]);
              sink.norm.push(face.dir[0], face.dir[1], face.dir[2]);
              const b = ao[c];
              sink.col.push(b, b, b);
            }
            // uv: BL(u0,v1) BR(u1,v1) TR(u1,v0) TL(u0,v0)
            sink.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
            // flip quad triangulation to keep AO continuous
            if (ao[0] + ao[2] > ao[1] + ao[3]) {
              sink.index.push(vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3);
            } else {
              sink.index.push(vBase + 1, vBase + 2, vBase + 3, vBase + 1, vBase + 3, vBase);
            }
          }
        }
      }
    }

    rec.mesh = this._toMesh(rec.mesh, op, this.material, baseX, baseZ);
    rec.trans = this._toMesh(rec.trans, tr, this.transMaterial, baseX, baseZ);
    rec.dirty = false;
  }

  _toMesh(existing, data, material, baseX, baseZ) {
    if (existing) { this.group.remove(existing); existing.geometry.dispose(); }
    if (data.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(data.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
    g.setIndex(data.index);
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(baseX, 0, baseZ);
    mesh.frustumCulled = true;
    this.group.add(mesh);
    return mesh;
  }

  // load/unload around a center chunk; returns true if any new mesh built this frame
  update(centerCX, centerCZ, radius, budget = 2) {
    // queue chunks that need a mesh, nearest first
    const needed = [];
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > (radius + 0.5) * (radius + 0.5)) continue;
        const cx = centerCX + dx, cz = centerCZ + dz;
        const rec = this.getChunkData(cx, cz);
        if (rec.dirty) needed.push({ rec, d: dx * dx + dz * dz });
      }
    needed.sort((a, b) => a.d - b.d);
    let built = 0;
    for (const { rec } of needed) {
      if (built >= budget) break;
      this.buildMesh(rec);
      built++;
    }

    // unload far meshes (keep data cached)
    const far = radius + 3;
    for (const rec of this.chunks.values()) {
      const dd = Math.max(Math.abs(rec.cx - centerCX), Math.abs(rec.cz - centerCZ));
      if (dd > far && (rec.mesh || rec.trans)) {
        if (rec.mesh) { this.group.remove(rec.mesh); rec.mesh.geometry.dispose(); rec.mesh = null; }
        if (rec.trans) { this.group.remove(rec.trans); rec.trans.geometry.dispose(); rec.trans = null; }
        rec.dirty = true;
      }
    }
    return built > 0;
  }

  // Voxel DDA raycast. Returns { hit, place } world positions or null.
  raycast(origin, dir, maxDist = 7) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    const fx = stepX > 0 ? (x + 1 - origin.x) : (origin.x - x);
    const fy = stepY > 0 ? (y + 1 - origin.y) : (origin.y - y);
    const fz = stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z);
    let tMaxX = stepX !== 0 ? tDeltaX * fx : Infinity;
    let tMaxY = stepY !== 0 ? tDeltaY * fy : Infinity;
    let tMaxZ = stepZ !== 0 ? tDeltaZ * fz : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== 0 && !isLiquid(id)) {
        return {
          hit: { x, y, z },
          place: { x: x + nx, y: y + ny, z: z + nz },
          id,
        };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }
}
