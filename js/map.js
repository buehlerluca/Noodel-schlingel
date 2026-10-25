// Gipfelpfad – Pixel-Alpenkarte, Wegsuche und Bild-Export
// Die Karte wird komplett im Browser erzeugt (Höhenmodell aus Gebirgskämmen + Rauschen).

const MAP = { W: 320, H: 180, lon0: 5.2, lon1: 14.4, lat0: 44.4, lat1: 48.0 };
MAP.kmX = (MAP.lon1 - MAP.lon0) * 111.32 * Math.cos(46.2 * Math.PI / 180) / MAP.W;
MAP.kmY = (MAP.lat1 - MAP.lat0) * 111.32 / MAP.H;

// Echte Wege schlängeln sich – Luftlinie auf dem Raster mal Wegfaktor
const WEGFAKTOR = 1.25;

function geoZuRaster(lon, lat) {
  return {
    x: (lon - MAP.lon0) / (MAP.lon1 - MAP.lon0) * MAP.W,
    y: (MAP.lat1 - lat) / (MAP.lat1 - MAP.lat0) * MAP.H,
  };
}

function rasterZuGeo(x, y) {
  return {
    lon: MAP.lon0 + x / MAP.W * (MAP.lon1 - MAP.lon0),
    lat: MAP.lat1 - y / MAP.H * (MAP.lat1 - MAP.lat0),
  };
}

function zelleVon(ort) {
  const p = geoZuRaster(ort.lon, ort.lat);
  const x = Math.max(0, Math.min(MAP.W - 1, Math.floor(p.x)));
  const y = Math.max(0, Math.min(MAP.H - 1, Math.floor(p.y)));
  return y * MAP.W + x;
}

