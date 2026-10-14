/* =================== VAN PV · roteiro de embarque ===================
   Página separada do painel: se algo der errado aqui, o painel continua funcionando.
   - Mapa: Leaflet + OpenStreetMap (gratuito, sem chave).
   - Endereço → ponto no mapa: Nominatim (busca do OpenStreetMap). Sempre conferido por uma pessoa.
   - Melhor ordem das paradas: OSRM (serviço público de rotas). Se ele falhar, há plano B.
   - Navegação: Google Maps (em trechos de até 9 paradas) e Waze (uma parada por vez). */

/* ---------- PREENCHER: pontos fixos ----------
   1. No computador, abra o Google Maps.
   2. Clique com o botão direito em cima do portão (da garagem ou da escola).
   3. Clique nos números que aparecem no topo do menu: eles são copiados.
   4. Cole entre as aspas abaixo, do jeito que vieram (dois números separados por vírgula). */
const COORD_SAIDA = '';    /* portão da garagem em Jandira */
const COORD_CHEGADA = '';  /* portão da Fundação Bradesco, Cidade de Deus */
const NOME_SAIDA = 'Saída · Jandira (Fátima)';
const NOME_CHEGADA = 'Fundação Bradesco · Cidade de Deus, Osasco';
const MIN_POR_PARADA = 2;  /* minutos parados em cada casa (entra na estimativa de horário) */
/* Região da van (Jandira, Barueri, Carapicuíba, Itapevi, Cotia, Embu das Artes, Taboão e Osasco).
   Os endereços são procurados só aqui dentro, e os pontos fixos precisam estar aqui dentro. */
const REGIAO = { oeste: -47.05, norte: -23.42, leste: -46.70, sul: -23.75 };
const CENTRO_REGIAO = [-23.56, -46.86];

/* ---------- conexão e ajudantes ---------- */
const CFG = window.VAN_CONFIG || {};
const sb = (window.supabase && CFG.supabaseUrl && CFG.supabaseKey) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const soDigitos = s => (s || '').replace(/\D/g, '');
const temPonto = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const naRegiao = p => temPonto(p) && p.lat <= REGIAO.norte && p.lat >= REGIAO.sul && p.lng >= REGIAO.oeste && p.lng <= REGIAO.leste;
const porNome = (a, b) => (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' });
const espera = ms => new Promise(r => setTimeout(r, ms));
let tt; function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200); }

/* Lê "-23.12345, -46.12345" (do jeito que o Google Maps copia) */
function lerCoordenadas(txt) {
  const n = String(txt || '').match(/-?\d+(?:\.\d+)?/g);
  return n && n.length >= 2 ? { lat: Number(n[0]), lng: Number(n[1]) } : { lat: null, lng: null };
}
const PARTIDA = { nome: NOME_SAIDA, ...lerCoordenadas(COORD_SAIDA) };
const CHEGADA = { nome: NOME_CHEGADA, ...lerCoordenadas(COORD_CHEGADA) };

