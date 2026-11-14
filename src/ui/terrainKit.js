// v27 — Peinture pixel par pixel du terrain, AUTONOME : cette fonction ne dépend d'aucun nom extérieur, pour pouvoir
// être recopiée telle quelle (Function.prototype.toString) dans un worker créé depuis un Blob. Le worker peint les tuiles
// du monde hors du fil principal ; sans worker (navigateur ancien, fichier hors ligne refusé), le fil principal appelle
// la même fonction par tranches de lignes.
export function makeTerrainKit() {
  const hash = (x, y, s = 0) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.62 + vnoise(x * 2.07, y * 2.07, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1;
  const WATER = { river: 1 };
  /**
   * Prépare une zone (champs de bruit, voisinage de l'eau) puis peint les lignes [row0, row1) de pixels.
   * d : tableau RGBA de W × (lignes) ; get(x, y) → terrain ; res px par case.
   */
  function prepare(x0, y0, tw, th, res, get, pal, { seed = 1, jitter = 0.38, dryPatch = 0, dryPal = null } = {}) {
    const near = new Uint8Array((tw + 2) * (th + 2));
    for (let y = -1; y <= th; y++) for (let x = -1; x <= tw; x++) {
      let w = 0, l = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = get(x0 + x + dx, y0 + y + dy); if (!t) continue; if (WATER[t]) w = 1; else l = 1; }
      near[(y + 1) * (tw + 2) + (x + 1)] = w && l ? 1 : 0;
    }
    const G = 4, gw = tw * G + 2, gh = th * G + 2;
    const JX = new Float32Array(gw * gh), JY = new Float32Array(gw * gh), V = new Float32Array(gw * gh), DP = dryPatch ? new Float32Array(gw * gh) : null;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const fx = x0 + i / G, fy = y0 + j / G, k = j * gw + i;
      JX[k] = (fbm(fx * 1.25, fy * 1.25, seed + 11) - 0.5) * 2 * jitter;
      JY[k] = (fbm(fx * 1.25 + 40, fy * 1.25, seed + 23) - 0.5) * 2 * jitter;
      V[k] = fbm(fx * 0.33, fy * 0.33, seed + 5);
      if (DP) DP[k] = fbm(fx * 0.9, fy * 0.9, seed + 31);
    }
    const cw = tw + 4, chh = th + 4, terr = new Array(cw * chh);
    for (let y = -2; y < th + 2; y++) for (let x = -2; x < tw + 2; x++) terr[(y + 2) * cw + (x + 2)] = get(x0 + x, y0 + y);
    return { x0, y0, tw, th, res, pal, seed, near, G, gw, gh, JX, JY, V, DP, dryPal: dryPatch ? dryPal : null, dryPatch, terr, cw, chh, get };
  }
  function rows(P, d, row0, row1) {
    const { x0, y0, tw, res, pal, seed, near, G, gw, gh, JX, JY, V, DP, dryPal, dryPatch, terr, cw, chh, get } = P;
    const W = tw * res;
    const lerp2 = (A, gxF, gyF) => {
      const i = Math.min(gw - 2, gxF | 0), j = Math.min(gh - 2, gyF | 0), u = gxF - i, v = gyF - j, k = j * gw + i;
      return A[k] + (A[k + 1] - A[k]) * u + (A[k + gw] - A[k]) * v + (A[k] - A[k + 1] - A[k + gw] + A[k + gw + 1]) * u * v;
    };
    const T = (tx, ty) => { const ix = tx - x0 + 2, iy = ty - y0 + 2; return ix >= 0 && iy >= 0 && ix < cw && iy < chh ? terr[iy * cw + ix] : get(tx, ty); };
    for (let py = row0; py < row1; py++) {
      const ly = (py + 0.5) / res, fy = y0 + ly, gyF = ly * G;
      for (let px = 0; px < W; px++) {
        const lx = (px + 0.5) / res, fx = x0 + lx, gxF = lx * G;
        const jx = lerp2(JX, gxF, gyF), jy = lerp2(JY, gxF, gyF);
        const ter = T(Math.floor(fx + jx), Math.floor(fy + jy)) || T(Math.floor(fx), Math.floor(fy)) || 'plain';
        const c = pal[ter] || pal.plain;
        let k = 0.86 + lerp2(V, gxF, gyF) * 0.26;
        let r = c[0], g = c[1], b = c[2];
        if (dryPal && ter === 'plain' && lerp2(DP, gxF, gyF) < dryPatch) { r = dryPal[0]; g = dryPal[1]; b = dryPal[2]; }
        const ix = Math.floor(fx) - x0 + 1, iy = Math.floor(fy) - y0 + 1;
        if (ix >= 0 && iy >= 0 && ix < tw + 2 && iy < P.th + 2 && near[iy * (tw + 2) + ix]) {
          const o = 0.2, ex = fx + jx, ey = fy + jy;
          const wet = (WATER[T(Math.floor(ex + o), Math.floor(ey))] ? 1 : 0) + (WATER[T(Math.floor(ex - o), Math.floor(ey))] ? 1 : 0)
            + (WATER[T(Math.floor(ex), Math.floor(ey + o))] ? 1 : 0) + (WATER[T(Math.floor(ex), Math.floor(ey - o))] ? 1 : 0);
          if (WATER[ter]) { if (wet < 4) { k *= 1.12; r += 12; g += 14; b += 6; } }
          else if (wet > 0) { k *= 0.8; r -= 6; b += 4; }
        }
        if (WATER[ter]) k *= 0.94 + vnoise(fx * 3, fy * 0.8, seed + 3) * 0.14;
        // grain : fixé au monde (pas au pixel) pour qu'un même lieu ait le même grain à tous les niveaux
        const grain = (hash(Math.floor(fx * 32), Math.floor(fy * 32), seed) - 0.5) * 10;
        const i = ((py - row0) * W + px) * 4;
        d[i] = r * k + grain; d[i + 1] = g * k + grain; d[i + 2] = b * k + grain; d[i + 3] = 255;
      }
    }
  }
  // Tout d'un coup (sol du royaume, anciens appels)
  function paintTerrain(img, x0, y0, tw, th, res, get, pal, opts = {}) {
    const P = prepare(x0, y0, tw, th, res, get, pal, opts);
    rows(P, img.data, 0, th * res);
  }
  return { hash, vnoise, fbm, prepare, rows, paintTerrain };
}

// Source du worker : le kit, plus un monde reçu une fois (chaîne de terrain), puis des travaux { id, x0, y0, tw, th, res,
// pal, seed, jitter } → ImageData transférée
export function terrainWorkerSource() {
  return `const KIT=(${makeTerrainKit.toString()})();let WD=null;
onmessage=(e)=>{const m=e.data;if(m.world){WD=m.world;return;}
const S=WD.size,T=WD.terrain,C=WD.map;const get=(x,y)=>(x<0||y<0||x>=S||y>=S?null:C[T[y*S+x]]);
const t0=performance.now();const P=KIT.prepare(m.x0,m.y0,m.tw,m.th,m.res,get,m.pal,{seed:m.seed,jitter:m.jitter});
const W=m.tw*m.res,H=m.th*m.res;const d=new Uint8ClampedArray(W*H*4);KIT.rows(P,d,0,H);
postMessage({id:m.id,w:W,h:H,ms:performance.now()-t0,buf:d.buffer},[d.buffer]);};`;
}