function luftlinieKm(a, b) {
  const dx = (a.lon - b.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = (a.lat - b.lat) * 111.32;
  return Math.hypot(dx, dy);
}

// ---------- Rauschen ----------

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function wertRauschen(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, oktaven = 4) {
  let summe = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oktaven; i++) {
    summe += amp * wertRauschen(x * freq, y * freq);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return summe / norm;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map(r => r.map(v => (v + 0.5) / 16));

// ---------- Geländemodell ----------

// Gebirgskämme als Linienzüge [lon, lat]
const KAEMME = [
  { h: 2900, w: 0.30, p: [[6.1, 44.3], [6.6, 44.6], [6.9, 44.9], [6.6, 45.3], [6.9, 45.8], [7.3, 45.95], [7.9, 46.0], [8.4, 46.35], [9.0, 46.5], [9.9, 46.42], [10.5, 46.6], [11.0, 46.9], [11.8, 47.05], [12.6, 47.1], [13.3, 47.15], [14.5, 47.2]] },
  { h: 2600, w: 0.20, p: [[6.9, 46.35], [7.5, 46.45], [8.0, 46.55], [8.6, 46.75], [9.2, 46.85], [9.9, 46.85]] },
  { h: 2600, w: 0.20, p: [[6.0, 44.8], [6.4, 44.95], [6.6, 45.1]] },
  { h: 2400, w: 0.22, p: [[7.0, 45.3], [7.3, 45.55], [7.6, 45.6]] },
  { h: 2300, w: 0.22, p: [[11.6, 46.4], [12.0, 46.5], [12.4, 46.6], [12.9, 46.55]] },
  { h: 2000, w: 0.18, p: [[13.2, 46.45], [13.9, 46.4], [14.5, 46.4]] },
  { h: 1900, w: 0.17, p: [[9.6, 47.3], [10.3, 47.35], [11.0, 47.42], [11.8, 47.5], [12.6, 47.55], [13.4, 47.5], [14.4, 47.6]] },
  { h: 1600, w: 0.17, p: [[7.0, 46.75], [7.7, 46.85], [8.3, 46.95], [9.0, 47.05], [9.4, 47.2]] },
  { h: 1500, w: 0.20, p: [[5.6, 45.1], [5.8, 45.5], [6.1, 45.9], [6.3, 46.2]] },
  { h: 1100, w: 0.22, p: [[5.9, 46.3], [6.4, 46.7], [6.9, 47.05], [7.4, 47.3], [8.0, 47.5]] },
  { h: 1600, w: 0.22, p: [[9.6, 45.95], [10.2, 46.05], [10.7, 46.15], [11.2, 46.0]] },
];

// Seen: Mittelpunkt, Halbachsen (in "km-skalierten" Grad), Drehwinkel
const SEEN = [
  [6.55, 46.40, 0.27, 0.05, 0.30],  // Genfersee
  [6.85, 46.88, 0.14, 0.035, 0.60], // Neuenburgersee
  [9.35, 47.62, 0.22, 0.06, -0.35], // Bodensee
  [8.68, 47.25, 0.12, 0.025, -0.55],// Zürichsee
  [8.45, 47.00, 0.10, 0.028, 0.10], // Vierwaldstättersee
  [7.73, 46.70, 0.07, 0.022, 0.40], // Thunersee
  [8.62, 45.95, 0.03, 0.24, 0.15],  // Lago Maggiore
  [9.27, 46.00, 0.025, 0.20, -0.10],// Comer See
  [10.68, 45.65, 0.05, 0.20, 0.05], // Gardasee
  [10.07, 45.72, 0.02, 0.10, 0.0],  // Iseosee
  [12.45, 47.87, 0.06, 0.05, 0.0],  // Chiemsee
  [6.18, 45.85, 0.02, 0.08, 0.2],   // Lac d'Annecy
  [5.87, 45.73, 0.02, 0.10, 0.0],   // Lac du Bourget
  [13.55, 47.87, 0.025, 0.09, 0.0], // Attersee
];

const COS_LAT = Math.cos(46.2 * Math.PI / 180);

function abstandZuStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function istSee(lon, lat) {
  for (const [cx, cy, a, b, w] of SEEN) {
    const sx = (lon - cx) * COS_LAT, sy = lat - cy;
    const u = sx * Math.cos(w) + sy * Math.sin(w);
    const v = -sx * Math.sin(w) + sy * Math.cos(w);
    if ((u / a) ** 2 + (v / b) ** 2 < 1) return true;
  }
  return false;
}

function hoeheAn(lon, lat) {
  // Grundniveau: Mittelland ~450 m, Po-Ebene und Venetien tiefer
  let basis = 450;
  const po = Math.max(0, Math.min(1, (45.75 - lat) / 0.4)) * Math.max(0, Math.min(1, (lon - 7.7) / 0.4));
  const venetien = Math.max(0, Math.min(1, (46.05 - lat) / 0.35)) * Math.max(0, Math.min(1, (lon - 11.3) / 0.4));
  basis -= 330 * Math.max(po, venetien);

  const sx = lon * COS_LAT;
  let max = 0, summe = 0;
  for (const k of KAEMME) {
    let d = Infinity;
    for (let i = 0; i < k.p.length - 1; i++) {
      const [a, b] = [k.p[i], k.p[i + 1]];
      d = Math.min(d, abstandZuStrecke(sx, lat, a[0] * COS_LAT, a[1], b[0] * COS_LAT, b[1]));
    }
    const beitrag = k.h * Math.exp(-((d / k.w) ** 2));
    summe += beitrag;
    if (beitrag > max) max = beitrag;
  }
  const kamm = max + 0.3 * (summe - max);

  const n1 = fbm(lon * 5 + 11, lat * 5 + 3);
  const n2 = fbm(lon * 17 + 40, lat * 17 + 70, 3);
  let e = basis + kamm * (0.45 + 0.85 * n1) + (n2 - 0.5) * 260 * (0.4 + kamm / 2000);

  for (const o of ALPEN_ORTE) {
    if (o.typ !== 'gipfel') continue;
    const d = Math.hypot((lon - o.lon) * COS_LAT, lat - o.lat);
    if (d > 0.25) continue;
    const g = Math.exp(-((d / 0.075) ** 2));
    if (o.h > e) e += (o.h - e) * g;
  }
  return Math.max(60, e);
}

const BAENDER = [
  { bis: 550,   c: ['#5e9440', '#78ae4c', '#96c65e'] },
  { bis: 1050,  c: ['#4a8239', '#5f9a44', '#7db452'] },
  { bis: 1650,  c: ['#2b5a34', '#3a7140', '#4f8a48'] },
  { bis: 2250,  c: ['#5b6a43', '#788553', '#97a067'] },
  { bis: 2850,  c: ['#5c4b44', '#7b6659', '#998473'] },
  { bis: 3350,  c: ['#7b7180', '#9c92a0', '#bdb5bf'] },
  { bis: 99999, c: ['#a9bbd3', '#dbe7f3', '#f8fbff'] },
];
const WASSER = ['#28579c', '#3a72bd', '#86b6ea'];

function hexZuRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

let _gelaende = null;

function erzeugeGelaende() {
  if (_gelaende) return _gelaende;
  const { W, H } = MAP;
  const hoehe = new Float32Array(W * H);
  const wasser = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const g = rasterZuGeo(x + 0.5, y + 0.5);
      const i = y * W + x;
      hoehe[i] = hoeheAn(g.lon, g.lat);
      if (istSee(g.lon, g.lat)) { wasser[i] = 1; hoehe[i] = Math.min(hoehe[i], 380); }
    }
  }

  const bild = document.createElement('canvas');
  bild.width = W; bild.height = H;
  const bctx = bild.getContext('2d');
  const daten = bctx.createImageData(W, H);
  const band = BAENDER.map(b => ({ bis: b.bis, c: b.c.map(hexZuRgb) }));
  const wasserRgb = WASSER.map(hexZuRgb);
  const e = (x, y) => hoehe[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const schwelle = BAYER[y & 3][x & 3];
      let rgb;
      if (wasser[i]) {
        const ufer = !wasser[i - 1] || !wasser[i + 1] || !wasser[i - W] || !wasser[i + W];
        rgb = hash2(x * 7, y * 13) < 0.06 ? wasserRgb[2] : ufer ? wasserRgb[1] : wasserRgb[0];
      } else {
        const h = hoehe[i];
        let b = 0;
        while (h > band[b].bis) b++;
        // weicher Übergang zum nächsten Band per Rasterung
        if (b < band.length - 1 && h > band[b].bis - 140 && (h - (band[b].bis - 140)) / 140 > schwelle) b++;
        // Waldflecken im Flachland
        if (b < 2 && fbm(x / 7 + 90, y / 7 + 20, 3) > 0.6 + (schwelle - 0.5) * 0.08) b = 2;
        // Licht aus Nordwesten
        const hang = (e(x + 1, y + 1) - e(x - 1, y - 1)) / 260;
        const stufe = Math.max(0, Math.min(2, Math.round(1 + hang + (schwelle - 0.5) * 0.7)));
        rgb = band[b].c[stufe];
      }
      daten.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
  }
  bctx.putImageData(daten, 0, 0);

  _gelaende = { hoehe, wasser, bild };
  return _gelaende;
}