/* ---------- fundo do mapa (OpenStreetMap) ----------
   O OpenStreetMap exige saber de qual site vem cada pedaço do mapa (o "Referer", uma espécie de crachá).
   Sem ele, responde com os quadrados "Access blocked". O referrerPolicy abaixo garante que o crachá vá junto.
   Aberta direto do arquivo do computador (file://), a página não tem site para mostrar e o bloqueio continua. */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OPC_TILES = { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' };
const ABERTO_DO_COMPUTADOR = location.protocol === 'file:';
const MSG_ARQUIVO = 'Esta página foi aberta direto do arquivo no computador (o endereço começa com file://). Assim o fundo do mapa fica bloqueado. Abra o site publicado, pelo endereço que começa com https://.';

/* ---------- estado ---------- */
let contratos = [], turma = 'Manhã', sentido = 'ida', mapa = null, camadas = null, ultimaRota = null, vezCalculo = 0;

/* ---------- início: confere o login (o mesmo do painel) ---------- */
function avisar(html) { const a = $('aviso-login'); a.innerHTML = html; a.hidden = false; }
async function iniciar() {
  const avisoArquivo = ABERTO_DO_COMPUTADOR ? esc(MSG_ARQUIVO) + '<br><br>' : '';
  if (!sb || !window.L) { avisar(avisoArquivo + 'Não consegui carregar o banco ou o mapa. Confira a internet e recarregue a página.'); return; }
  const { data } = await sb.auth.getSession();
  const user = data.session && data.session.user;
  if (!user) { avisar(avisoArquivo + 'Você não está logado neste aparelho. <a href="index.html">Entre no painel</a> e depois volte para o roteiro.'); return; }
  const { data: acesso, error } = await sb.from('usuarios_painel').select('id').eq('id', user.id).maybeSingle();
  if (error || !acesso) { avisar('Este login não tem acesso ao roteiro.'); return; }
  $('conteudo').hidden = false;
  mapa = L.map('rot-mapa', { scrollWheelZoom: false }).setView(CENTRO_REGIAO, 12);
  L.tileLayer(TILES, OPC_TILES).addTo(mapa);
  camadas = L.layerGroup().addTo(mapa);
  carregarSaida();
  await carregar();
}

/* ---------- dados: só contratos ASSINADOS entram no roteiro ---------- */
async function carregar() {
  const { data, error } = await sb.from('contratos')
    .select('id, turma, endereco, bairro, lat, lng, crianca:criancas!crianca_id(nome), responsavel:responsaveis!responsavel_id(nome, telefone)')
    .eq('status', 'assinado');
  if (error) {
    mostrarAlertas([{ erro: true, texto: /lat|lng/i.test(error.message) ? 'O banco ainda não tem as colunas do roteiro. Rode o SQL do roteiro no Supabase.' : 'Erro ao carregar: ' + error.message }]);
    return;
  }
  contratos = data.map(r => ({
    id: r.id, turma: r.turma, endereco: r.endereco || '', bairro: r.bairro || '', lat: r.lat, lng: r.lng,
    crianca: (r.crianca && r.crianca.nome) || '', resp: (r.responsavel && r.responsavel.nome) || '', tel: (r.responsavel && r.responsavel.telefone) || ''
  }));
  await calcular();
}

function mostrarAlertas(lista) {
  const todos = (ABERTO_DO_COMPUTADOR ? [{ erro: true, texto: MSG_ARQUIVO }] : []).concat(lista);
  $('rot-alertas').innerHTML = todos.map(a => `<div class="alerta${a.erro ? ' erro' : ''}">${esc(a.texto)}</div>`).join('');
}
function limparRota() { camadas.clearLayers(); $('rot-lista').innerHTML = ''; $('rot-trechos').innerHTML = ''; $('rot-resumo').textContent = ''; ultimaRota = null; }

/* Irmãos no mesmo endereço viram uma parada só */
function agrupar(lista) {
  const grupos = new Map();
  lista.forEach(c => {
    const k = c.lat.toFixed(5) + ',' + c.lng.toFixed(5);
    if (!grupos.has(k)) grupos.set(k, { lat: c.lat, lng: c.lng, criancas: [] });
    grupos.get(k).criancas.push(c);
  });
  return [...grupos.values()];
}
function lerGuardada(chave) { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (e) { return null; } }

/* ---------- cálculo da rota ---------- */
async function calcular() {
  const vez = ++vezCalculo;
  const [ini, fim] = sentido === 'ida' ? [PARTIDA, CHEGADA] : [CHEGADA, PARTIDA];
  $('rot-titulo').textContent = 'Turma da ' + turma.toLowerCase() + ' · ' + (sentido === 'ida' ? 'ida' : 'volta');
  $('rot-sub').textContent = ini.nome + ' → ' + fim.nome;
  const daTurma = contratos.filter(c => c.turma === turma);
  const comPonto = daTurma.filter(temPonto), semPonto = daTurma.filter(c => !temPonto(c));
  renderSemLocal(semPonto);
  const alertas = [];
  if (semPonto.length) alertas.push({ texto: `Atenção: ${semPonto.length} criança(s) desta turma ainda NÃO estão no roteiro, porque o ponto de embarque não foi confirmado. A lista está no fim da página.` });

  /* Trava: saída e chegada precisam existir e cair dentro da região da van */
  const faltando = [], fora = [];
  [[PARTIDA, 'da saída (COORD_SAIDA)'], [CHEGADA, 'da chegada (COORD_CHEGADA)']].forEach(([p, nome]) => {
    if (!temPonto(p)) faltando.push(nome); else if (!naRegiao(p)) fora.push(nome);
  });
  if (faltando.length || fora.length) {
    if (fora.length) alertas.unshift({ erro: true, texto: 'As coordenadas ' + fora.join(' e ') + ' caem fora da região da van. Confira se colou os dois números do Google Maps na ordem em que vieram, com o sinal de menos (-) na frente de cada um.' });
    if (faltando.length) alertas.unshift({ erro: true, texto: 'Falta colar as coordenadas ' + faltando.join(' e ') + ' no topo do arquivo roteiro.js.' });
    mostrarAlertas(alertas); limparRota(); return;
  }
  if (!comPonto.length) {
    alertas.push({ texto: 'Nenhuma criança desta turma tem ponto confirmado ainda. Use "Localizar no mapa" na lista abaixo.' });
    mostrarAlertas(alertas); limparRota(); return;
  }

  const paradas = agrupar(comPonto);
  const chave = 'van-rota-' + turma + '-' + sentido;
  const assinatura = comPonto.map(c => c.id + '@' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5)).sort().join(';') + '|' + [ini, fim].map(p => p.lat + ',' + p.lng).join(';');
  $('rot-calcular').disabled = true; $('rot-resumo').textContent = 'Calculando a melhor ordem…';
  let rota;
  try {
    rota = await rotaOSRM(ini, paradas, fim);
    try { localStorage.setItem(chave, JSON.stringify({ assinatura, rota })); } catch (e) { /* sem espaço: segue sem guardar */ }
  } catch (e) {
    const guardada = lerGuardada(chave);
    if (guardada && guardada.assinatura === assinatura) {
      rota = guardada.rota;
      alertas.push({ texto: 'O serviço de rotas não respondeu agora. Mostrando a última rota calculada com estas mesmas crianças.' });
    } else {
      rota = rotaLocal(ini, paradas, fim);
      alertas.push({ texto: 'O serviço de rotas não respondeu agora. A ordem abaixo foi calculada em linha reta, sem considerar as ruas: confira antes de sair e toque em "Recalcular rota" mais tarde.' });
    }
  }
  $('rot-calcular').disabled = false;
  if (vez !== vezCalculo) return; /* trocou de turma/sentido no meio do cálculo */
  mostrarAlertas(alertas);
  ultimaRota = rota;
  desenhar(rota);
}

