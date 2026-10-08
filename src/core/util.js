export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let uidCounter = 0;
export function uid(prefix = 'id') {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function fmt(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'G';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
  if (a >= 100 || Number.isInteger(n)) return Math.floor(n).toString();
  return n.toFixed(1);
}

export function fmtPct(v, digits = 0) {
  const s = (v * 100).toFixed(digits);
  return (v >= 0 ? '+' : '') + s + '%';
}

export function fmtTime(ms) {
  if (ms <= 0) return '0s';
  let s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  if (d) return `${d}j ${h}h`;
  if (h) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function sumValues(obj) { return Object.values(obj || {}).reduce((s, v) => s + v, 0); }

export function addInto(target, src, mult = 1) {
  for (const [k, v] of Object.entries(src || {})) target[k] = (target[k] || 0) + v * mult;
  return target;
}

export function scaleObj(obj, mult, round = true) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = round ? Math.ceil(v * mult) : v * mult;
  return out;
}

export const deepClone = (o) => JSON.parse(JSON.stringify(o));