// ---------- Wegsuche (A*) ----------

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const NACHBARN = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  .map(([dx, dy]) => ({ dx, dy, km: Math.hypot(dx * MAP.kmX, dy * MAP.kmY) }));

function findeWeg(T, start, ziel) {
  const { W, H } = MAP;
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const herkunft = new Int32Array(N).fill(-1);
  const fertig = new Uint8Array(N);
  const zx = ziel % W, zy = (ziel / W) | 0;
  const schaetz = i => Math.hypot(((i % W) - zx) * MAP.kmX, (((i / W) | 0) - zy) * MAP.kmY);

  const heap = new Heap();
  g[start] = 0;
  heap.push(schaetz(start), start);
  while (heap.size) {
    const i = heap.pop();
    if (i === ziel) break;
    if (fertig[i]) continue;
    fertig[i] = 1;
    const x = i % W, y = (i / W) | 0;
    const e1 = T.hoehe[i];
    for (const n of NACHBARN) {
      const nx = x + n.dx, ny = y + n.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (fertig[j] || (T.wasser[j] && j !== ziel)) continue;
      const e2 = T.hoehe[j];
      const steigung = (e2 - e1) / (n.km * 1000);
      const kosten = n.km * (1 + 9 * Math.max(0, steigung) + 3 * Math.max(0, -steigung) + Math.max(0, e2 - 2700) / 450);
      const ng = g[i] + kosten;
      if (ng < g[j]) {
        g[j] = ng;
        herkunft[j] = i;
        heap.push(ng + schaetz(j), j);
      }
    }
  }
  const weg = [];
  for (let i = ziel; i !== -1; i = herkunft[i]) {
    weg.push(i);
    if (i === start) break;
  }
  if (weg[weg.length - 1] !== start) return [start, ziel];
  return weg.reverse();
}

// ---------- Reihenfolge optimieren ----------

function optimiereReihenfolge(stopps, rund) {
  const n = stopps.length;
  if (n < 3) return stopps.slice();
  // Nächster Nachbar ab dem Start
  const rest = stopps.slice(1);
  const r = [stopps[0]];
  while (rest.length) {
    const letzter = r[r.length - 1];
    let best = 0;
    for (let i = 1; i < rest.length; i++) {
      if (luftlinieKm(letzter, rest[i]) < luftlinieKm(letzter, rest[best])) best = i;
    }
    r.push(rest.splice(best, 1)[0]);
  }
  // 2-opt
  const kante = (a, b) => (a && b ? luftlinieKm(a, b) : 0);
  let besser = true;
  while (besser) {
    besser = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = r[i - 1], b = r[i], c = r[j];
        const d = j + 1 < n ? r[j + 1] : (rund ? r[0] : null);
        const delta = kante(a, c) + kante(b, d) - kante(a, b) - kante(c, d);
        if (delta < -1e-6) {
          r.splice(i, j - i + 1, ...r.slice(i, j + 1).reverse());
          besser = true;
        }
      }
    }
  }
  return r;
}

// ---------- Route berechnen ----------

