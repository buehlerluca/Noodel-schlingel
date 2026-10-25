// Routenplaner: Ziele wählen, Route berechnen, zeichnen, speichern

const T = erzeugeGelaende();
const ENTWURF_KEY = 'gipfelpfad.entwurf';
const BEWEGUNG_AUS = matchMedia('(prefers-reduced-motion: reduce)').matches;

const zustand = { id: null, name: 'Meine Alpentour', modus: 'wandern', optimieren: true, rund: false, stopps: [] };
let ergebnis = null;
let filterTyp = 'alle';
let hoverId = null;
let animation = null;
let fortschritt = null;

const $ = id => document.getElementById(id);
const karte = $('karte'), kctx = karte.getContext('2d');
const profil = $('profil'), pctx = profil.getContext('2d');

// ---------- Startzustand: gespeicherte Route, Entwurf, ?add= ----------

const params = new URLSearchParams(location.search);
try {
  const quelle = params.get('id')
    ? ladeRouten().find(r => r.id === params.get('id'))
    : JSON.parse(localStorage.getItem(ENTWURF_KEY));
  if (quelle) Object.assign(zustand, JSON.parse(JSON.stringify(quelle)));
} catch (e) { /* kein Entwurf */ }
for (const id of (params.get('add') || '').split(',')) {
  const o = ALPEN_ORTE.find(x => x.id === id);
  if (o && !zustand.stopps.some(s => s.id === o.id)) zustand.stopps.push({ ...o });
}
if (params.toString()) history.replaceState(null, '', location.pathname);

// ---------- Hilfen ----------

const normal = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(text) {
  $('toastText').textContent = text;
  $('toast').classList.add('zeigen');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('zeigen'), 2600);
}

function entwurfSichern() {
  try { localStorage.setItem(ENTWURF_KEY, JSON.stringify(zustand)); } catch (e) { /* egal */ }
}

function ortUmschalten(o) {
  const i = zustand.stopps.findIndex(s => s.id === o.id);
  if (i >= 0) zustand.stopps.splice(i, 1);
  else zustand.stopps.push({ id: o.id, name: o.name, lat: o.lat, lon: o.lon, h: o.h, typ: o.typ, land: o.land });
  aktualisieren();
}

// ---------- Listen ----------

function zeichneOrtListe() {
  const q = normal($('suche').value.trim());
  const drin = new Set(zustand.stopps.map(s => s.id));
  const treffer = ALPEN_ORTE
    .filter(o => filterTyp === 'alle' || o.typ === filterTyp)
    .filter(o => !q || normal(o.name).includes(q) || normal(o.land).includes(q))
    .sort((a, b) => b.h - a.h);
  $('ortListe').innerHTML = treffer.length
    ? treffer.map(o => `
      <li data-id="${o.id}" class="${drin.has(o.id) ? 'drin' : ''}">
        <span class="plus">${drin.has(o.id) ? '✓' : '+'}</span>
        <span class="typ-punkt typ-${o.typ}"></span>
        <span class="name">${esc(o.name)}</span>
        <span class="hoehe">${fmtZahl(o.h)} m</span>
      </li>`).join('')
    : '<li class="leer-hinweis">Nichts gefunden – klick einfach auf die Karte!</li>';
}

function zeichneZielListe() {
  const n = zustand.stopps.length;
  $('anzahl').textContent = `${n} ${n === 1 ? 'Ziel' : 'Ziele'}`;
  if (!n) {
    $('zielListe').innerHTML = '<li class="leer-hinweis" style="animation:none;box-shadow:none">Noch leer. Wähl mindestens zwei Ziele aus der Liste oder auf der Karte.</li>';
    return;
  }
  const fix = zustand.optimieren;
  $('zielListe').innerHTML = zustand.stopps.map((s, i) => `
    <li data-i="${i}">
      <span class="nr">${i + 1}</span>
      <span class="name">${s.typ === 'eigen'
        ? `<input type="text" value="${esc(s.name)}" maxlength="30" data-name="${i}" aria-label="Name des Wegpunkts">`
        : esc(s.name)}<span class="hoehe">${fmtZahl(s.h)} m · ${TYP_NAMEN[s.typ]}</span></span>
      <button data-hoch="${i}" title="Nach oben" ${fix || i === 0 ? 'disabled' : ''}>▲</button>
      <button data-runter="${i}" title="Nach unten" ${fix || i === n - 1 ? 'disabled' : ''}>▼</button>
      <button class="weg" data-weg="${i}" title="Entfernen">✕</button>
    </li>`).join('');
}