/* Melhor ordem pelas ruas (serviço público OSRM, dados do OpenStreetMap, sem trânsito) */
async function rotaOSRM(ini, paradas, fim) {
  const pts = [ini, ...paradas, fim];
  const coords = pts.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch('https://router.project-osrm.org/trip/v1/driving/' + coords + '?source=first&destination=last&roundtrip=false&overview=full&geometries=geojson', { signal: ctrl.signal, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!r.ok) throw new Error('OSRM ' + r.status);
    const j = await r.json();
    if (j.code !== 'Ok' || !j.trips || !j.trips.length) throw new Error('OSRM ' + j.code);
    const ordem = j.waypoints.map((w, i) => ({ p: pts[i], pos: w.waypoint_index })).sort((a, b) => a.pos - b.pos).map(x => x.p);
    if (ordem[0] !== ini || ordem[ordem.length - 1] !== fim) throw new Error('ordem inesperada');
    const trip = j.trips[0];
    return { ordem, linha: trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]), legs: trip.legs.map(l => l.duration), distancia: trip.distance, ruas: true };
  } finally { clearTimeout(timer); }
}

/* Plano B: ordem calculada aqui mesmo, em linha reta (vizinho mais próximo + desfaz cruzamentos) */
const distKm = (a, b) => {
  const R = 6371, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
function rotaLocal(ini, paradas, fim) {
  const resto = paradas.slice(), caminho = [ini];
  while (resto.length) {
    const atual = caminho[caminho.length - 1];
    let melhor = 0;
    resto.forEach((p, i) => { if (distKm(atual, p) < distKm(atual, resto[melhor])) melhor = i; });
    caminho.push(resto.splice(melhor, 1)[0]);
  }
  caminho.push(fim);
  let melhorou = true;
  while (melhorou) {
    melhorou = false;
    for (let i = 1; i < caminho.length - 2; i++) for (let k = i + 1; k < caminho.length - 1; k++) {
      const antes = distKm(caminho[i - 1], caminho[i]) + distKm(caminho[k], caminho[k + 1]);
      const depois = distKm(caminho[i - 1], caminho[k]) + distKm(caminho[i], caminho[k + 1]);
      if (depois < antes - 1e-9) { caminho.splice(i, k - i + 1, ...caminho.slice(i, k + 1).reverse()); melhorou = true; }
    }
  }
  return { ordem: caminho, linha: caminho.map(p => [p.lat, p.lng]), legs: null, distancia: null, ruas: false };
}

/* ---------- horário de saída (guardado neste aparelho) ---------- */
const chaveSaida = () => 'van-saida-' + turma + '-' + sentido;
function carregarSaida() { $('rot-saida').value = localStorage.getItem(chaveSaida()) || ''; }
function fmtHora(saida, min) {
  if (!saida) return min ? '+' + Math.round(min) + ' min' : 'saída';
  const [h, m] = saida.split(':').map(Number), tot = h * 60 + m + Math.round(min);
  return String(Math.floor(tot / 60) % 24).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0');
}

/* Links do Google Maps em trechos: o app aceita até 9 paradas intermediárias por link */
function linksGoogle(ordem, rotulo) {
  const ll = p => p.lat.toFixed(6) + ',' + p.lng.toFixed(6), out = [];
  for (let i = 0; i < ordem.length - 1;) {
    const f = Math.min(i + 10, ordem.length - 1), meio = ordem.slice(i + 1, f);
    out.push({ de: rotulo(i), ate: rotulo(f), url: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + ll(ordem[i]) + '&destination=' + ll(ordem[f]) + (meio.length ? '&waypoints=' + meio.map(ll).join('%7C') : '') });
    i = f;
  }
  return out;
}

/* ---------- desenho: mapa, resumo, links e lista ---------- */
function desenhar(rota) {
  camadas.clearLayers();
  const ordem = rota.ordem, ultimo = ordem.length - 1, saida = $('rot-saida').value;
  const chegadaMin = [0]; let t = 0;
  for (let i = 1; i <= ultimo; i++) { t += rota.legs ? rota.legs[i - 1] / 60 : 0; chegadaMin.push(t); if (i < ultimo) t += MIN_POR_PARADA; }
  const hora = i => rota.legs ? fmtHora(saida, chegadaMin[i]) : '';
  const rotulo = i => i === 0 ? 'S' : i === ultimo ? 'C' : String(i);

  ordem.forEach((p, i) => {
    const fixo = i === 0 || i === ultimo;
    const icon = L.divIcon({ className: '', html: `<div class="pin-num${fixo ? ' fixo' : ''}">${rotulo(i)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    const nome = fixo ? p.nome : p.criancas.map(c => c.crianca).join(', ');
    L.marker([p.lat, p.lng], { icon }).bindPopup(esc(rotulo(i) + ' · ' + nome)).addTo(camadas);
  });
  L.polyline(rota.linha, { color: '#F4845F', weight: 5, opacity: .85, dashArray: rota.ruas ? null : '6 8' }).addTo(camadas);
  mapa.fitBounds(L.latLngBounds(ordem.map(p => [p.lat, p.lng])).pad(0.1));

  const nCriancas = ordem.slice(1, -1).reduce((s, p) => s + p.criancas.length, 0);
  const partes = [`${ultimo - 1} parada(s)`, `${nCriancas} criança(s)`];
  if (rota.distancia) partes.push((rota.distancia / 1000).toFixed(1).replace('.', ',') + ' km');
  if (rota.legs) partes.push('cerca de ' + Math.round(t) + ' min sem trânsito');
  $('rot-resumo').textContent = partes.join(' · ');

  const links = linksGoogle(ordem, rotulo);
  $('rot-trechos').innerHTML = links.map((l, i) => `<a class="btn or sm" href="${esc(l.url)}" target="_blank" rel="noopener">${links.length > 1 ? `Google Maps · trecho ${i + 1} (${l.de} → ${l.ate})` : 'Abrir rota no Google Maps'}</a>`).join('');

  $('rot-lista').innerHTML = ordem.map((p, i) => {
    const h = hora(i), horaHtml = h ? `<span class="hora">${esc(h)}</span>` : '';
    if (i === 0 || i === ultimo) return `<div class="parada"><span class="num fixo">${rotulo(i)}</span><div><b>${horaHtml}${esc(p.nome)}</b><small>${i === 0 ? 'Saída' : 'Chegada'}</small></div><div></div></div>`;
    const c0 = p.criancas[0], tel = soDigitos(c0.tel);
    const end = c0.endereco + (c0.bairro ? ', ' + c0.bairro : '');
    const resps = [...new Set(p.criancas.map(c => 'Resp.: ' + c.resp + (c.tel ? ' · ' + c.tel : '')))].map(esc).join('<br>');
    return `<div class="parada"><span class="num">${i}</span><div><b>${horaHtml}${p.criancas.map(c => esc(c.crianca)).join(' + ')}</b><small>${esc(end)}</small><small>${resps}</small></div>` +
      `<div class="acoes-parada"><a class="btn ghost sm" href="https://waze.com/ul?ll=${p.lat},${p.lng}&amp;navigate=yes" target="_blank" rel="noopener">Waze</a>` +
      (tel ? `<a class="btn ghost sm" href="tel:${tel}">Ligar</a>` : '') +
      `<button class="btn ghost sm" data-local="${c0.id}" type="button">Ajustar ponto</button></div></div>`;
  }).join('');
}

function renderSemLocal(lista) {
  $('bloco-sem-local').hidden = !lista.length;
  $('sem-local-qtd').textContent = lista.length ? '(' + lista.length + ')' : '';
  $('rot-sem-local').innerHTML = lista.sort((a, b) => porNome(a.crianca, b.crianca)).map(c =>
    `<div class="parada"><span class="num" style="background:var(--warn)">!</span><div><b>${esc(c.crianca)}</b><small>${esc(c.endereco ? c.endereco + (c.bairro ? ', ' + c.bairro : '') : 'Sem endereço cadastrado: preencha pela ficha no painel')}</small></div>` +
    `<div class="acoes-parada">${c.endereco ? `<button class="btn sm" data-local="${c.id}" type="button">Localizar no mapa</button>` : ''}</div></div>`).join('');
}

/* ---------- botões da página ---------- */
document.querySelectorAll('.chip[data-turma]').forEach(ch => ch.addEventListener('click', () => {
  turma = ch.dataset.turma; document.querySelectorAll('.chip[data-turma]').forEach(x => x.classList.toggle('on', x === ch)); carregarSaida(); calcular();
}));
document.querySelectorAll('.chip[data-sentido]').forEach(ch => ch.addEventListener('click', () => {
  sentido = ch.dataset.sentido; document.querySelectorAll('.chip[data-sentido]').forEach(x => x.classList.toggle('on', x === ch)); carregarSaida(); calcular();
}));
$('rot-saida').addEventListener('change', () => { localStorage.setItem(chaveSaida(), $('rot-saida').value); if (ultimaRota) desenhar(ultimaRota); });
$('rot-calcular').addEventListener('click', calcular);
$('rot-imprimir').addEventListener('click', () => window.print());
document.addEventListener('click', e => { const b = e.target.closest('[data-local]'); if (b) abrirLocal(b.dataset.local); });

/* ---------- confirmar o ponto de embarque no mapa ---------- */
let mapaLocal = null, alfinete = null, localAtual = null;
function fecharLocal() { $('modal-local').hidden = true; document.body.classList.remove('travado'); localAtual = null; }
$('local-fechar').addEventListener('click', fecharLocal);
$('modal-local').addEventListener('click', e => { if (e.target === $('modal-local')) fecharLocal(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal-local').hidden) fecharLocal(); });

async function buscarNominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&bounded=1&viewbox=' +
    [REGIAO.oeste, REGIAO.norte, REGIAO.leste, REGIAO.sul].join(',') + '&q=' + encodeURIComponent(q);
  try {
    const r = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' }); if (!r.ok) return null;
    const j = await r.json();
    return j.length ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch (e) { return null; }
}
async function geocodificar(c) {
  const q = [c.endereco, c.bairro].filter(Boolean).join(', ');
  let pos = await buscarNominatim(q);
  if (!pos) { /* tenta sem o número da casa: no Brasil, o OpenStreetMap muitas vezes não tem os números */
    const semNumero = q.replace(/\d+/g, ' ').replace(/\s+/g, ' ').replace(/\s*,\s*(,\s*)+/g, ', ').trim();
    if (semNumero !== q) { await espera(1100); pos = await buscarNominatim(semNumero); }
  }
  return pos;
}
async function abrirLocal(id) {
  const c = contratos.find(x => x.id === id); if (!c) return;
  localAtual = c;
  $('local-sub').textContent = c.crianca + ' · ' + c.endereco + (c.bairro ? ', ' + c.bairro : '');
  $('local-erro').textContent = '';
  $('local-aviso').textContent = 'Procurando o endereço…';
  $('local-salvar').disabled = true;
  $('modal-local').hidden = false; document.body.classList.add('travado');
  if (!mapaLocal) {
    mapaLocal = L.map('local-mapa').setView(CENTRO_REGIAO, 12);
    L.tileLayer(TILES, OPC_TILES).addTo(mapaLocal);
    alfinete = L.marker(CENTRO_REGIAO, { draggable: true }).addTo(mapaLocal);
    mapaLocal.on('click', e => alfinete.setLatLng(e.latlng));
  }
  setTimeout(() => mapaLocal.invalidateSize(), 60);
  let pos = null, origem = 'nada';
  if (temPonto(c)) { pos = { lat: c.lat, lng: c.lng }; origem = 'salvo'; }
  else { pos = await geocodificar(c); if (pos) origem = 'busca'; }
  if (localAtual !== c) return; /* fechou a janela enquanto procurava */
  const p = pos || { lat: CENTRO_REGIAO[0], lng: CENTRO_REGIAO[1] };
  alfinete.setLatLng([p.lat, p.lng]);
  mapaLocal.setView([p.lat, p.lng], pos ? 17 : 12);
  $('local-aviso').textContent =
    origem === 'salvo' ? 'Este é o ponto confirmado. Se estiver errado, arraste o alfinete ou toque no ponto certo do mapa.'
    : origem === 'busca' ? 'Achei este ponto, mas a busca automática pode errar o número da casa. Confira: arraste o alfinete ou toque no portão certo antes de confirmar.'
    : 'Não achei este endereço automaticamente. Aproxime o mapa e toque no portão da casa.';
  $('local-salvar').disabled = false;
}
$('local-salvar').addEventListener('click', async () => {
  if (!localAtual) return;
  const { lat, lng } = alfinete.getLatLng(), btn = $('local-salvar'), id = localAtual.id;
  btn.disabled = true;
  const { data, error } = await sb.from('contratos').update({ lat, lng }).eq('id', id).select('id');
  btn.disabled = false;
  if (error) { $('local-erro').textContent = /lat|lng/i.test(error.message) ? 'O banco ainda não tem as colunas do roteiro. Rode o SQL do roteiro.' : 'Não consegui salvar: ' + error.message; return; }
  if (!data.length) { $('local-erro').textContent = 'O banco não deixou salvar (falta permissão).'; return; }
  fecharLocal(); toast('Ponto confirmado.');
  await carregar();
});

iniciar();