function schwierigkeitVon(maxH, modus) {
  if (modus === 'velo') {
    if (maxH > 2500) return { stufe: 'Pässe-Königsetappe', farbe: '#d9472b' };
    if (maxH > 1800) return { stufe: 'Alpenpässe', farbe: '#e8873a' };
    return { stufe: 'Gemütliche Tour', farbe: '#4f8a48' };
  }
  if (maxH >= 4000) return { stufe: 'Hochtour – Gletscher, Seil & Bergführer', farbe: '#d9472b' };
  if (maxH >= 3000) return { stufe: 'Alpinwandern T4–T5', farbe: '#e8873a' };
  if (maxH >= 2000) return { stufe: 'Bergwandern T2–T3', farbe: '#f2c14e' };
  return { stufe: 'Wandern T1', farbe: '#4f8a48' };
}

// Faustregel der Alpenvereine: Horizontal- und Vertikalzeit, die kleinere zählt halb
function dauerStunden(km, auf, ab, modus) {
  const m = MODI[modus] || MODI.wandern;
  const tH = km / m.kmh;
  const tV = auf / m.hmProStunde + ab / (m.hmProStunde * 2);
  return Math.max(tH, tV) + Math.min(tH, tV) / 2;
}

function berechneRoute(T, stopps, opt) {
  let folge = opt.optimieren ? optimiereReihenfolge(stopps, opt.rund) : stopps.slice();
  if (folge.length < 2) return { folge, etappen: [], weg: [], hoehen: [], stoppIndex: [], km: 0, auf: 0, ab: 0, maxH: folge[0] ? folge[0].h : 0 };

  const ziele = opt.rund ? [...folge, folge[0]] : folge;
  const weg = [], hoehen = [], stoppIndex = [0], etappen = [];
  let km = 0, auf = 0, ab = 0, maxH = 0;

  for (let s = 0; s < ziele.length - 1; s++) {
    const a = ziele[s], b = ziele[s + 1];
    const zellen = findeWeg(T, zelleVon(a), zelleVon(b));
    let ekm = 0, eauf = 0, eab = 0;
    const eh = zellen.map((z, k) => (k === 0 ? a.h : k === zellen.length - 1 ? b.h : T.hoehe[z]));
    for (let k = 1; k < zellen.length; k++) {
      const dx = (zellen[k] % MAP.W) - (zellen[k - 1] % MAP.W);
      const dy = ((zellen[k] / MAP.W) | 0) - ((zellen[k - 1] / MAP.W) | 0);
      ekm += Math.hypot(dx * MAP.kmX, dy * MAP.kmY) * WEGFAKTOR;
      const dh = eh[k] - eh[k - 1];
      if (dh > 0) eauf += dh; else eab -= dh;
    }
    // Ziel liegt im selben Rasterfeld – trotzdem Luftlinie werten
    if (zellen.length <= 2) ekm = Math.max(ekm, luftlinieKm(a, b) * WEGFAKTOR);
    for (let k = s === 0 ? 0 : 1; k < zellen.length; k++) {
      weg.push(zellen[k]);
      hoehen.push(eh[k]);
      maxH = Math.max(maxH, eh[k]);
    }
    stoppIndex.push(weg.length - 1);
    etappen.push({ von: a, nach: b, km: ekm, auf: eauf, ab: eab });
    km += ekm; auf += eauf; ab += eab;
  }

  const stunden = dauerStunden(km, auf, ab, opt.modus);
  const tage = Math.max(1, Math.ceil(stunden / (MODI[opt.modus] || MODI.wandern).stundenProTag));

  return {
    folge, etappen, weg, hoehen, stoppIndex, km, auf, ab, maxH, stunden, tage,
    schwierigkeit: schwierigkeitVon(maxH, opt.modus),
  };
}

// ---------- Pixel-Figuren ----------

const DUDE_PIXEL = [
  '...........aaaa....',
  '.......bcccddddc...',
  '.....eedfffddddfe..',
  '.....iijddddddddae.',
  '....alllllllllddae.',
  '....allmnoooooodae.',
  '....allpqqqqqqqa...',
  '....arfpqqsqtsqa...',
  '....aodqqquqvuqa...',
  '....andddqwqxwqa...',
  '....aydddqqzqqqa...',
  '....alydddddddda...',
  '....aillllllllla...',
  '...aaalllllllllc...',
  '..aaaaaaaBBBBBa....',
  '.aCDaEaFDaanGaDa...',
  '.aCDaEHaaEuaIuaa...',
  '.aJKaLMNaOPIPPaa...',
  '.aJQaHnNauEuPEaa...',
  '.aJQanqNauuEOuaa...',
  '.aJQaoqnRaEuPEana..',
  '..aaaonooauEOuana..',
  '....aTTTTHHHHHaT...',
  '....caaaaHHHHHac...',
  '.....aUUUUUUUUa....',
  '.....aUUUUaUUUa....',
  '.....aUllUaUVla....',
  '.....allllaUllla...',
  '.....allllaUllla...',
  '.....aUUUUaUUUUa...',
];
const DUDE_FARBEN = {
  a: '#302c2e', b: '#262022', c: '#333032', d: '#a05b53', e: '#333738', f: '#995751', i: '#2c2a2c',
  j: '#aa5f56', l: '#7a444a', m: '#eab47a', n: '#dba974', o: '#e7b785', p: '#fed4a7', q: '#f4cca1',
  r: '#b8856b', s: '#8c7b83', t: '#9b8d8d', u: '#394778', v: '#595d7f', w: '#2e3c6c', x: '#494f73',
  y: '#874950', z: '#dcb58c', B: '#6a383d', C: '#345339', D: '#397b44', E: '#28608a', F: '#398246',
  G: '#4d413a', H: '#39314b', I: '#37426b', J: '#364544', K: '#3b5e52', L: '#363e5f', M: '#bd9367',
  N: '#272529', O: '#344d7c', P: '#2c5985', Q: '#3c5956', R: '#d6a572', T: '#1f1f27', U: '#5e3643',
  V: '#714146',
};
const DUDE_B = DUDE_PIXEL[0].length, DUDE_H = DUDE_PIXEL.length;