// ---------- Kennzahlen & Etappen ----------

function zeichneStats() {
  const r = ergebnis;
  const ok = r && r.etappen.length;
  const werte = [
    ['Distanz', ok ? `${fmtZahl(r.km)} km` : '–'],
    ['Aufstieg', ok ? `↑ ${fmtZahl(r.auf)} hm` : '–'],
    ['Abstieg', ok ? `↓ ${fmtZahl(r.ab)} hm` : '–'],
    ['Höchster Punkt', ok ? `${fmtZahl(r.maxH)} m` : '–'],
    ['Unterwegs', ok ? `${fmtDauer(r.stunden)}` : '–'],
    ['Tage', ok ? `${r.tage}` : '–'],
  ];
  let html = werte.map(([t, w]) => `<div class="pixel-box stat"><div class="titel">${t}</div><div class="wert">${w}</div></div>`).join('');
  if (ok) {
    html += `<div class="pixel-box stat schwierig" style="background:${r.schwierigkeit.farbe}">
      <div class="titel" style="color:inherit">Schwierigkeit</div><div class="wert">${esc(r.schwierigkeit.stufe)}</div></div>`;
  }
  $('stats').innerHTML = html;

  $('etappen').innerHTML = ok
    ? `<table>
        <tr><th>#</th><th>Von → Nach</th><th class="zahl">km</th><th class="zahl">↑ hm</th><th class="zahl">↓ hm</th><th class="zahl">Zeit</th></tr>
        ${r.etappen.map((e, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(e.von.name)} → ${esc(e.nach.name)}</td>
          <td class="zahl">${fmtZahl(e.km)}</td>
          <td class="zahl">${fmtZahl(e.auf)}</td>
          <td class="zahl">${fmtZahl(e.ab)}</td>
          <td class="zahl">${fmtDauer(dauerStunden(e.km, e.auf, e.ab, zustand.modus))}</td>
        </tr>`).join('')}
      </table>`
    : '<p class="leer-hinweis">Sobald du zwei Ziele hast, erscheinen hier die Etappen.</p>';

  $('btnBild').disabled = $('btnSpeichern').disabled = $('btnLaufen').disabled = !ok;
}

// ---------- Karte ----------

function wandererPosition() {
  const r = ergebnis;
  if (r && r.weg.length > 1) {
    const k = Math.min(r.weg.length - 1, Math.floor(fortschritt == null ? r.weg.length - 1 : fortschritt));
    const z = r.weg[k];
    const nachbar = r.weg[Math.min(r.weg.length - 1, k + 1)];
    const lauf = fortschritt != null && k < r.weg.length - 1;
    return {
      x: (z % MAP.W) + 0.5,
      y: ((z / MAP.W) | 0) + 0.5,
      spiegeln: (nachbar % MAP.W) > (z % MAP.W),
      schritt: lauf ? (Math.floor(fortschritt / 2) % 2) + 1 : 0,
    };
  }
  if (zustand.stopps.length) {
    const p = geoZuRaster(zustand.stopps[0].lon, zustand.stopps[0].lat);
    return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5, spiegeln: false, schritt: 0 };
  }
  return null;
}

function zeichne() {
  zeichneKarte(kctx, T, {
    S: 3,
    route: ergebnis,
    stopps: zustand.stopps,
    alleOrte: true,
    hoverId,
    fortschritt,
    walker: wandererPosition(),
  });
}

function starteAnimation() {
  cancelAnimationFrame(animation);
  if (!ergebnis || ergebnis.weg.length < 2 || BEWEGUNG_AUS) { fortschritt = null; zeichne(); return; }
  const laenge = ergebnis.weg.length;
  const tempo = Math.max(0.5, laenge / 180);
  fortschritt = 0;
  const schritt = () => {
    fortschritt += tempo;
    if (fortschritt >= laenge - 1) { fortschritt = null; zeichne(); return; }
    zeichne();
    animation = requestAnimationFrame(schritt);
  };
  animation = requestAnimationFrame(schritt);
}

// ---------- Alles neu berechnen ----------

function aktualisieren({ animieren = true } = {}) {
  ergebnis = berechneRoute(T, zustand.stopps, zustand);
  if (zustand.optimieren) zustand.stopps = ergebnis.folge.slice();
  $('kartenTitel').textContent = zustand.name || 'Meine Alpentour';
  zeichneOrtListe();
  zeichneZielListe();
  zeichneStats();
  zeichneProfil(pctx, ergebnis, 0, 0, profil.width, profil.height, { px: 4, rund: zustand.rund });
  entwurfSichern();
  if (animieren) starteAnimation(); else zeichne();
}

// ---------- Ereignisse ----------

$('routenName').value = zustand.name;
$('optimieren').checked = zustand.optimieren;
$('rund').checked = zustand.rund;
document.querySelectorAll('#modus button').forEach(b => b.classList.toggle('aktiv', b.dataset.modus === zustand.modus));

$('routenName').addEventListener('input', e => {
  zustand.name = e.target.value;
  $('kartenTitel').textContent = zustand.name || 'Meine Alpentour';
  entwurfSichern();
});

$('suche').addEventListener('input', zeichneOrtListe);

$('filter').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  filterTyp = b.dataset.typ;
  document.querySelectorAll('#filter button').forEach(x => x.classList.toggle('aktiv', x === b));
  zeichneOrtListe();
});

$('ortListe').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]');
  if (li) ortUmschalten(ALPEN_ORTE.find(o => o.id === li.dataset.id));
});

$('zielListe').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const s = zustand.stopps;
  if (b.dataset.weg != null) s.splice(+b.dataset.weg, 1);
  else if (b.dataset.hoch != null) { const i = +b.dataset.hoch; [s[i - 1], s[i]] = [s[i], s[i - 1]]; }
  else if (b.dataset.runter != null) { const i = +b.dataset.runter; [s[i + 1], s[i]] = [s[i], s[i + 1]]; }
  aktualisieren();
});

$('zielListe').addEventListener('input', e => {
  if (e.target.dataset.name == null) return;
  zustand.stopps[+e.target.dataset.name].name = e.target.value || 'Wegpunkt';
  entwurfSichern();
  if (fortschritt == null) zeichne();
});
$('zielListe').addEventListener('change', e => { if (e.target.dataset.name != null) aktualisieren({ animieren: false }); });

$('modus').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  zustand.modus = b.dataset.modus;
  document.querySelectorAll('#modus button').forEach(x => x.classList.toggle('aktiv', x === b));
  aktualisieren({ animieren: false });
});

$('optimieren').addEventListener('change', e => { zustand.optimieren = e.target.checked; aktualisieren(); });
$('rund').addEventListener('change', e => { zustand.rund = e.target.checked; aktualisieren(); });

$('btnLeeren').addEventListener('click', () => {
  if (zustand.stopps.length && !confirm('Alle Ziele entfernen?')) return;
  Object.assign(zustand, { id: null, stopps: [] });
  aktualisieren();
});

$('btnLaufen').addEventListener('click', starteAnimation);

// Karte: Maus → Rasterkoordinaten
function rasterPunkt(e) {
  const r = karte.getBoundingClientRect();
  return {
    gx: (e.clientX - r.left) / r.width * MAP.W,
    gy: (e.clientY - r.top) / r.height * MAP.H,
    px: e.clientX - r.left,
    py: e.clientY - r.top,
  };
}

function ortUnterMaus(gx, gy) {
  let best = null, bestD = 2.6;
  for (const o of [...ALPEN_ORTE, ...zustand.stopps.filter(s => s.typ === 'eigen')]) {
    const p = geoZuRaster(o.lon, o.lat);
    const d = Math.hypot(p.x - gx, p.y - gy);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}

karte.addEventListener('mousemove', e => {
  const { gx, gy, px, py } = rasterPunkt(e);
  const o = ortUnterMaus(gx, gy);
  const tip = $('tooltip');
  const neu = o && o.typ !== 'eigen' ? o.id : null;
  if (neu !== hoverId) { hoverId = neu; if (fortschritt == null) zeichne(); }
  karte.style.cursor = o ? 'pointer' : 'crosshair';

  const i = Math.max(0, Math.min(MAP.W * MAP.H - 1, Math.floor(gy) * MAP.W + Math.floor(gx)));
  if (o) {
    const drin = zustand.stopps.some(s => s.id === o.id);
    tip.innerHTML = `<b>${esc(o.name)}</b> · ${fmtZahl(o.h)} m<br>${TYP_NAMEN[o.typ]}${o.land ? ' · ' + o.land : ''}<br>Klick: ${drin ? 'entfernen' : 'zur Route'}`;
  } else if (T.wasser[i]) {
    tip.innerHTML = '<b>Bergsee</b><br>Hier kannst du nur schwimmen';
  } else {
    const g = rasterZuGeo(gx, gy);
    tip.innerHTML = `≈ <b>${fmtZahl(Math.round(T.hoehe[i] / 10) * 10)} m</b><br>${g.lat.toFixed(2)}° N · ${g.lon.toFixed(2)}° E<br>Klick: Wegpunkt setzen`;
  }
  const rechts = px > karte.clientWidth - 200;
  tip.style.left = `${rechts ? px - 210 : px}px`;
  tip.style.top = `${py}px`;
  tip.classList.add('zeigen');
});

karte.addEventListener('mouseleave', () => {
  $('tooltip').classList.remove('zeigen');
  if (hoverId) { hoverId = null; if (fortschritt == null) zeichne(); }
});

karte.addEventListener('click', e => {
  const { gx, gy } = rasterPunkt(e);
  const o = ortUnterMaus(gx, gy);
  if (o) { ortUmschalten(o); return; }
  const i = Math.floor(gy) * MAP.W + Math.floor(gx);
  if (T.wasser[i]) { toast('Da ist ein See – zu nass für einen Wegpunkt!'); return; }
  const g = rasterZuGeo(Math.floor(gx) + 0.5, Math.floor(gy) + 0.5);
  const nr = zustand.stopps.filter(s => s.typ === 'eigen').length + 1;
  zustand.stopps.push({
    id: `wp${Date.now()}`, name: `Wegpunkt ${nr}`, lat: g.lat, lon: g.lon,
    h: Math.round(T.hoehe[i] / 10) * 10, typ: 'eigen', land: '',
  });
  aktualisieren();
});

// Speichern & Export
$('btnSpeichern').addEventListener('click', () => {
  if (!ergebnis || !ergebnis.etappen.length) return;
  const liste = ladeRouten();
  const eintrag = {
    ...JSON.parse(JSON.stringify(zustand)),
    id: zustand.id || `r${Date.now()}`,
    name: zustand.name || 'Meine Alpentour',
    datum: Date.now(),
  };
  const i = liste.findIndex(r => r.id === eintrag.id);
  if (i >= 0) liste[i] = eintrag; else liste.unshift(eintrag);
  if (!speichereRouten(liste)) { toast('Speichern ging nicht – ist der Browser-Speicher voll?'); return; }
  zustand.id = eintrag.id;
  entwurfSichern();
  toast(i >= 0 ? `„${eintrag.name}" aktualisiert!` : `„${eintrag.name}" liegt jetzt in Meine Routen!`);
});

$('btnBild').addEventListener('click', async () => {
  if (!ergebnis || !ergebnis.etappen.length) return;
  const b = $('btnBild');
  b.disabled = true;
  try {
    const bild = await erstelleRoutenBild({ ...zustand, datum: Date.now() }, ergebnis);
    ladeBildHerunter(bild, zustand.name);
    toast('Pixel-Poster wird heruntergeladen!');
  } finally {
    b.disabled = false;
  }
});

aktualisieren();
schriftenBereit().then(() => {
  zeichneProfil(pctx, ergebnis, 0, 0, profil.width, profil.height, { px: 4, rund: zustand.rund });
  if (fortschritt == null) zeichne();
});
