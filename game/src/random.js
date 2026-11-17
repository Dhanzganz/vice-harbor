// Vice Harbor — a small seeded random number generator.
// The city, its traffic and its crowds are all built from one seed, so a given
// seed always grows the same Vice Harbor (the screenshot scenes rely on that).

/** mulberry32: a fast 32-bit seeded PRNG. Returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded RNG with the helpers the world builders use everywhere. */
export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }
  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }
  /** One element of a non-empty array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  /** A sign, -1 or +1. */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}
