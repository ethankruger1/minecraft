// Classic Perlin noise (2D + 3D), seedable. Adapted from Ken Perlin's reference.

export class Noise {
  constructor(seed = 1337) {
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;

    // Deterministic shuffle from seed (mulberry32)
    let s = seed >>> 0;
    const rand = () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static lerp(a, b, t) { return a + t * (b - a); }

  static grad2(hash, x, y) {
    switch (hash & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }

  static grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  perlin2(x, y) {
    const p = this.p;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = Noise.fade(x), v = Noise.fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return Noise.lerp(
      Noise.lerp(Noise.grad2(aa, x, y), Noise.grad2(ba, x - 1, y), u),
      Noise.lerp(Noise.grad2(ab, x, y - 1), Noise.grad2(bb, x - 1, y - 1), u),
      v
    );
  }

  perlin3(x, y, z) {
    const p = this.p;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Noise.fade(x), v = Noise.fade(y), w = Noise.fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return Noise.lerp(
      Noise.lerp(
        Noise.lerp(Noise.grad3(p[AA], x, y, z), Noise.grad3(p[BA], x - 1, y, z), u),
        Noise.lerp(Noise.grad3(p[AB], x, y - 1, z), Noise.grad3(p[BB], x - 1, y - 1, z), u), v),
      Noise.lerp(
        Noise.lerp(Noise.grad3(p[AA + 1], x, y, z - 1), Noise.grad3(p[BA + 1], x - 1, y, z - 1), u),
        Noise.lerp(Noise.grad3(p[AB + 1], x, y - 1, z - 1), Noise.grad3(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w
    );
  }

  // Fractal Brownian motion (octaved noise), returns ~[-1,1]
  fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
