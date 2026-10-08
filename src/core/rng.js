// Générateur pseudo-aléatoire. Par défaut Math.random, remplaçable (tests, cartes déterministes).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let source = Math.random;

export const rng = {
  random: () => source(),
  setSource(fn) { source = fn || Math.random; },
  int(min, max) { return Math.floor(source() * (max - min + 1)) + min; },
  float(min, max) { return source() * (max - min) + min; },
  chance(p) { return source() < p; },
  pick(arr) { return arr[Math.floor(source() * arr.length)]; },
  // items: [{ weight, ... }] ou objet { clé: poids }
  weighted(items) {
    if (!Array.isArray(items)) {
      const entries = Object.entries(items);
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = source() * total;
      for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
      return entries[entries.length - 1][0];
    }
    const total = items.reduce((s, it) => s + it.weight, 0);
    let r = source() * total;
    for (const it of items) { if ((r -= it.weight) < 0) return it; }
    return items[items.length - 1];
  },
};

// Hachage simple d'une chaîne → entier (graine)
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
