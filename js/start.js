// Startseite: Parallax, Schneeflocken, Wanderer, Mini-Karte, Gipfelkarten

const held = document.getElementById('held');
held.addEventListener('mousemove', e => {
  const r = held.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  held.style.setProperty('--mx', `${Math.round(x * -24 / 4) * 4}px`);
  held.style.setProperty('--my', `${Math.round(y * -16 / 4) * 4}px`);
});

// ---------- Schneeflocken in grober Auflösung ----------

const flocken = document.getElementById('flocken');
const fctx = flocken.getContext('2d');
let teilchen = [];
function flockenGroesse() {
  flocken.width = Math.ceil(held.clientWidth / 4);
  flocken.height = Math.ceil(held.clientHeight / 4);
  teilchen = Array.from({ length: Math.round(flocken.width * flocken.height / 260) }, () => ({
    x: Math.random() * flocken.width,
    y: Math.random() * flocken.height,
    v: 0.15 + Math.random() * 0.35,
    p: Math.random() * 6.28,
  }));
}
function schneien() {
  fctx.clearRect(0, 0, flocken.width, flocken.height);
  for (const t of teilchen) {
    t.y += t.v;
    t.p += 0.02;
    if (t.y > flocken.height) { t.y = -1; t.x = Math.random() * flocken.width; }
    fctx.fillStyle = t.v > 0.35 ? '#ffffff' : 'rgba(248,251,255,0.6)';
    fctx.fillRect(Math.round(t.x + Math.sin(t.p) * 2), Math.round(t.y), 1, 1);
  }
  requestAnimationFrame(schneien);
}
window.addEventListener('resize', flockenGroesse);
flockenGroesse();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) schneien();

// ---------- Wanderer mit Sprechblase ----------

const SPRUECHE = [
  'Hoi! Wohin geht\'s?', 'Auf geht\'s!', 'Hopp, de Berg ruft!', 'Znüni nicht vergessen!',
  'Noch 2 Stunden … sagt der Wegweiser', 'Grüezi mitenand!', 'Hast du genug Wasser dabei?',
  'Ich riech schon die Hüttensuppe', 'Gipfelkreuz in Sicht!', 'Servus!',
];
const wanderer = document.getElementById('wanderer');
const blase = document.getElementById('blase');
let blasenTimer;
wanderer.addEventListener('click', () => {
  blase.textContent = SPRUECHE[Math.floor(Math.random() * SPRUECHE.length)];
  blase.classList.add('zeigen');
  wanderer.classList.remove('springt');
  void wanderer.offsetWidth;
  wanderer.classList.add('springt');
  clearTimeout(blasenTimer);
  blasenTimer = setTimeout(() => blase.classList.remove('zeigen'), 2200);
});

// ---------- Mini-Karte ----------

const mini = document.getElementById('miniKarte');
const mctx = mini.getContext('2d');
const miniInfo = document.getElementById('miniInfo');
const T = erzeugeGelaende();
let miniHover = null;

function zeichneMini() {
  zeichneKarte(mctx, T, { S: 2, alleOrte: true, hoverId: miniHover });
}
zeichneMini();
schriftenBereit().then(zeichneMini);

function ortBeiMaus(e, canvas, S) {
  const r = canvas.getBoundingClientRect();
  const gx = (e.clientX - r.left) / r.width * canvas.width / S;
  const gy = (e.clientY - r.top) / r.height * canvas.height / S;
  let best = null, bestD = 3.2;
  for (const o of ALPEN_ORTE) {
    const p = geoZuRaster(o.lon, o.lat);
    const d = Math.hypot(p.x - gx, p.y - gy);
    if (d < bestD) { best = o; bestD = d; }
  }
  return { ort: best, gx, gy };
}