function zeichneDude(ctx, x, y, u, spiegeln = false, schritt = 0) {
  for (let r = 0; r < DUDE_H; r++) {
    const zeile = DUDE_PIXEL[r];
    // Beine abwechselnd anheben beim Laufen
    const beinVersatz = r >= 24 && schritt ? (schritt === 1 ? -1 : 0) : 0;
    for (let c = 0; c < DUDE_B; c++) {
      const f = DUDE_FARBEN[zeile[c]];
      if (!f) continue;
      const cc = spiegeln ? DUDE_B - 1 - c : c;
      const links = cc < DUDE_B / 2 + 1;
      const dy = beinVersatz && (schritt === 1) === links ? beinVersatz : 0;
      ctx.fillStyle = f;
      ctx.fillRect(x + cc * u, y + (r + dy) * u, u, u);
    }
  }
}

function dudeBild(u, spiegeln = false, schritt = 0) {
  const c = document.createElement('canvas');
  c.width = DUDE_B * u; c.height = DUDE_H * u;
  zeichneDude(c.getContext('2d'), 0, 0, u, spiegeln, schritt);
  return c;
}

const ICONS = {
  gipfel: ['...k...', '..kwk..', '.kwwwk.', 'kkkkkkk'],
  ort:    ['..k..', '.krk.', 'krrrk', 'kpppk', 'kkkkk'],
  huette: ['..k..', '.kbk.', 'kbbbk', 'kpdpk', 'kkkkk'],
  eigen:  ['.kkk.', 'kgggk', 'kgggk', '.kkk.'],
};
const ICON_FARBEN = { k: '#141a2e', w: '#f8fbff', r: '#c0392b', p: '#efe6d2', b: '#7a4a2e', d: '#3b2a20', g: '#f2c14e' };
const FAHNE = ['kk.....', 'kffffk.', 'kfffffk', 'kffffk.', 'kk.....', 'k......', 'k......', 'k......', 'kk.....'];

function zeichneMuster(ctx, muster, x, y, u, farben) {
  for (let r = 0; r < muster.length; r++) {
    for (let c = 0; c < muster[r].length; c++) {
      const f = farben[muster[r][c]];
      if (!f) continue;
      ctx.fillStyle = f;
      ctx.fillRect(x + c * u, y + r * u, u, u);
    }
  }
}

function zeichneSchild(ctx, text, x, y, groesse, hinter = '#141a2e', vorder = '#f8fbff') {
  ctx.font = `${groesse}px "Pixelify Sans", monospace`;
  ctx.textBaseline = 'middle';
  const b = Math.ceil(ctx.measureText(text).width) + 8;
  const h = groesse + 6;
  ctx.fillStyle = hinter;
  ctx.fillRect(x, y - h / 2, b, h);
  ctx.fillRect(x - 2, y - h / 2 + 2, b + 4, h - 4);
  ctx.fillStyle = vorder;
  ctx.fillText(text, x + 4, y + 1);
  return b;
}

// ---------- Karte zeichnen ----------

