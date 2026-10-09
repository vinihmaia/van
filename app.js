/* =================== CONFIGURAÇÃO (edite aqui) =================== */
const CONFIG = {
  patricia: { nome: 'Tia Patrícia', tel: '+55 11 99692-9358', wa: '5511996929358' }, // CONFIRA
  vitor:    { nome: 'Tio Vitor',    tel: '+55 11 98406-1754', wa: '5511984061754' }, // CONFIRA
  msg:     'Oi! Vi o site da van e quero saber sobre vagas para 2027.',
  msgVale: 'Oi! Quero me matricular na van para a turma de 2027 e usar o vale desconto PV: 20% na primeira mensalidade (válido até 15/01/2027). Segue o cartão.',
  msgVaga: 'Oi! Quero uma vaga na van para 2027. Seguem meus dados:',
  series: ['Pré', '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série do Ensino Médio', '2ª série do Ensino Médio', '3ª série do Ensino Médio'],
  paradas: [
    { nome: 'Terminal Fátima',   lat: -23.5547, lng: -46.9056 }, // Terminal N. Sra. de Fátima, Jandira
    { nome: 'Parque Viana',      lat: -23.5399, lng: -46.8701 }, // Barueri
    { nome: 'Jardim Tupanci',    lat: -23.4945, lng: -46.8701 }, // Barueri
    { nome: 'Engenho Novo',      lat: -23.4892, lng: -46.8897 }, // Barueri
    { nome: 'Fundação Bradesco', lat: -23.5456, lng: -46.7716 }, // Osasco (conferido no Google Maps)
  ],
};

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('[data-wa]').forEach(a => {
  const c = CONFIG[a.dataset.wa];
  const m = a.dataset.msg === 'vale' ? CONFIG.msgVale : CONFIG.msg;
  a.href = `https://wa.me/${c.wa}?text=${encodeURIComponent(m)}`;
});
document.querySelectorAll('[data-tel]').forEach(s => { s.textContent = CONFIG[s.dataset.tel].tel; });
document.getElementById('ano').textContent = new Date().getFullYear();
/* =================== FOLHINHA (mês de hoje → janeiro de 2027) =================== */
const fol = document.getElementById('fol');
if (fol) {
  const hoje = new Date(), meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  document.getElementById('fol-mes').textContent = meses[hoje.getMonth()];
  document.getElementById('fol-ano').textContent = hoje.getFullYear();
  if (hoje >= new Date(2027, 0, 1)) { fol.classList.add('parada'); fol.querySelector('.pg-jan small').textContent = 'a turma começou'; }
}

/* =================== BARRA FIXA E MENU DO CELULAR =================== */
const nav = document.getElementById('nav'), hero = document.getElementById('top'), burger = document.getElementById('burger');
const navScroll = () => nav.classList.toggle('on', scrollY > hero.offsetHeight - 80);
addEventListener('scroll', navScroll, { passive: true }); navScroll();
function menu(on) {
  document.body.classList.toggle('menu-on', on);
  document.querySelectorAll('[data-menu]').forEach(b => b.setAttribute('aria-expanded', on));
  burger.textContent = on ? 'Fechar' : 'Menu';
}
document.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', () => menu(!document.body.classList.contains('menu-on'))));
document.getElementById('sheet-bg').addEventListener('click', () => menu(false));
document.querySelectorAll('#menu a').forEach(a => a.addEventListener('click', () => menu(false)));
addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });

/* =================== MAPA (cinza escuro + rota real) =================== */
async function iniciarMapa() {
  const P = CONFIG.paradas, badge = document.getElementById('kmbadge');
  const map = L.map('mapa', { scrollWheelZoom: false, dragging: !L.Browser.mobile });
  const escuro = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 })
  ]);
  const sat = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
  ]);
  escuro.addTo(map);
  L.control.layers({ 'Mapa escuro': escuro, 'Satélite': sat }).addTo(map);

  let coords = P.map(p => [p.lat, p.lng]);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${P.map(p => p.lng + ',' + p.lat).join(';')}?overview=full&geometries=geojson`;
    const j = await (await fetch(url)).json();
    if (j.code === 'Ok') {
      const rt = j.routes[0];
      coords = rt.geometry.coordinates.map(c => [c[1], c[0]]);
      badge.textContent = `≈ ${(rt.distance / 1000).toFixed(1).replace('.', ',')} km · ${Math.round(rt.duration / 60)} min`;
    } else badge.remove();
  } catch (e) { badge.remove(); }

  L.polyline(coords, { color: '#F4845F', weight: 18, opacity: .12, interactive: false }).addTo(map);
  L.polyline(coords, { color: '#F4845F', weight: 10, opacity: .25, interactive: false }).addTo(map);
  const linha = L.polyline(coords, { color: '#F4845F', weight: 4, opacity: 1, interactive: false }).addTo(map);
  L.polyline(coords, { color: '#FFE4D6', weight: 2, opacity: .9, dashArray: '2 12', className: 'rota-fluxo', interactive: false }).addTo(map);
  map.fitBounds(linha.getBounds(), { padding: [50, 50] });
  P.forEach((p, i) => L.marker([p.lat, p.lng], { keyboard: false, icon: L.divIcon({ className: '', html: `<span class="parada">${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).bindTooltip(p.nome, { permanent: true, direction: 'top', offset: [0, -16], className: 'etq' }).addTo(map));
}
iniciarMapa();

/* =================== VALE DESCONTO (caixa + cartão que gira com a rolagem) =================== */
const vale = document.getElementById('vale'), scene = document.getElementById('scene'), card = document.getElementById('card');
let live = false, hover = false, timer = null, spin = 0, mrx = 0, mry = 0, mmy = 50; const tv0 = performance.now();
function tilt(rx, ry, mx, my) { card.style.setProperty('--rx', rx.toFixed(2) + 'deg'); card.style.setProperty('--ry', ry.toFixed(2) + 'deg'); card.style.setProperty('--mx', mx.toFixed(1) + '%'); card.style.setProperty('--my', my.toFixed(1) + '%'); }
function abrir() { if (vale.classList.contains('open')) return; vale.classList.add('open'); if (reduce) return; clearTimeout(timer); timer = setTimeout(() => { spin = 0; live = true; vale.classList.add('live'); }, 2500); }
function fechar() { clearTimeout(timer); live = false; hover = false; spin = 0; vale.classList.remove('live'); tilt(0, 0, 50, 50); vale.classList.remove('open'); }
scene.addEventListener('click', () => vale.classList.contains('open') ? fechar() : abrir());
scene.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scene.click(); } });
scene.addEventListener('mousemove', e => { if (!live) return; hover = true; const r = scene.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; mrx = -y * 24; mry = x * 36; mmy = 50 + y * 70; });
scene.addEventListener('mouseleave', () => { hover = false; });
(function loop(now) {
  if (live) {
    const r = vale.getBoundingClientRect(), wh = innerHeight;
    const p = Math.min(1, Math.max(0, (wh - r.top) / (wh + r.height))); // 0 = entrando por baixo, .5 = centro da tela, 1 = saindo por cima
    const alvo = (p - .5) * 2 * 180;                                     // -180° … 0° (de frente) … +180°
    spin += (alvo - spin) * .1;                                          // suaviza o giro
    const t = (now - tv0) / 1000;
    const rx = (hover ? mrx : Math.sin(t * .9) * 4) + (p - .5) * -16;
    const ry = spin + (hover ? mry : Math.sin(t * .55) * 8);
    const luz = Math.sin(ry * Math.PI / 180);                            // a luz fica parada, o cartão gira
    tilt(rx, ry, 50 - luz * 40, hover ? mmy : 50 - Math.sin(t * .9) * 20);
  }
  requestAnimationFrame(loop);
})(performance.now());
const io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { vale.classList.add('in'); setTimeout(abrir, reduce ? 0 : 1100); io.disconnect(); } }); }, { threshold: .35 });
io.observe(vale);