mini.addEventListener('mousemove', e => {
  const { ort, gx, gy } = ortBeiMaus(e, mini, 2);
  const id = ort ? ort.id : null;
  if (id !== miniHover) { miniHover = id; zeichneMini(); }
  mini.style.cursor = ort ? 'pointer' : 'crosshair';
  if (ort) {
    miniInfo.textContent = `▲ ${ort.name} · ${fmtZahl(ort.h)} m · ${TYP_NAMEN[ort.typ]} (${ort.land}) – Klick: Route ab hier planen`;
  } else {
    const i = Math.floor(gy) * MAP.W + Math.floor(gx);
    const g = rasterZuGeo(gx, gy);
    miniInfo.textContent = T.wasser[i]
      ? `≈ Bergsee · ${g.lat.toFixed(2)}° N ${g.lon.toFixed(2)}° E`
      : `≈ ${fmtZahl(Math.round(T.hoehe[i] / 10) * 10)} m ü. M. · ${g.lat.toFixed(2)}° N ${g.lon.toFixed(2)}° E`;
  }
});
mini.addEventListener('mouseleave', () => { miniHover = null; zeichneMini(); });
mini.addEventListener('click', e => {
  const { ort } = ortBeiMaus(e, mini, 2);
  if (ort) location.href = `planer.html?add=${ort.id}`;
});

// ---------- Gipfelkarten mit kleinen Pixel-Panoramen ----------

function zeichnePanorama(canvas, ort) {
  const W = 96, H = 48;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const s = ort.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  ['#6a8fcc', '#7fb6e6', '#93c2ec', '#bcdbf5'].forEach((f, i) => { ctx.fillStyle = f; ctx.fillRect(0, i * 8, W, 8); });
  ctx.fillStyle = '#bcdbf5'; ctx.fillRect(0, 32, W, 16);
  // Wolke
  ctx.fillStyle = '#f8fbff';
  const wx = (s * 7) % 70;
  ctx.fillRect(wx, 8, 14, 3); ctx.fillRect(wx + 3, 6, 7, 2);
  // Hintergrundkette
  for (let x = 0; x < W; x++) {
    const h = 26 + Math.round(fbm(x / 14 + s, 2.5) * 12);
    ctx.fillStyle = '#8fa6c8';
    ctx.fillRect(x, H - h, 1, h);
  }
  // Hauptgipfel
  const spitze = 30 + (s % 36);
  const hoch = Math.min(40, 18 + Math.round(ort.h / 160));
  const schnee = ort.h > 2600 ? 0.55 : ort.h > 2000 ? 0.75 : 1;
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - spitze);
    const rau = Math.round((fbm(x / 5 + s * 3, 7) - 0.5) * 6);
    const h = Math.max(6, hoch - Math.round(d * (x < spitze ? 1.1 : 0.8)) + rau);
    for (let y = H - h; y < H; y++) {
      const rel = (y - (H - hoch)) / hoch;
      const licht = x < spitze;
      let f;
      if (rel < 1 - schnee) f = licht ? '#f8fbff' : '#a9bbd3';
      else if (y > H - 8) f = licht ? '#4f8a48' : '#3a7140';
      else f = licht ? '#998473' : '#6b5446';
      ctx.fillStyle = f;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Gipfelkreuz
  ctx.fillStyle = '#141a2e';
  ctx.fillRect(spitze, H - hoch - 5, 1, 5);
  ctx.fillRect(spitze - 1, H - hoch - 4, 3, 1);
}

const BELIEBT = ['matterhorn', 'montblanc', 'eiger', 'grossglockner', 'dreizinnen', 'zugspitze', 'pizbernina', 'triglav'];
const kartenBox = document.getElementById('gipfelKarten');
for (const id of BELIEBT) {
  const o = ALPEN_ORTE.find(x => x.id === id);
  const karte = document.createElement('article');
  karte.className = 'pixel-box gipfel-karte';
  const c = document.createElement('canvas');
  zeichnePanorama(c, o);
  karte.appendChild(c);
  karte.insertAdjacentHTML('beforeend', `
    <h3>${o.name}</h3>
    <div class="meta">${fmtZahl(o.h)} m · ${o.land}</div>
    <a class="knopf klein" href="planer.html?add=${o.id}">+ Zur Route</a>`);
  kartenBox.appendChild(karte);
}
