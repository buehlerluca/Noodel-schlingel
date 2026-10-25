// Meine Routen: gespeicherte Touren anzeigen, öffnen, exportieren, löschen

const T = erzeugeGelaende();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(text) {
  $('toastText').textContent = text;
  $('toast').classList.add('zeigen');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('zeigen'), 2600);
}

let vorschauCanvas = null, vorschauName = '';

// Ganze Karte zeichnen, dann auf den Ausschnitt rund um die Route zoomen
function zeichneVorschau(canvas, erg) {
  const S = 3;
  const voll = document.createElement('canvas');
  voll.width = MAP.W * S; voll.height = MAP.H * S;
  zeichneKarte(voll.getContext('2d'), T, { S, route: erg, stopps: erg.folge, namen: false });

  const xs = erg.weg.map(z => z % MAP.W), ys = erg.weg.map(z => (z / MAP.W) | 0);
  for (const o of erg.folge) { const p = geoZuRaster(o.lon, o.lat); xs.push(p.x); ys.push(p.y); }
  let x0 = Math.min(...xs) - 14, x1 = Math.max(...xs) + 14;
  let y0 = Math.min(...ys) - 14, y1 = Math.max(...ys) + 10;
  let b = Math.max(96, x1 - x0, (y1 - y0) * 16 / 9);
  b = Math.min(MAP.W, b);
  const h = b * 9 / 16;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sx = Math.max(0, Math.min(MAP.W - b, cx - b / 2));
  const sy = Math.max(0, Math.min(MAP.H - h, cy - h / 2));

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(voll, sx * S, sy * S, b * S, h * S, 0, 0, canvas.width, canvas.height);
}

function zeichneGitter() {
  const liste = ladeRouten();
  const gitter = $('gitter');
  if (!liste.length) {
    gitter.style.display = 'block';
    gitter.innerHTML = `
      <div class="leer">
        <img src="${dudeBild(6).toDataURL()}" alt="">
        <h2>Noch keine Routen</h2>
        <p>Plan deine erste Alpentour und leg sie hier ab.</p>
        <a class="knopf rot" href="planer.html">▲ Zum Routenplaner</a>
      </div>`;
    return;
  }
  gitter.style.display = '';
  gitter.innerHTML = '';
  for (const route of liste) {
    const erg = berechneRoute(T, route.stopps, route);
    const karte = document.createElement('article');
    karte.className = 'pixel-box routen-karte';

    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    zeichneVorschau(c, erg);
    c.title = 'Vorschau als Poster';
    c.addEventListener('click', () => zeigeVorschau(route, erg));
    karte.appendChild(c);

    karte.insertAdjacentHTML('beforeend', `
      <h3>${esc(route.name)}</h3>
      <div class="meta">${(MODI[route.modus] || MODI.wandern).name}${route.rund ? ' · Rundtour' : ''} · gespeichert am ${new Date(route.datum).toLocaleDateString('de-CH')}</div>
      <p class="ziele">${erg.folge.map(s => esc(s.name)).join(' → ')}${route.rund && erg.folge.length ? ' → ' + esc(erg.folge[0].name) : ''}</p>
      <div class="zahlen">
        <span>${fmtZahl(erg.km)} km</span>
        <span>↑ ${fmtZahl(erg.auf)} hm</span>
        <span>▲ ${fmtZahl(erg.maxH)} m</span>
        <span>${erg.tage || 1} ${erg.tage === 1 ? 'Tag' : 'Tage'}</span>
      </div>
      <div class="aktionen">
        <a class="knopf blau" href="planer.html?id=${encodeURIComponent(route.id)}">✎ Bearbeiten</a>
        <button class="knopf rot" data-bild>▼ Bild</button>
        <button class="knopf papier" data-loeschen title="Löschen">✕</button>
      </div>`);

    karte.querySelector('[data-bild]').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        ladeBildHerunter(await erstelleRoutenBild(route, erg), route.name);
        toast('Pixel-Poster wird heruntergeladen!');
      } finally {
        e.target.disabled = false;
      }
    });
    karte.querySelector('[data-loeschen]').addEventListener('click', () => {
      if (!confirm(`„${route.name}" wirklich löschen?`)) return;
      speichereRouten(ladeRouten().filter(r => r.id !== route.id));
      zeichneGitter();
      toast('Route gelöscht.');
    });
    gitter.appendChild(karte);
  }
}

async function zeigeVorschau(route, erg) {
  vorschauCanvas = await erstelleRoutenBild(route, erg);
  vorschauName = route.name;
  $('vorschauBild').src = vorschauCanvas.toDataURL('image/png');
  $('vorschau').classList.add('offen');
}

$('vorschauZu').addEventListener('click', () => $('vorschau').classList.remove('offen'));
$('vorschau').addEventListener('click', e => { if (e.target.id === 'vorschau') $('vorschau').classList.remove('offen'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('vorschau').classList.remove('offen'); });
$('vorschauLaden').addEventListener('click', () => vorschauCanvas && ladeBildHerunter(vorschauCanvas, vorschauName));

zeichneGitter();