// opt: { S, ox, oy, route, stopps, alleOrte, hoverId, fortschritt, walker }
function zeichneKarte(ctx, T, opt) {
  const S = opt.S || 3, ox = opt.ox || 0, oy = opt.oy || 0;
  const u = Math.max(1, Math.round(S * 2 / 3));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(T.bild, ox, oy, MAP.W * S, MAP.H * S);

  const gewaehlt = new Set((opt.stopps || []).map(s => s.id));
  const pos = o => { const p = geoZuRaster(o.lon, o.lat); return { x: ox + Math.floor(p.x) * S + S / 2, y: oy + Math.floor(p.y) * S + S / 2 }; };

  if (opt.alleOrte) {
    for (const o of ALPEN_ORTE) {
      if (gewaehlt.has(o.id)) continue;
      const m = ICONS[o.typ];
      const p = pos(o);
      zeichneMuster(ctx, m, Math.round(p.x - (m[0].length * u) / 2), Math.round(p.y - m.length * u + u), u, ICON_FARBEN);
    }
  }

  // Route
  const r = opt.route;
  if (r && r.weg.length > 1) {
    const ende = opt.fortschritt == null ? r.weg.length : Math.min(r.weg.length, Math.floor(opt.fortschritt) + 1);
    ctx.fillStyle = '#141a2e';
    for (let k = 0; k < ende; k++) {
      const z = r.weg[k];
      ctx.fillRect(ox + (z % MAP.W) * S - 1, oy + ((z / MAP.W) | 0) * S - 1, S + 2, S + 2);
    }
    for (let k = 0; k < ende; k++) {
      const z = r.weg[k];
      ctx.fillStyle = (k >> 1) % 2 ? '#f2c14e' : '#d9472b';
      ctx.fillRect(ox + (z % MAP.W) * S, oy + ((z / MAP.W) | 0) * S, S, S);
    }
  }

  // Stopps mit Fahnen und Nummern – Schilder weichen einander nach unten aus
  const folge = r && r.folge.length ? r.folge : (opt.stopps || []);
  const gross = Math.max(11, Math.round(S * 4.2));
  const belegt = [];
  folge.forEach((o, i) => {
    const p = pos(o);
    const fx = Math.round(p.x - u / 2), fy = Math.round(p.y - FAHNE.length * u + u);
    zeichneMuster(ctx, FAHNE, fx, fy, u, { k: '#141a2e', f: i === 0 ? '#4f8a48' : '#d9472b' });
    const text = opt.namen !== false ? `${i + 1} ${o.name}` : String(i + 1);
    ctx.font = `${gross}px "Pixelify Sans", monospace`;
    const breite = ctx.measureText(text).width + 22, hoehe = gross + 6;
    const lx = fx + 7 * u + 1;
    let ly = fy + 2 * u;
    for (let v = 0; v < 8 && belegt.some(b => lx < b.x + b.w && lx + breite > b.x && Math.abs(ly - b.y) < hoehe); v++) ly += hoehe + 1;
    belegt.push({ x: lx, y: ly, w: breite });
    const b = zeichneSchild(ctx, String(i + 1), lx, ly, gross, '#141a2e', '#f2c14e');
    if (opt.namen !== false) zeichneSchild(ctx, o.name, lx + b + 1, ly, gross, 'rgba(20,26,46,0.85)', '#f8fbff');
  });

  // Hover-Name
  if (opt.hoverId && !gewaehlt.has(opt.hoverId)) {
    const o = ALPEN_ORTE.find(x => x.id === opt.hoverId);
    if (o) {
      const p = pos(o);
      zeichneSchild(ctx, `${o.name} ${o.h} m`, p.x + 8, p.y - 8, Math.max(11, Math.round(S * 4.2)), '#efe6d2', '#141a2e');
    }
  }

  // Wanderer
  if (opt.walker) {
    const w = opt.walker;
    const du = Math.max(1, Math.round(S / 3));
    zeichneDude(ctx, Math.round(ox + w.x * S - (DUDE_B * du) / 2), Math.round(oy + w.y * S - DUDE_H * du + S), du, w.spiegeln, w.schritt);
  }
}

// ---------- Höhenprofil ----------

function bandFarbe(h) {
  for (const b of BAENDER) if (h <= b.bis) return b.c[1];
  return BAENDER[BAENDER.length - 1].c[1];
}

