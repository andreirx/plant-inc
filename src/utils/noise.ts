/**
 * 2D Simplex Noise implementation.
 * Self-contained, no external dependencies.
 * Based on Stefan Gustavson's simplex noise algorithm.
 */

// Skewing factors for 2D
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// Gradient vectors for 2D
const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export class SimplexNoise {
  private perm: Uint8Array;

  constructor(seed: number) {
    this.perm = this.buildPermutation(seed);
  }

  private buildPermutation(seed: number): Uint8Array {
    const p = new Uint8Array(512);
    const source = new Uint8Array(256);
    for (let i = 0; i < 256; i++) source[i] = i;

    // Seed-based Fisher-Yates shuffle
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = (s >>> 0) % (i + 1);
      const tmp = source[i];
      source[i] = source[j];
      source[j] = tmp;
    }

    for (let i = 0; i < 512; i++) {
      p[i] = source[i & 255];
    }
    return p;
  }

  /** Returns noise value in range [-1, 1] */
  noise2D(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1: number, j1: number;
    if (x0 > y0) {
      i1 = 1; j1 = 0;
    } else {
      i1 = 0; j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const g = GRAD2[this.perm[ii + this.perm[jj]] % 8];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const g = GRAD2[this.perm[ii + i1 + this.perm[jj + j1]] % 8];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const g = GRAD2[this.perm[ii + 1 + this.perm[jj + 1]] % 8];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    // Scale to [-1, 1]
    return 70 * (n0 + n1 + n2);
  }

  /** Convenience: returns value mapped to [0, 1] */
  noise2DNormalized(x: number, y: number): number {
    return (this.noise2D(x, y) + 1) * 0.5;
  }

  /** Multi-octave fractal noise for more natural terrain */
  fractal2D(x: number, y: number, octaves: number, lacunarity: number, persistence: number): number {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let max = 0;

    for (let i = 0; i < octaves; i++) {
      sum += this.noise2D(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    // Normalize to [-1, 1]
    return sum / max;
  }
}
