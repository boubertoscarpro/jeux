// v26 — Compression de la sauvegarde dans le navigateur (LZW, synchrone pour pouvoir sauver à la fermeture de la
// page). Codes de 20 bits rangés par paquets de 15 bits dans des caractères UTF-16 valides (jamais de demi-paire) ;
// le dictionnaire repart de zéro quand il est plein. Format : « LZ1: » + données. L'export reste du JSON lisible.
const PREFIX = 'LZ1:';
const BITS = 20, MAXC = 1 << BITS, BASE = 0x100;

export const isCompressed = (s) => typeof s === 'string' && s.startsWith(PREFIX);

export function compress(str) {
  const out = [];
  let acc = 0, nacc = 0;
  const emit = (code) => {
    acc = acc * MAXC + code; nacc += BITS; // au plus 15 + 20 bits en attente : reste un entier exact
    while (nacc >= 15) { nacc -= 15; const v = Math.floor(acc / 2 ** nacc); out.push(String.fromCharCode(BASE + v)); acc -= v * 2 ** nacc; }
  };
  let dict = new Map(), next = 65536;
  let w = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (w < 0) { w = c; continue; }
    const k = w * 65536 + c;
    const hit = dict.get(k);
    if (hit !== undefined) { w = hit; continue; }
    emit(w);
    if (next < MAXC - 1) dict.set(k, next++);
    else { emit(MAXC - 1); dict = new Map(); next = 65536; } // code réservé : remise à zéro du dictionnaire
    w = c;
  }
  if (w >= 0) emit(w);
  if (nacc > 0) out.push(String.fromCharCode(BASE + acc * 2 ** (15 - nacc)));
  return PREFIX + str.length.toString(36) + ':' + out.join('');
}

export function decompress(data) {
  if (!isCompressed(data)) return data;
  const sep = data.indexOf(':', PREFIX.length);
  const total = parseInt(data.slice(PREFIX.length, sep), 36);
  const body = data.slice(sep + 1);
  const codes = [];
  let acc = 0, nacc = 0;
  for (let i = 0; i < body.length; i++) {
    acc = acc * 32768 + (body.charCodeAt(i) - BASE); nacc += 15;
    if (nacc >= BITS) { nacc -= BITS; const v = Math.floor(acc / 2 ** nacc); codes.push(v); acc -= v * 2 ** nacc; }
  }
  const parts = [];
  let len = 0;
  let dict = [], prev = null;
  const entry = (code) => (code < 65536 ? String.fromCharCode(code) : dict[code - 65536]);
  for (const code of codes) {
    if (len >= total) break;
    if (code === MAXC - 1) { dict = []; prev = null; continue; }
    let cur;
    if (code < 65536 || code - 65536 < dict.length) cur = entry(code);
    else if (prev !== null) cur = prev + prev[0]; // cas LZW « motif en cours de définition »
    else throw new Error('sauvegarde compressée illisible');
    parts.push(cur); len += cur.length;
    if (prev !== null && 65536 + dict.length < MAXC - 1) dict.push(prev + cur[0]);
    prev = cur;
  }
  const s = parts.join('');
  if (s.length !== total) throw new Error('sauvegarde compressée tronquée');
  return s;
}
