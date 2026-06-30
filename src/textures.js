import * as THREE from 'three';

// Procedural pixel-art texture atlas, drawn at runtime.
// Each tile is TILE x TILE pixels; tiles laid out in a grid.

export const TILE = 16;          // texels per tile
const COLS = 8;                  // atlas grid width in tiles

// Deterministic per-tile RNG so textures look identical every run.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// shade a hex color by a factor (1 = same, <1 darker, >1 lighter)
function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// ---- Tile painters. Each receives a 2D context offset to its tile origin. ----

function noisy(ctx, ox, oy, base, rng, amount = 0.18, speckle = 0) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let f = 1 + (rng() - 0.5) * 2 * amount;
      if (speckle && rng() < speckle) f *= rng() < 0.5 ? 0.7 : 1.3;
      ctx.fillStyle = shade(base, f);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

const painters = {
  grass_top(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0x5fa83a, rng, 0.16, 0.06);
    // a few brighter blades
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = shade(0x74c24a, 0.9 + rng() * 0.3);
      ctx.fillRect(ox + (rng() * TILE | 0), oy + (rng() * TILE | 0), 1, 1);
    }
  },
  grass_side(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0x9b6a3f, rng, 0.16, 0.05); // dirt base
    const top = 4;
    for (let y = 0; y < top; y++)
      for (let x = 0; x < TILE; x++) {
        ctx.fillStyle = shade(0x5fa83a, 1 + (rng() - 0.5) * 0.3);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    // ragged grass fringe hanging down
    for (let x = 0; x < TILE; x++) {
      const drip = top + (rng() * 3 | 0);
      for (let y = top; y < drip; y++) {
        ctx.fillStyle = shade(0x568f33, 1 + (rng() - 0.5) * 0.3);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  },
  dirt(ctx, ox, oy, rng) { noisy(ctx, ox, oy, 0x9b6a3f, rng, 0.18, 0.08); },
  stone(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0x848484, rng, 0.12, 0.05);
    for (let i = 0; i < 6; i++) { // cracks
      ctx.fillStyle = shade(0x848484, 0.7);
      ctx.fillRect(ox + (rng() * TILE | 0), oy + (rng() * TILE | 0), 1 + (rng() * 2 | 0), 1);
    }
  },
  cobblestone(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0x6f6f6f, rng, 0.1);
    // cobble cells
    const cells = [[0,0,7,7],[8,0,7,5],[0,8,5,7],[6,8,9,7],[8,6,7,4]];
    for (const [x,y,w,h] of cells) {
      ctx.fillStyle = shade(0x8a8a8a, 0.9 + rng()*0.25);
      ctx.fillRect(ox+x+1, oy+y+1, w-1, h-1);
      noisy(ctx, ox+x+1, oy+y+1, 0x8a8a8a, rng, 0.14);
    }
  },
  sand(ctx, ox, oy, rng) { noisy(ctx, ox, oy, 0xe2d2a0, rng, 0.1, 0.04); },
  gravel(ctx, ox, oy, rng) { noisy(ctx, ox, oy, 0x847f78, rng, 0.22, 0.18); },
  log_side(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0x6b4f2a, rng, 0.12);
    for (let x = 0; x < TILE; x++) { // vertical bark streaks
      if (rng() < 0.35) {
        ctx.fillStyle = shade(0x553f20, 0.9 + rng()*0.2);
        ctx.fillRect(ox + x, oy, 1, TILE);
      }
    }
  },
  log_top(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0xb08b53, rng, 0.1);
    const cx = ox + 8, cy = oy + 8;
    for (let r = 7; r > 0; r -= 2) {
      ctx.strokeStyle = shade(0x6b4f2a, 0.9 + rng()*0.2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  planks(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0xb5894e, rng, 0.1);
    for (let y = 0; y < TILE; y += 4) {
      ctx.fillStyle = shade(0x6b4f2a, 1);
      ctx.fillRect(ox, oy + y, TILE, 1);
    }
    for (let y = 0; y < TILE; y += 4) { // plank seams
      const sx = (rng() * TILE | 0);
      ctx.fillStyle = shade(0x8a6a3a, 1);
      ctx.fillRect(ox + sx, oy + y, 1, 4);
    }
  },
  leaves(ctx, ox, oy, rng) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const f = 0.8 + rng() * 0.5;
        ctx.fillStyle = shade(0x3f7d2c, f);
        ctx.fillRect(ox + x, oy + y, 1, 1);
        if (rng() < 0.08) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(ox+x, oy+y, 1, 1); }
      }
  },
  glass(ctx, ox, oy, rng) {
    ctx.clearRect(ox, oy, TILE, TILE);
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.strokeRect(ox + 0.5, oy + 0.5, TILE - 1, TILE - 1);
    ctx.fillStyle = 'rgba(200,225,245,0.18)';
    ctx.fillRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(ox+3, oy+12); ctx.lineTo(ox+11, oy+4); ctx.stroke();
  },
  water(ctx, ox, oy, rng) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const f = 1 + Math.sin((x + y) * 0.6) * 0.06 + (rng() - 0.5) * 0.06;
        ctx.fillStyle = shade(0x2b69c9, f);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
  },
  snow(ctx, ox, oy, rng) { noisy(ctx, ox, oy, 0xf3f6ff, rng, 0.05, 0.03); },
  brick(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0xae5b43, rng, 0.08);
    ctx.fillStyle = '#cfcabf'; // mortar
    for (let y = 0; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1);
    for (let y = 0; y < TILE; y += 4) {
      const off = ((y / 4) & 1) ? 4 : 0;
      for (let x = off; x < TILE; x += 8) ctx.fillRect(ox + x, oy + y, 1, 4);
    }
  },
  bedrock(ctx, ox, oy, rng) { noisy(ctx, ox, oy, 0x3a3a3a, rng, 0.35, 0.25); },
  pumpkin_side(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0xd6731b, rng, 0.1);
    for (let x = 2; x < TILE; x += 4) { ctx.fillStyle = shade(0xb85c12, 1); ctx.fillRect(ox+x, oy, 1, TILE); }
  },
  pumpkin_top(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0xc4691a, rng, 0.1);
    ctx.fillStyle = '#7a5a1e'; ctx.fillRect(ox+7, oy+5, 2, 6);
  },
  glowstone(ctx, ox, oy, rng) {
    noisy(ctx, ox, oy, 0xd8b04a, rng, 0.15, 0.2);
    for (let i=0;i<10;i++){ ctx.fillStyle = shade(0xfff0a0, 1); ctx.fillRect(ox+(rng()*TILE|0), oy+(rng()*TILE|0), 1, 1); }
  },
};

