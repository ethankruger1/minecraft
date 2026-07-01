// Block registry. id 0 is always air.
// faceTiles order: [px, nx, py, ny, pz, nz]  (px = +X / east, py = +Y / top, etc.)
// Helper t(top, side, bottom) builds the 6-face array from up to 3 tile names.

function t(top, side, bottom) {
  side = side ?? top;
  bottom = bottom ?? top;
  return [side, side, top, bottom, side, side];
}

export const BLOCKS = [
  { id: 0, name: 'air', solid: false },
  { id: 1, name: 'Grass',       tiles: t('grass_top', 'grass_side', 'dirt') },
  { id: 2, name: 'Dirt',        tiles: t('dirt') },
  { id: 3, name: 'Stone',       tiles: t('stone') },
  { id: 4, name: 'Cobblestone', tiles: t('cobblestone') },
  { id: 5, name: 'Sand',        tiles: t('sand') },
  { id: 6, name: 'Gravel',      tiles: t('gravel') },
  { id: 7, name: 'Oak Log',     tiles: t('log_top', 'log_side', 'log_top') },
  { id: 8, name: 'Planks',      tiles: t('planks') },
  { id: 9, name: 'Leaves',      tiles: t('leaves'), transparent: true },
  { id: 10, name: 'Glass',      tiles: t('glass'), transparent: true },
  { id: 11, name: 'Water',      tiles: t('water'), transparent: true, solid: false, liquid: true },
  { id: 12, name: 'Snow',       tiles: t('snow') },
  { id: 13, name: 'Bricks',     tiles: t('brick') },
  { id: 14, name: 'Bedrock',    tiles: t('bedrock'), unbreakable: true },
  { id: 15, name: 'Pumpkin',    tiles: t('pumpkin_top', 'pumpkin_side', 'pumpkin_top') },
  { id: 16, name: 'Glowstone',  tiles: t('glowstone'), light: 14 },
];

// quick lookups
export const BY_ID = {};
for (const b of BLOCKS) {
  if (b.solid === undefined) b.solid = b.id !== 0;
  BY_ID[b.id] = b;
}

export function isSolid(id) { return id !== 0 && BY_ID[id] && BY_ID[id].solid; }
export function isTransparent(id) {
  if (id === 0) return true;
  const b = BY_ID[id];
  return !!(b && (b.transparent || b.liquid));
}
export function isLiquid(id) { return BY_ID[id] && BY_ID[id].liquid; }

// Hotbar default selection (block ids)
export const HOTBAR = [1, 2, 3, 4, 8, 7, 9, 10, 16];

// Hardness (break time multiplier in seconds for full break)
export function hardness(id) {
  const b = BY_ID[id];
  if (!b) return 0.5;
  if (b.unbreakable) return Infinity;
  switch (id) {
    case 3: case 4: case 13: return 1.6;   // stone-like
    case 7: case 8: return 1.0;            // wood
    case 9: return 0.3;                    // leaves
    case 10: return 0.4;                   // glass
    case 16: return 0.8;
    default: return 0.6;                   // dirt/sand/grass
  }
}