function zeichneProfil(ctx, route, x, y, w, h, opt = {}) {
  const px = opt.px || 4;
  ctx.imageSmoothingEnabled = false;
  // Himmel in Stufen
  const himmel = ['#7fb6e6', '#93c2ec', '#a8cff1', '#bcdbf5'];
  himmel.forEach((f, i) => { ctx.fillStyle = f; ctx.fillRect(x, y + (h * i) / 4, w, h / 4 + 1); });
  if (!route || route.hoehen.length < 2) return;

  const spalten = Math.floor(w / px);
  const maxH = Math.max(1000, Math.ceil(route.maxH / 500) * 500 + 300);
  const n = route.hoehen.length;
  for (let s = 0; s < spalten; s++) {
    const k = Math.min(n - 1, Math.round((s / (spalten - 1)) * (n - 1)));
    const hh = route.hoehen[k];
    const top = Math.round(((h - 4) * (1 - hh / maxH)) / px) * px;
    for (let yy = top; yy < h; yy += px) {
      const hoeheHier = maxH * (1 - yy / h);
      ctx.fillStyle = yy === top ? '#141a2e' : bandFarbe(hoeheHier);
      ctx.fillRect(x + s * px, y + yy, px, px);
    }
  }
  // Stoppmarken
  ctx.font = `${Math.max(11, px * 3)}px "Pixelify Sans", monospace`;
  ctx.textBaseline = 'top';
  route.stoppIndex.forEach((k, i) => {
    const sx = x + Math.round(((k / (n - 1)) * (spalten - 1))) * px;
    ctx.fillStyle = 'rgba(20,26,46,0.5)';
    for (let yy = 0; yy < h; yy += px * 2) ctx.fillRect(sx, y + yy, Math.max(1, px / 2), px);
    const nr = opt.rund && i === route.stoppIndex.length - 1 ? '1' : String(i + 1);
    const tb = ctx.measureText(nr).width + 6;
    const lx = Math.min(x + w - tb, Math.max(x, sx - tb / 2));
    ctx.fillStyle = '#141a2e';
    ctx.fillRect(lx, y + 2, tb, px * 3 + 4);
    ctx.fillStyle = '#f2c14e';
    ctx.fillText(nr, lx + 3, y + 3);
  });
  // Skala
  ctx.fillStyle = '#141a2e';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${maxH} m`, x + 4, y + h * 0.18 + px * 3);
}

// ---------- Formatierung ----------

function fmtZahl(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function fmtDauer(stunden) {
  const h = Math.floor(stunden), m = Math.round((stunden - h) * 60 / 5) * 5;
  return m === 60 ? `${h + 1} h` : m ? `${h} h ${m} min` : `${h} h`;
}

// ---------- Bild-Export ----------

async function schriftenBereit() {
  try {
    await Promise.all([
      document.fonts.load('700 48px "Silkscreen"'),
      document.fonts.load('16px "Pixelify Sans"'),
      document.fonts.load('600 16px "Pixelify Sans"'),
    ]);
  } catch (e) { /* ohne Webfonts geht's auch */ }
}

// Titel im Stil des Minecraft-Logos: schwarzer Rand, dunkle 3D-Kante, heller Verlauf
function zeichneBlockText(ctx, text, x, y, groesse) {
  ctx.font = `700 ${groesse}px "Silkscreen", monospace`;
  ctx.textBaseline = 'alphabetic';
  const r = Math.max(2, Math.round(groesse / 16));
  const kante = Math.max(3, Math.round(groesse / 9));
  ctx.fillStyle = '#111';
  for (let dy = -r; dy <= kante + r; dy++) {
    for (let dx = -r; dx <= r; dx++) ctx.fillText(text, x + dx, y + dy);
  }
  ctx.fillStyle = '#4a4850';
  for (let dy = 1; dy <= kante; dy++) ctx.fillText(text, x, y + dy);
  const verlauf = ctx.createLinearGradient(0, y - groesse * 0.75, 0, y);
  verlauf.addColorStop(0, '#f3efec');
  verlauf.addColorStop(0.55, '#d6cfcc');
  verlauf.addColorStop(1, '#a9a2a3');
  ctx.fillStyle = verlauf;
  ctx.fillText(text, x, y);
}

async function erstelleRoutenBild(route, ergebnis, opt) {
  await schriftenBereit();
  const T = erzeugeGelaende();
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 900;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#141a2e';
  ctx.fillRect(0, 0, c.width, c.height);
  // Himmel-Streifen oben
  ['#2b3a66', '#3a5288', '#4f6fae', '#6a8fcc'].forEach((f, i) => { ctx.fillStyle = f; ctx.fillRect(0, i * 22, c.width, 22); });
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(Math.floor(hash2(i, 3) * 1280 / 4) * 4, Math.floor(hash2(i, 9) * 80 / 4) * 4, 4, 4);
  }

  // Titel
  const titel = (route.name || 'Meine Alpentour').toUpperCase();
  let titelGroesse = 48;
  ctx.font = `700 ${titelGroesse}px "Silkscreen", monospace`;
  while (titelGroesse > 22 && ctx.measureText(titel).width > 820) {
    titelGroesse -= 2;
    ctx.font = `700 ${titelGroesse}px "Silkscreen", monospace`;
  }
  zeichneBlockText(ctx, titel, 32, 66, titelGroesse);
  ctx.font = '22px "Pixelify Sans", monospace';
  ctx.fillStyle = '#f2c14e';
  const unter = `${(MODI[route.modus] || MODI.wandern).name}${route.rund ? ' · Rundtour' : ''} · ${new Date(route.datum || Date.now()).toLocaleDateString('de-CH')}`;
  ctx.textAlign = 'right';
  ctx.fillText(unter, 1248, 64);
  ctx.textAlign = 'left';

  // Rahmen + Karte
  const rahmen = (x, y, w, h) => {
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
    ctx.fillStyle = '#141a2e'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  };
  rahmen(32, 112, 960, 540);
  zeichneKarte(ctx, T, { S: 3, ox: 32, oy: 112, route: ergebnis, stopps: ergebnis.folge, alleOrte: false });

  // Etappen-Liste
  rahmen(1020, 112, 228, 540);
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(1020, 112, 228, 540);
  ctx.fillStyle = '#141a2e';
  ctx.font = '700 24px "Silkscreen", monospace';
  ctx.fillText('ETAPPEN', 1034, 148);
  const folge = ergebnis.folge;
  const zeile = Math.min(44, Math.floor(470 / Math.max(1, folge.length)));
  folge.forEach((o, i) => {
    const y = 172 + i * zeile;
    ctx.fillStyle = i === 0 ? '#4f8a48' : '#d9472b';
    ctx.fillRect(1034, y, 22, 22);
    ctx.fillStyle = '#f8fbff';
    ctx.font = '16px "Pixelify Sans", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 1045 - ctx.measureText(String(i + 1)).width / 2, y + 12);
    ctx.fillStyle = '#141a2e';
    ctx.font = `600 ${zeile < 30 ? 15 : 18}px "Pixelify Sans", monospace`;
    let name = o.name;
    while (ctx.measureText(name).width > 170 && name.length > 3) name = name.slice(0, -2) + '…';
    ctx.fillText(name, 1064, y + 9);
    if (zeile >= 30) {
      ctx.font = '14px "Pixelify Sans", monospace';
      ctx.fillStyle = '#6b5446';
      ctx.fillText(`${fmtZahl(o.h)} m · ${TYP_NAMEN[o.typ] || ''}`, 1064, y + 28);
    }
    ctx.textBaseline = 'alphabetic';
  });

  // Höhenprofil
  rahmen(32, 680, 1216, 96);
  zeichneProfil(ctx, ergebnis, 32, 680, 1216, 96, { px: 4, rund: route.rund });

  // Kennzahlen
  const werte = [
    ['Distanz', `${fmtZahl(ergebnis.km)} km`],
    ['Aufstieg', `${fmtZahl(ergebnis.auf)} hm`],
    ['Höchster Punkt', `${fmtZahl(ergebnis.maxH)} m`],
    ['Unterwegs', `${Math.round(ergebnis.stunden || 0)} h · ${ergebnis.tage || 1} ${ergebnis.tage === 1 ? 'Tag' : 'Tage'}`],
  ];
  werte.forEach(([titel, wert], i) => {
    const x = 32 + i * 236, y = 800;
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(x, y, 224, 76);
    ctx.fillStyle = '#d9cba9'; ctx.fillRect(x, y + 72, 224, 4);
    ctx.fillStyle = '#6b5446';
    ctx.font = '700 14px "Silkscreen", monospace';
    ctx.fillText(titel.toUpperCase(), x + 12, y + 26);
    ctx.fillStyle = '#141a2e';
    ctx.font = '26px "Pixelify Sans", monospace';
    ctx.fillText(wert, x + 12, y + 60);
  });
  const sch = ergebnis.schwierigkeit || schwierigkeitVon(ergebnis.maxH, route.modus);
  ctx.fillStyle = sch.farbe;
  ctx.fillRect(976, 800, 200, 76);
  ctx.fillStyle = '#141a2e';
  ctx.font = '700 14px "Silkscreen", monospace';
  ctx.fillText('SCHWIERIGKEIT', 988, 826);
  ctx.font = '15px "Pixelify Sans", monospace';
  const woerter = sch.stufe.split(' ');
  let z = '', zy = 848;
  for (const w of woerter) {
    if (ctx.measureText(z + w).width > 176) { ctx.fillText(z, 988, zy); z = ''; zy += 18; }
    z += w + ' ';
  }
  ctx.fillText(z, 988, zy);

  zeichneDude(ctx, 1192, 796, 3, true);

  ctx.font = '13px "Pixelify Sans", monospace';
  ctx.fillStyle = '#7f8bb0';
  ctx.fillText('Gipfelpfad · Pixel-Routenplaner für die Alpen · nur zur Inspiration, keine echte Tourenplanung', 32, 893);
  return c;
}

function ladeBildHerunter(canvas, name) {
  const datei = (name || 'alpentour').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || 'alpentour';
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${datei}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

// ---------- Speicher ----------

const SPEICHER_KEY = 'gipfelpfad.routen';

function ladeRouten() {
  try { return JSON.parse(localStorage.getItem(SPEICHER_KEY)) || []; } catch (e) { return []; }
}

function speichereRouten(liste) {
  try { localStorage.setItem(SPEICHER_KEY, JSON.stringify(liste)); return true; } catch (e) { return false; }
}

// Dude als Favicon / Deko in jede Seite einsetzen
document.addEventListener('DOMContentLoaded', () => {
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = dudeBild(2).toDataURL();
  document.head.appendChild(icon);
  document.querySelectorAll('[data-dude]').forEach(el => {
    const u = Number(el.dataset.dude) || 3;
    el.src = dudeBild(u, el.hasAttribute('data-spiegeln')).toDataURL();
  });
});