// Order defines tile indices in the atlas.
const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobblestone', 'sand', 'gravel',
  'log_side', 'log_top', 'planks', 'leaves', 'glass', 'water', 'snow',
  'brick', 'bedrock', 'pumpkin_side', 'pumpkin_top', 'glowstone',
];

export function buildAtlas() {
  const rows = Math.ceil(TILE_NAMES.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const index = {};
  TILE_NAMES.forEach((name, i) => {
    const cx = (i % COLS) * TILE;
    const cy = ((i / COLS) | 0) * TILE;
    const rng = mulberry32(0x9e3779b1 ^ (i * 2654435761));
    painters[name](ctx, cx, cy, rng);
    index[name] = i;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  return { texture, index, cols: COLS, rows, canvas };
}

// Crack overlay atlas: 10 stages of destruction, returned as a single texture.
export function buildCrackAtlas() {
  const stages = 10;
  const canvas = document.createElement('canvas');
  canvas.width = stages * TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rng = mulberry32(12345);

  for (let s = 0; s < stages; s++) {
    const ox = s * TILE;
    const lines = 1 + s; // more cracks as it breaks
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    for (let l = 0; l < lines; l++) {
      let x = 2 + rng() * (TILE - 4);
      let y = 2 + rng() * (TILE - 4);
      ctx.beginPath();
      ctx.moveTo(ox + x, y);
      const segs = 2 + (rng() * 3 | 0);
      for (let k = 0; k < segs; k++) {
        x += (rng() - 0.5) * 8;
        y += (rng() - 0.5) * 8;
        ctx.lineTo(ox + Math.max(0, Math.min(TILE, x)), Math.max(0, Math.min(TILE, y)));
      }
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { texture, stages };
}