/* =================== VALE: desenha o cartão em imagem e envia pelo WhatsApp =================== */
const btnVale = document.getElementById('btn-vale');
function rrPath(x, y, w, h, r) { const p = new Path2D(); if (p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h); return p; }
function carinha(x, px, py, s, dark, yel) {
  const R = (a, b, w, h, r, fill, stroke) => { const p = rrPath(px + a * s, py + b * s, w * s, h * s, r * s); if (fill) { x.fillStyle = fill; x.fill(p); } if (stroke) { x.lineWidth = 3 * s; x.strokeStyle = stroke; x.stroke(p); } };
  R(14, 10, 72, 72, 16, dark); R(22, 18, 56, 26, 7, yel); R(14, 50, 72, 6, 0, '#F4845F');
  R(6, 30, 7, 12, 2.5, dark); R(87, 30, 7, 12, 2.5, dark); R(22, 60, 14, 9, 4.5, yel); R(64, 60, 14, 9, 4.5, yel);
  x.beginPath(); x.moveTo(px + 40 * s, py + 66 * s); x.quadraticCurveTo(px + 50 * s, py + 74 * s, px + 60 * s, py + 66 * s); x.lineWidth = 4 * s; x.lineCap = 'round'; x.strokeStyle = yel; x.stroke();
  R(20, 78, 18, 12, 4, yel, dark); R(62, 78, 18, 12, 4, yel, dark);
}
function placa(x, px, py, size) { x.fillStyle = '#F6C510'; x.fill(rrPath(px, py, size, size, size * 13 / 60)); carinha(x, px + size * 3.5 / 60, py + size * 3.5 / 60, size * 53 / 60 / 100, '#0B0B0B', '#F6C510'); }
async function desenharVale() {
  const k = 4, W = 290 * k, H = 184 * k, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  try { await Promise.all([document.fonts.load('700 40px Inter'), document.fonts.load('600 40px Inter'), document.fonts.load('500 40px Inter')]); } catch (e) {}
  x.save(); x.clip(rrPath(0, 0, W, H, 12 * k));
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#F7E27A'); g.addColorStop(.22, '#E0B93A'); g.addColorStop(.46, '#FAEAA2'); g.addColorStop(.7, '#CFA12A'); g.addColorStop(1, '#F3D86C'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2 * k) { x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(0, y, W, k); x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect(0, y + k, W, k); }
  const sh = x.createLinearGradient(0, H, W, 0); sh.addColorStop(.35, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.45)'); sh.addColorStop(.65, 'rgba(255,255,255,0)'); x.fillStyle = sh; x.fillRect(0, 0, W, H);
  const cg = x.createLinearGradient(22 * k, 48 * k, 64 * k, 80 * k); cg.addColorStop(0, '#EFDB95'); cg.addColorStop(.55, '#B98F2C'); cg.addColorStop(1, '#E9CC72'); x.fillStyle = cg; x.fill(rrPath(22 * k, 48 * k, 42 * k, 32 * k, 7 * k));
  x.strokeStyle = 'rgba(90,60,10,.6)'; x.lineWidth = k; x.stroke(rrPath(22 * k, 48 * k, 42 * k, 32 * k, 7 * k));
  x.beginPath(); x.moveTo(22 * k, 58 * k); x.lineTo(64 * k, 58 * k); x.moveTo(22 * k, 69 * k); x.lineTo(64 * k, 69 * k); x.stroke(); x.stroke(rrPath(35 * k, 56 * k, 16 * k, 15 * k, 3 * k));
  x.lineWidth = 1.6 * k; x.lineCap = 'round'; x.strokeStyle = '#5A4210'; [6, 9, 12].forEach(r => { x.beginPath(); x.arc(75 * k, 64 * k, r * k, -.65, .65); x.stroke(); });
  placa(x, (290 - 18 - 46) * k, 16 * k, 46 * k);
  const T = (t, px, py, font, fill, ls) => { x.font = font; x.fillStyle = fill; if ('letterSpacing' in x) x.letterSpacing = (ls || 0) + 'px'; x.fillText(t, px, py); };
  x.textBaseline = 'alphabetic';
  T('VALE DESCONTO', 22 * k, 29 * k, `600 ${9 * k}px Inter,system-ui,sans-serif`, '#5A4210', 9 * k * .24);
  x.shadowColor = 'rgba(255,255,255,.55)'; x.shadowOffsetY = k; T('20%', 22 * k, 128 * k, `700 ${34 * k}px Inter,system-ui,sans-serif`, '#3A2B06', -34 * k * .03); x.shadowColor = 'transparent'; x.shadowOffsetY = 0;
  const w20 = x.measureText('20%').width;
  T('na primeira mensalidade', 22 * k + w20 + 8 * k, 128 * k, `500 ${11 * k}px Inter,system-ui,sans-serif`, '#5A4210', 0);
  T('TIA PATRÍCIA E TIO VITOR', 22 * k, 166 * k, `600 ${8.5 * k}px Inter,system-ui,sans-serif`, '#5A4210', 8.5 * k * .16);
  x.textAlign = 'right'; T('TURMA 2027', (290 - 22) * k, 166 * k, `600 ${8.5 * k}px Inter,system-ui,sans-serif`, '#5A4210', 8.5 * k * .16); x.textAlign = 'left';
  x.restore();
  return new Promise(res => c.toBlob(res, 'image/png'));
}
async function enviarVale() {
  const txt = CONFIG.msgVale, url = 'https://wa.me/' + CONFIG.patricia.wa + '?text=' + encodeURIComponent(txt);
  btnVale.disabled = true;
  try {
    const blob = await desenharVale();
    const file = new File([blob], 'vale-desconto-pv-2027.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: txt }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { if (e && e.name === 'AbortError') return; }
  finally { btnVale.disabled = false; }
  if (!window.open(url, '_blank')) location.href = url;
}
if (btnVale) btnVale.addEventListener('click', enviarVale);

/* =================== MEDALHA 3D (gira sozinha, com o dedo ou o mouse) =================== */
const selo = document.getElementById('selo'), moeda = document.getElementById('moeda');
if (selo && !reduce) {
  let ry = 0, rx = -8, vy = .35, drag = false, lx = 0, ly = 0;
  selo.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; selo.setPointerCapture(e.pointerId); });
  selo.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; ry += dx * .6; rx = Math.max(-40, Math.min(40, rx - dy * .3)); vy = Math.max(-30, Math.min(30, dx * .6)); });
  const solta = () => { drag = false; };
  selo.addEventListener('pointerup', solta); selo.addEventListener('pointercancel', solta);
  (function giro() { if (!drag) { ry += vy; vy += (.35 - vy) * .02; rx += (-8 - rx) * .03; } moeda.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`; requestAnimationFrame(giro); })();
}

/* =================== FOTOS E CARTÕES (sobem ao entrar na tela) =================== */
if ('IntersectionObserver' in window) {
  const itens = document.querySelectorAll('.rv');
  itens.forEach(e => e.classList.add('esp'));
  const ioR = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); ioR.unobserve(e.target); } }); }, { threshold: .2 });
  itens.forEach(e => ioR.observe(e));
}

/* =================== PRÉ-CADASTRO (vira carta, fecha e abre o WhatsApp) =================== */
const formVaga = document.getElementById('form-vaga'), carta = document.getElementById('carta');
if (formVaga) {
  const selSerie = document.getElementById('serie');
  CONFIG.series.forEach(s => { const o = document.createElement('option'); o.textContent = s; selSerie.appendChild(o); });
  const abrirZap = url => { if (!window.open(url, '_blank')) location.href = url; };
  formVaga.addEventListener('submit', e => {
    e.preventDefault();
    if (carta.classList.contains('enviando')) return;
    const f = new FormData(formVaga), v = k => (f.get(k) || '').toString().trim() || '—';
    const txt = [CONFIG.msgVaga, '', 'Nome: ' + v('nome'), 'Criança: ' + v('crianca'), 'Idade: ' + v('idade'), 'WhatsApp: ' + v('tel'), 'E-mail: ' + v('email'), 'Rua: ' + v('rua'), 'CEP: ' + v('cep'), 'Referência: ' + v('ref'), 'Série: ' + v('serie'), 'Turma: ' + v('turma')].join('\n');
    const url = 'https://wa.me/' + CONFIG.patricia.wa + '?text=' + encodeURIComponent(txt);
    if (reduce) { abrirZap(url); return; }
    carta.classList.add('enviando');
    setTimeout(() => abrirZap(url), 2000);
    setTimeout(() => carta.classList.remove('enviando'), 6000);
  });
  addEventListener('pageshow', () => carta.classList.remove('enviando'));
}