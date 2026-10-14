/* =================== VAN PV · roteiro da van ===================
   Página separada do painel: se algo der errado aqui, o painel continua funcionando.
   - Cada casa é marcada UMA vez no mapa, por uma pessoa (o sistema sugere, a pessoa confere).
   - A melhor ordem das paradas é calculada sozinha (serviço OSRM, com plano B).
   - Os tios tocam "Embarcou"/"Entregue" em cada parada; a próxima fica destacada.
     As marcações vão para o banco (tabela roteiro_marcas) e aparecem nos dois celulares.
     Sem internet, ficam guardadas no aparelho e são enviadas quando o sinal voltar.
   - Mapa: satélite com nomes de ruas (padrão) ou mapa de ruas, botão "Onde estou",
     "Próxima parada", "Rota inteira" e "Ampliar". */

/* ---------- CONFIGURAÇÃO ----------
   Para pegar as coordenadas: Google Maps no computador → botão direito em cima do portão →
   clique nos números do topo do menu (eles são copiados) → cole entre as aspas.
   Formato aceito: '-23.12345, -46.12345'. Qualquer outra coisa conta como "não configurado". */
const COORD_SAIDA = '-23.5398781, -46.9054604';  /* APROXIMADO: ponto da rua (CEP 06604-280), ajustar para o portão do nº 86 */
const COORD_CHEGADA = '-23.5456186, -46.7715782'; /* Fundação Bradesco, Cidade de Deus */
const NOME_SAIDA = 'Garagem · Vila Santa Rosa, Jandira';
const NOME_CHEGADA = 'Fundação Bradesco · Cidade de Deus';
const MIN_POR_PARADA = 2;  /* minutos parados em cada casa (para a estimativa de horário) */
/* Região da van: Jandira, Barueri, Carapicuíba, Itapevi, Cotia, Embu das Artes, Taboão e Osasco */
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
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
let tt; function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200); }
/* Link tel: para ligar direto do celular */
function telLink(tel) {
  let n = soDigitos(tel);
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return /^55\d{10,11}$/.test(n) ? 'tel:+' + n : (n ? 'tel:' + n : '');
}
/* Lê "-23.12345, -46.12345" (do jeito que o Google Maps copia).
   Vazio, "xxxx" ou texto contam como "não configurado" (nunca vira um ponto inventado). */
function lerCoordenadas(txt) {
  const m = String(txt || '').match(/^\s*(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : { lat: null, lng: null };
}
const PARTIDA = { nome: NOME_SAIDA, curto: 'garagem', icone: '🚐', ...lerCoordenadas(COORD_SAIDA) };
const CHEGADA = { nome: NOME_CHEGADA, curto: 'escola', icone: '🏫', ...lerCoordenadas(COORD_CHEGADA) };

/* ---------- fundo do mapa ----------
   "Satélite": fotos de satélite da Esri com os nomes de ruas e lugares por cima (sem chave, sem cadastro).
   "Ruas": o mapa do OpenStreetMap (no visual escuro, as cores são invertidas pelo visual.css).
   O OpenStreetMap exige saber de qual site vem cada pedaço do mapa (o "Referer"):
   o referrerPolicy abaixo garante que essa informação vá junto. */
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OPC_OSM = { maxZoom: 19, className: 'tiles-ruas', referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' };
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const SAT = ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_RUAS = ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
const SAT_NOMES = ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const OPC_SAT = { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics' };
const OPC_NOMES = { maxZoom: 20, maxNativeZoom: 19 };
const ABERTO_DO_COMPUTADOR = location.protocol === 'file:';
const MSG_ARQUIVO = 'Esta página foi aberta direto do arquivo no computador (o endereço começa com file://). Assim o mapa fica bloqueado. Abra o site publicado, pelo endereço que começa com https://.';

/* ---------- textos que mudam na ida e na volta ---------- */
const TXT = {
  ida: { ok: 'Embarcou', falta: 'Faltou hoje' },
  volta: { ok: 'Entregue', falta: 'Não voltou na van' }
};

/* ---------- escolhas lembradas neste aparelho ---------- */
function lerPref(chave, padrao, validos) { try { const v = localStorage.getItem(chave); return validos.includes(v) ? v : padrao; } catch (e) { return padrao; } }
function guardarPref(chave, v) { try { localStorage.setItem(chave, v); } catch (e) { /* sem armazenamento */ } }
let turma = lerPref('van-rt-turma', 'Manhã', ['Manhã', 'Tarde']);
let sentido = lerPref('van-rt-sentido', 'ida', ['ida', 'volta']);
let contratos = [], temSaude = true, mapa = null, camadas = null, ultimaRota = null, vezCalculo = 0, usuarioId = null;
let marcadorProx = null, limitesRota = null;

/* Põe o fundo escolhido no mapa e o botão "Satélite / Ruas" no canto (a escolha fica guardada no aparelho) */
function fundoDoMapa(m) {
  const fundos = {
    satelite: L.layerGroup([L.tileLayer(SAT, OPC_SAT), L.tileLayer(SAT_RUAS, OPC_NOMES), L.tileLayer(SAT_NOMES, OPC_NOMES)]),
    ruas: L.tileLayer(OSM, OPC_OSM)
  };
  let atual = lerPref('van-rt-fundo', 'satelite', ['satelite', 'ruas']);
  fundos[atual].addTo(m);
  const ctl = L.control({ position: 'topright' });
  ctl.onAdd = () => {
    const div = L.DomUtil.create('div', 'mapa-fundo');
    div.innerHTML = '<button type="button" data-fundo="satelite">Satélite</button><button type="button" data-fundo="ruas">Ruas</button>';
    L.DomEvent.disableClickPropagation(div);
    const marcar = () => div.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.fundo === atual));
    div.addEventListener('click', e => {
      const b = e.target.closest('button[data-fundo]'); if (!b || b.dataset.fundo === atual) return;
      m.removeLayer(fundos[atual]); atual = b.dataset.fundo; fundos[atual].addTo(m);
      guardarPref('van-rt-fundo', atual); marcar();
    });
    marcar();
    return div;
  };
  ctl.addTo(m);
}

/* ---------- gaveta do aparelho (localStorage) ---------- */
function lerJSON(k, padrao) { try { return JSON.parse(localStorage.getItem(k) || 'null') || padrao; } catch (e) { return padrao; } }
function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
function chavesGuardadas(prefixo) { try { return Object.keys(localStorage).filter(k => k.startsWith(prefixo)); } catch (e) { return []; } }

/* ---------- marcações do dia ("Embarcou", "Faltou") ----------
   O banco é quem manda; o aparelho guarda uma cópia (para mostrar na hora)
   e uma fila do que ainda não conseguiu enviar (para quando o sinal cair). */
const sufixoDia = () => hojeISO() + '-' + turma + '-' + sentido;
const chaveMarcas = () => 'van-marcas-' + sufixoDia();
const chavePend = () => 'van-pend-' + sufixoDia();
const lerMarcas = () => lerJSON(chaveMarcas(), {});
const salvarMarcas = m => gravarJSON(chaveMarcas(), m);
const lerPendentes = () => lerJSON(chavePend(), {});   /* { parada: {s, h} } ou { parada: null } (= desfazer) */
const salvarPendentes = p => gravarJSON(chavePend(), p);
let semBancoMarcas = false; /* true se a tabela roteiro_marcas ainda não existe: segue só no aparelho */
const tabelaFalta = e => /roteiro_marcas|does not exist|schema cache|relation/i.test((e && e.message) || '');

function limparGuardadosAntigos() {
  const hoje = 'van-marcas-' + hojeISO();
  chavesGuardadas('van-marcas-').filter(k => !k.startsWith(hoje)).forEach(k => localStorage.removeItem(k));
  /* Rotas guardadas no formato antigo levavam nomes e saúde das crianças: apaga */
  chavesGuardadas('van-rota-').forEach(k => {
    const g = lerJSON(k, null);
    if (!g || !g.rota || !Array.isArray(g.rota.ordem) || g.rota.ordem.some(x => typeof x !== 'string')) localStorage.removeItem(k);
  });
}
const chaveParada = p => p.criancas.map(c => c.id).sort().join('+');
const nomesParada = p => p.criancas.map(c => c.crianca).join(' + ');
function hojeExtenso() { const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); }

/* Busca no banco as marcações de hoje desta turma/sentido (e respeita o que ainda está na fila) */
async function baixarMarcas() {
  if (!sb || semBancoMarcas) return;
  const { data, error } = await sb.from('roteiro_marcas').select('parada, situacao, hora').eq('dia', hojeISO()).eq('turma', turma).eq('sentido', sentido);
  if (error) { if (tabelaFalta(error)) semBancoMarcas = true; return; } /* sem internet: fica com a cópia do aparelho */
  const m = {};
  data.forEach(x => { m[x.parada] = { s: x.situacao, h: x.hora || '' }; });
  Object.entries(lerPendentes()).forEach(([k, v]) => { if (v) m[k] = v; else delete m[k]; });
  salvarMarcas(m);
}

/* Envia a fila (de qualquer dia/turma/sentido que tenha ficado para trás) */
let enviando = false, enviarDeNovo = false;
async function enviarPendentes() {
  if (!sb || semBancoMarcas) return;
  if (enviando) { enviarDeNovo = true; return; }
  enviando = true;
  try {
    for (const k of chavesGuardadas('van-pend-')) {
      const s = k.slice('van-pend-'.length), dia = s.slice(0, 10), [tur, sen] = s.slice(11).split('-');
      for (const [parada, v] of Object.entries(lerJSON(k, {}))) {
        const onde = { dia, turma: tur, sentido: sen, parada };
        const r = v
          ? await sb.from('roteiro_marcas').upsert({ ...onde, situacao: v.s, hora: v.h, marcado_por: usuarioId, marcado_em: new Date().toISOString() })
          : await sb.from('roteiro_marcas').delete().match(onde);
        if (r.error) { if (tabelaFalta(r.error)) semBancoMarcas = true; return; } /* sem sinal: tenta de novo depois */
        const atual = lerJSON(k, {});
        if (JSON.stringify(atual[parada]) === JSON.stringify(v)) delete atual[parada]; /* só tira da fila se ninguém mexeu de novo */
        if (Object.keys(atual).length) gravarJSON(k, atual); else localStorage.removeItem(k);
      }
    }
  } finally {
    enviando = false;
    if (enviarDeNovo) { enviarDeNovo = false; enviarPendentes(); }
  }
}

/* Mantém os dois celulares iguais: tempo real + conferência a cada minuto */
let canal = null, tRecarga = null;
async function atualizarDoBanco() { await baixarMarcas(); if (ultimaRota) desenhar(ultimaRota, false); }
async function sincronizar() {
  if ($('conteudo').hidden) return;
  await enviarPendentes();
  await atualizarDoBanco();
}
function ouvirMarcas() {
  if (!sb || semBancoMarcas || canal) return;
  try {
    canal = sb.channel('roteiro-marcas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roteiro_marcas' }, () => {
        clearTimeout(tRecarga); tRecarga = setTimeout(atualizarDoBanco, 400);
      })
      .subscribe();
  } catch (e) { canal = null; /* sem tempo real: a conferência a cada minuto continua valendo */ }
}
addEventListener('online', sincronizar);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
setInterval(sincronizar, 60000);

/* ---------- início: confere o login (o mesmo do painel) ---------- */
function avisar(html) { const a = $('aviso-login'); a.innerHTML = html; a.hidden = false; }
function marcarEscolhas() {
  document.querySelectorAll('.seg-btn[data-turma]').forEach(b => b.classList.toggle('on', b.dataset.turma === turma));
  document.querySelectorAll('.seg-btn[data-sentido]').forEach(b => b.classList.toggle('on', b.dataset.sentido === sentido));
}
async function iniciar() {
  $('rt-data').textContent = hojeExtenso();
  limparGuardadosAntigos();
  marcarEscolhas();
  const avisoArquivo = ABERTO_DO_COMPUTADOR ? esc(MSG_ARQUIVO) + '<br><br>' : '';
  if (!sb || !window.L) { avisar(avisoArquivo + 'Não consegui carregar o sistema. Confira a internet e abra a página de novo.'); return; }
  const { data } = await sb.auth.getSession();
  const user = data.session && data.session.user;
  if (!user) { avisar(avisoArquivo + 'Você não está logado neste celular. <a href="index.html">Entre no painel</a> e depois volte para o roteiro.'); return; }
  const { data: acesso, error } = await sb.from('usuarios_painel').select('id').eq('id', user.id).maybeSingle();
  if (error || !acesso) { avisar('Este login não tem acesso ao roteiro.'); return; }
  usuarioId = user.id;
  $('conteudo').hidden = false;
  carregarSaida();
  await enviarPendentes();
  await carregar();
  ouvirMarcas();
}

/* ---------- dados: só contratos ASSINADOS entram no roteiro ---------- */
const SEL_BASE = 'id, turma, endereco, bairro, lat, lng, responsavel:responsaveis!responsavel_id(nome, telefone)';
async function carregar() {
  let r = await sb.from('contratos').select(SEL_BASE + ', crianca:criancas!crianca_id(nome, alergias, saude, autorizados, desce_sozinho)').eq('status', 'assinado');
  if (r.error && /alergias|saude|autorizados|desce_sozinho/i.test(r.error.message)) {
    temSaude = false; /* banco ainda sem a ficha de saúde: segue sem esses avisos */
    r = await sb.from('contratos').select(SEL_BASE + ', crianca:criancas!crianca_id(nome)').eq('status', 'assinado');
  }
  if (r.error) {
    mostrarAlertas([{ erro: true, texto: /lat|lng/i.test(r.error.message) ? 'O banco ainda não tem as colunas do roteiro. Rode o SQL do roteiro no Supabase.' : 'Erro ao carregar: ' + r.error.message }]);
    return;
  }
  contratos = r.data.map(x => {
    const k = x.crianca || {}, resp = x.responsavel || {};
    return {
      id: x.id, turma: x.turma, endereco: x.endereco || '', bairro: x.bairro || '', lat: x.lat, lng: x.lng,
      crianca: k.nome || '', alergias: k.alergias || '', saude: k.saude || '', autorizados: k.autorizados || '', desceSozinho: !!k.desce_sozinho,
      resp: resp.nome || '', tel: resp.telefone || ''
    };
  });
  await baixarMarcas();
  await calcular();
}

function mostrarAlertas(lista) {
  const todos = (ABERTO_DO_COMPUTADOR ? [{ erro: true, texto: MSG_ARQUIVO }] : []).concat(lista);
  $('rt-alertas').innerHTML = todos.map(a => `<div class="alerta${a.erro ? ' erro' : ''}">${esc(a.texto)}</div>`).join('');
}
function limparRota() {
  ultimaRota = null; marcadorProx = null; limitesRota = null;
  $('rt-resumo').hidden = true; $('rt-mapa-caixa').hidden = true; $('rt-h2').hidden = true;
  $('rt-lista').innerHTML = '';
  if (camadas) camadas.clearLayers();
}

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

/* ---------- rota guardada no aparelho (plano B) ----------
   Guarda só a ORDEM das paradas (códigos), nunca nomes, saúde ou telefones.
   Na hora de usar, remonta com os dados que acabaram de vir do banco. */
function rotaParaGuardar(rota) {
  const ult = rota.ordem.length - 1;
  return { ...rota, ordem: rota.ordem.map((p, i) => i === 0 ? '@ini' : i === ult ? '@fim' : chaveParada(p)) };
}
function restaurarRota(leve, ini, paradas, fim) {
  if (!leve || !Array.isArray(leve.ordem)) return null;
  const porChave = new Map(paradas.map(p => [chaveParada(p), p]));
  const ordem = leve.ordem.map(k => k === '@ini' ? ini : k === '@fim' ? fim : porChave.get(k));
  return ordem.some(x => !x) ? null : { ...leve, ordem };
}

/* ---------- cálculo da rota ---------- */
async function calcular() {
  const vez = ++vezCalculo;
  const [ini, fim] = sentido === 'ida' ? [PARTIDA, CHEGADA] : [CHEGADA, PARTIDA];
  const daTurma = contratos.filter(c => c.turma === turma);
  const comPonto = daTurma.filter(temPonto), semPonto = daTurma.filter(c => !temPonto(c));
  renderFaltam(semPonto);
  const alertas = [];
  if (semBancoMarcas) alertas.push({ texto: 'As marcações de "Embarcou/Entregue" estão ficando só neste celular: falta criar a tabela roteiro_marcas no banco.' });
  if (semPonto.length) alertas.push({ texto: `${semPonto.length === 1 ? '1 criança ainda não está' : semPonto.length + ' crianças ainda não estão'} no roteiro: falta marcar a casa no mapa (veja no fim da página).` });

  /* Trava: saída e chegada precisam existir e cair dentro da região da van */
  const faltaConfig = [PARTIDA, CHEGADA].some(p => !temPonto(p));
  const foraRegiao = [PARTIDA, CHEGADA].some(p => temPonto(p) && !naRegiao(p));
  if (faltaConfig || foraRegiao) {
    alertas.unshift({ erro: true, texto: faltaConfig
      ? 'Falta configurar o ponto de saída (garagem) e o de chegada (escola) no arquivo roteiro.js. Sem eles, a rota não pode ser calculada.'
      : 'O ponto de saída ou de chegada configurado no roteiro.js está fora da região da van. Confira se os números foram colados na ordem certa, com o sinal de menos (-) na frente.' });
    mostrarAlertas(alertas); limparRota(); return;
  }
  if (!comPonto.length) {
    alertas.push({ texto: `Nenhuma criança da turma da ${turma.toLowerCase()} tem a casa marcada no mapa ainda.` });
    mostrarAlertas(alertas); limparRota(); return;
  }

  const paradas = agrupar(comPonto);
  const chave = 'van-rota-' + turma + '-' + sentido;
  const assinatura = comPonto.map(c => c.id + '@' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5)).sort().join(';') + '|' + [ini, fim].map(p => p.lat + ',' + p.lng).join(';');
  $('rt-calcular').disabled = true;
  mostrarAlertas(alertas.concat([{ texto: 'Calculando a melhor ordem das paradas…' }]));
  let rota;
  try {
    rota = await rotaOSRM(ini, paradas, fim);
    gravarJSON(chave, { assinatura, rota: rotaParaGuardar(rota) });
  } catch (e) {
    const guardada = lerJSON(chave, null);
    const restaurada = guardada && guardada.assinatura === assinatura ? restaurarRota(guardada.rota, ini, paradas, fim) : null;
    if (restaurada) {
      rota = restaurada;
      alertas.push({ texto: 'O serviço de rotas não respondeu agora. Mostrando a última rota calculada com estas mesmas crianças.' });
    } else {
      rota = rotaLocal(ini, paradas, fim);
      alertas.push({ texto: 'Sem resposta do serviço de rotas: a ordem abaixo é aproximada (em linha reta) e sem horários. Confira antes de sair e tente de novo em "Mais opções".' });
    }
  }
  $('rt-calcular').disabled = false;
  if (vez !== vezCalculo) return; /* trocou de turma/sentido no meio do cálculo */
  mostrarAlertas(alertas);
  ultimaRota = rota;
  desenhar(rota, true);
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
function carregarSaida() { try { $('rt-saida').value = localStorage.getItem(chaveSaida()) || ''; } catch (e) { $('rt-saida').value = ''; } }
function fmtHora(saida, min) {
  if (!saida) return '+' + Math.round(min) + ' min';
  const [h, m] = saida.split(':').map(Number), tot = h * 60 + m + Math.round(min);
  return String(Math.floor(tot / 60) % 24).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0');
}

/* Links do Google Maps em partes: o app aceita até 9 paradas intermediárias por link */
function linksGoogle(ordem) {
  const ll = p => p.lat.toFixed(6) + ',' + p.lng.toFixed(6), ultimo = ordem.length - 1, out = [];
  for (let i = 0; i < ultimo;) {
    const f = Math.min(i + 10, ultimo), meio = ordem.slice(i + 1, f);
    out.push({
      texto: (i === 0 ? 'da ' + ordem[0].curto : 'da parada ' + i) + ' até ' + (f === ultimo ? 'a ' + ordem[ultimo].curto : 'a parada ' + f),
      url: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + ll(ordem[i]) + '&destination=' + ll(ordem[f]) + (meio.length ? '&waypoints=' + meio.map(ll).join('%7C') : '')
    });
    i = f;
  }
  return out;
}

/* ---------- mapa (criado só quando há rota) ---------- */
function garantirMapa() {
  if (mapa) { mapa.invalidateSize(); return; }
  mapa = L.map('rt-mapa', { scrollWheelZoom: false }).setView(CENTRO_REGIAO, 12);
  fundoDoMapa(mapa);
  camadas = L.layerGroup().addTo(mapa);
  botoesDoMapa();
}

/* Botões em cima do mapa: onde estou, próxima parada, rota inteira, ampliar */
function botoesDoMapa() {
  const ctl = L.control({ position: 'bottomleft' });
  ctl.onAdd = () => {
    const div = L.DomUtil.create('div', 'mapa-acoes');
    div.innerHTML = '<button type="button" data-mapa="eu">📍 Onde estou</button><button type="button" data-mapa="prox">Próxima parada</button><button type="button" data-mapa="tudo">Rota inteira</button><button type="button" data-mapa="ampliar">Ampliar</button>';
    L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
    div.addEventListener('click', e => { const b = e.target.closest('button[data-mapa]'); if (b) acaoDoMapa(b.dataset.mapa, b); });
    return div;
  };
  ctl.addTo(mapa);
}
function acaoDoMapa(acao, btn) {
  if (acao === 'eu') { alternarLocalizacao(btn); return; }
  if (acao === 'prox') {
    if (!marcadorProx) { toast('Todas as paradas já foram feitas.'); return; }
    mapa.setView(marcadorProx.getLatLng(), Math.max(mapa.getZoom(), 17)); marcadorProx.openPopup();
    return;
  }
  if (acao === 'tudo') { if (limitesRota) mapa.fitBounds(limitesRota.pad(0.1)); return; }
  if (acao === 'ampliar') {
    const grande = $('rt-mapa-caixa').classList.toggle('grande');
    btn.textContent = grande ? 'Reduzir' : 'Ampliar';
    if (grande) mapa.scrollWheelZoom.enable(); else mapa.scrollWheelZoom.disable();
    setTimeout(() => { mapa.invalidateSize(); if (limitesRota) mapa.fitBounds(limitesRota.pad(0.1)); }, 60);
    if (grande) $('rt-mapa-caixa').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- "Onde estou": ponto azul com a posição do celular ----------
   A posição fica só na tela (não vai para o banco). Desliga sozinho quando a página sai da frente,
   para não gastar bateria; é só tocar de novo quando voltar. */
let vigia = null, meuPonto = null, minhaArea = null;
function pararLocalizacao() {
  if (vigia !== null && navigator.geolocation) navigator.geolocation.clearWatch(vigia);
  vigia = null;
  if (meuPonto && mapa) { mapa.removeLayer(meuPonto); mapa.removeLayer(minhaArea); }
  meuPonto = minhaArea = null;
  const b = document.querySelector('[data-mapa="eu"]'); if (b) b.classList.remove('on');
}
function alternarLocalizacao(btn) {
  if (vigia !== null) { pararLocalizacao(); return; }
  if (!navigator.geolocation) { toast('Este aparelho não informa a localização.'); return; }
  btn.classList.add('on'); toast('Procurando sua localização…');
  let primeira = true;
  vigia = navigator.geolocation.watchPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude], prec = Math.min(pos.coords.accuracy || 0, 500);
    if (!meuPonto) {
      minhaArea = L.circle(ll, { radius: prec, color: '#2F80ED', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
      meuPonto = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 }).bindPopup('Você está aqui').addTo(mapa);
    } else { meuPonto.setLatLng(ll); minhaArea.setLatLng(ll).setRadius(prec); }
    if (primeira) { primeira = false; mapa.setView(ll, Math.max(mapa.getZoom(), 16)); }
  }, err => {
    toast(err.code === 1 ? 'Sem permissão para ver sua localização. Libere nas configurações do navegador.' : 'Não consegui achar sua localização agora.');
    pararLocalizacao();
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && vigia !== null) pararLocalizacao(); });

/* Texto do balãozinho de cada alfinete */
function popupParada(p, i, fixo) {
  if (fixo) return `<b>${esc(p.nome)}</b>`;
  const c0 = p.criancas[0], end = c0.endereco + (c0.bairro ? ', ' + c0.bairro : '');
  return `<b>${i} · ${esc(nomesParada(p))}</b><br>${esc(end)}<br><a href="https://waze.com/ul?ll=${p.lat},${p.lng}&amp;navigate=yes" target="_blank" rel="noopener">Abrir no Waze</a>`;
}

/* ---------- avisos de saúde e de entrega em cada cartão ---------- */
function avisosCrianca(c, comNome) {
  const quem = comNome ? esc(c.crianca) + ': ' : '';
  let h = '';
  if (c.alergias) h += `<span class="pc-aviso alerg">⚠ ${quem}Alergia: ${esc(c.alergias)}</span>`;
  if (c.saude) h += `<span class="pc-aviso saude">${quem}Saúde: ${esc(c.saude)}</span>`;
  if (sentido === 'volta' && temSaude) {
    const aut = c.autorizados.split('\n').map(s => s.trim()).filter(Boolean).join(' · ');
    h += c.desceSozinho
      ? `<span class="pc-aviso">${quem}Pode descer sem ninguém esperando (autorizado por escrito).</span>`
      : `<span class="pc-aviso entrega">${quem}Entregar só ao responsável${aut ? ' ou a: ' + esc(aut) : ''}.</span>`;
  }
  return h;
}

/* ---------- desenho: resumo, mapa e cartões ---------- */
function desenhar(rota, ajustarMapa) {
  const ordem = rota.ordem, ultimo = ordem.length - 1, saida = $('rt-saida').value, marcas = lerMarcas();
  const chegadaMin = [0]; let t = 0;
  for (let i = 1; i <= ultimo; i++) { t += rota.legs ? rota.legs[i - 1] / 60 : 0; chegadaMin.push(t); if (i < ultimo) t += MIN_POR_PARADA; }
  const hora = i => !rota.legs ? '' : i === 0 ? (saida || '') : fmtHora(saida, chegadaMin[i]);
  let proxima = -1;
  for (let i = 1; i < ultimo; i++) if (!marcas[chaveParada(ordem[i])]) { proxima = i; break; }

  /* Resumo com 3 números */
  const nCriancas = ordem.slice(1, -1).reduce((s, p) => s + p.criancas.length, 0);
  $('rt-numeros').innerHTML = [
    [nCriancas, nCriancas === 1 ? 'criança' : 'crianças'],
    rota.distancia ? [(rota.distancia / 1000).toFixed(1).replace('.', ','), 'km'] : [ultimo - 1, 'paradas'],
    [rota.legs ? '~' + Math.round(t) : '—', 'minutos']
  ].map(([n, l]) => `<div class="rt-num"><b>${esc(n)}</b><span>${l}</span></div>`).join('');

  /* Botão de começar no Google Maps (em partes, se precisar) */
  const partes = linksGoogle(ordem);
  $('rt-comecar').innerHTML = partes.map((l, i) => {
    const titulo = partes.length === 1 ? '▶ Começar no Google Maps' : (i === 0 ? '▶ Começar no Google Maps · parte 1 de ' + partes.length : 'Parte ' + (i + 1) + ' de ' + partes.length);
    return `<a class="btn duas-linhas ${i === 0 ? 'or grande' : 'ghost'}" href="${esc(l.url)}" target="_blank" rel="noopener"><span>${titulo}</span>${partes.length > 1 ? `<small>${esc(l.texto)}</small>` : ''}</a>`;
  }).join('') + (partes.length > 1 ? '<p class="sub">O Google Maps aceita até 9 paradas de cada vez. Quando terminar uma parte, toque na próxima.</p>' : '');

  /* Progresso (+ quantas marcações ainda esperam internet) */
  const total = ultimo - 1, feitas = ordem.slice(1, -1).filter(p => marcas[chaveParada(p)]).length;
  const naFila = Object.keys(lerPendentes()).length;
  $('rt-progresso').textContent = (feitas === total ? 'Todas as paradas feitas! 🎉' : `${feitas} de ${total} paradas feitas` + (proxima > 0 ? ' · próxima: ' + nomesParada(ordem[proxima]) : '')) +
    (naFila ? ` · ⏳ ${naFila} esperando internet` : '');
  $('rt-resumo').hidden = false;

  /* Mapa: amarelo pulsando = próxima, verde = já feita */
  $('rt-mapa-caixa').hidden = false;
  garantirMapa();
  camadas.clearLayers();
  marcadorProx = null;
  /* Linha da rota: contorno escuro + amarelo por cima (aparece bem no satélite e no mapa de ruas) */
  L.polyline(rota.linha, { color: '#0E0E10', weight: 9, opacity: 0.5, interactive: false }).addTo(camadas);
  L.polyline(rota.linha, { color: '#F6C510', weight: 5, opacity: 0.95, dashArray: rota.ruas ? null : '6 8', interactive: false }).addTo(camadas);
  ordem.forEach((p, i) => {
    const fixo = i === 0 || i === ultimo, feita = !fixo && !!marcas[chaveParada(p)];
    const cls = fixo ? 'fixo' : feita ? 'feito' : i === proxima ? 'prox' : '';
    const icon = L.divIcon({ className: '', html: `<div class="pin-num ${cls}">${fixo ? p.icone : i}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const mk = L.marker([p.lat, p.lng], { icon, zIndexOffset: i === proxima ? 1000 : 0 }).bindPopup(popupParada(p, i, fixo)).addTo(camadas);
    if (i === proxima) marcadorProx = mk;
  });
  limitesRota = L.latLngBounds(ordem.map(p => [p.lat, p.lng]));
  if (ajustarMapa) mapa.fitBounds(limitesRota.pad(0.1));

  /* Cartões */
  $('rt-h2').hidden = false;
  $('rt-lista').innerHTML = ordem.map((p, i) => cartao(p, i, { ultimo, hora, marcas, proxima })).join('');
}

function cartao(p, i, { ultimo, hora, marcas, proxima }) {
  const h = hora(i), horaHtml = h ? `<span class="pc-hora">${esc(h)}</span>` : '';
  if (i === 0 || i === ultimo) {
    return `<li class="pc pc-fixa"><span class="pc-num fixo">${p.icone}</span><div class="pc-info">${horaHtml}<b class="pc-nome">${esc(p.nome)}</b><span class="pc-sub">${i === 0 ? 'Saída' : 'Chegada'}</span></div></li>`;
  }
  const chave = chaveParada(p), m = marcas[chave], c0 = p.criancas[0], tel = telLink(c0.tel);
  const estado = m ? (m.s === 'ok' ? 'feita' : 'faltou') : (i === proxima ? 'proxima' : '');
  const end = c0.endereco + (c0.bairro ? ', ' + c0.bairro : '');
  const resps = [...new Set(p.criancas.map(c => 'Responsável: ' + c.resp + (c.tel ? ' · ' + c.tel : '')))].map(esc).join('<br>');
  const avisos = p.criancas.map(c => avisosCrianca(c, p.criancas.length > 1)).join('');
  const selo = m
    ? `<span class="pc-selo ${m.s === 'ok' ? 'ok' : 'falta'}">${m.s === 'ok' ? '✓ ' + TXT[sentido].ok : TXT[sentido].falta}${m.h ? ' · ' + esc(m.h) : ''}</span>`
    : (i === proxima ? '<span class="pc-selo prox">PRÓXIMA</span>' : '');
  const botoes = m
    ? `<div class="pc-botoes"><button class="btn ghost" data-desfazer="${esc(chave)}" type="button">Desfazer</button></div>`
    : `<div class="pc-botoes"><a class="btn ghost" href="https://waze.com/ul?ll=${p.lat},${p.lng}&amp;navigate=yes" target="_blank" rel="noopener">Waze</a>` +
      (tel ? `<a class="btn ghost" href="${tel}">Ligar</a>` : '') +
      `<button class="btn ok" data-marcar="${esc(chave)}" type="button">✓ ${TXT[sentido].ok}</button></div>` +
      /* data-local leva os códigos de TODAS as crianças da parada (irmãos mudam juntos) */
      `<div class="pc-mais"><button class="link" data-faltou="${esc(chave)}" type="button">${TXT[sentido].falta}</button> · <button class="link" data-local="${esc(chave)}" type="button">Corrigir local no mapa</button></div>`;
  return `<li class="pc ${estado}"><span class="pc-num">${i}</span><div class="pc-info">${horaHtml}<b class="pc-nome">${p.criancas.map(c => esc(c.crianca)).join(' + ')}</b><span class="pc-sub">${esc(end)}</span><span class="pc-sub">${resps}</span>${avisos}</div>${selo}${botoes}</li>`;
}

function renderFaltam(lista) {
  $('rt-faltam').hidden = !lista.length;
  $('rt-faltam-qtd').textContent = lista.length ? '(' + lista.length + ')' : '';
  $('rt-faltam-lista').innerHTML = lista.sort((a, b) => porNome(a.crianca, b.crianca)).map(c => {
    const end = c.endereco ? c.endereco + (c.bairro ? ', ' + c.bairro : '') : '';
    return `<li class="pc"><span class="pc-num falta-marcar">!</span><div class="pc-info"><b class="pc-nome">${esc(c.crianca)}</b><span class="pc-sub">${esc(end || 'Sem endereço: preencha pela ficha no painel')}</span></div>` +
      (c.endereco ? `<div class="pc-botoes"><button class="btn" data-local="${esc(c.id)}" type="button">Marcar a casa no mapa</button></div>` : '') + '</li>';
  }).join('');
}

/* ---------- marcar "Embarcou" / "Faltou" ----------
   1º aparece na tela na hora; 2º entra na fila; 3º a fila é enviada ao banco. */
function registrar(chave, valor) {
  const m = lerMarcas();
  if (valor) m[chave] = valor; else delete m[chave];
  salvarMarcas(m);
  if (!semBancoMarcas) { const p = lerPendentes(); p[chave] = valor; salvarPendentes(p); }
}
function marcar(chave, s) {
  registrar(chave, s ? { s, h: horaAgora() } : null);
  if (!ultimaRota) return;
  desenhar(ultimaRota, false);
  if (s) { const prox = document.querySelector('.pc.proxima'); if (prox) prox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  enviarPendentes().then(() => { if (ultimaRota) desenhar(ultimaRota, false); });
}
$('rt-lista').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.marcar) marcar(b.dataset.marcar, 'ok');
  if (b.dataset.faltou) marcar(b.dataset.faltou, 'falta');
  if (b.dataset.desfazer) marcar(b.dataset.desfazer, null);
});

/* ---------- botões da página ---------- */
async function trocouEscolha() { marcarEscolhas(); carregarSaida(); await baixarMarcas(); calcular(); }
document.querySelectorAll('.seg-btn[data-turma]').forEach(b => b.addEventListener('click', () => {
  if (turma === b.dataset.turma) return;
  turma = b.dataset.turma; guardarPref('van-rt-turma', turma); trocouEscolha();
}));
document.querySelectorAll('.seg-btn[data-sentido]').forEach(b => b.addEventListener('click', () => {
  if (sentido === b.dataset.sentido) return;
  sentido = b.dataset.sentido; guardarPref('van-rt-sentido', sentido); trocouEscolha();
}));
$('rt-saida').addEventListener('change', () => { guardarPref(chaveSaida(), $('rt-saida').value); if (ultimaRota) desenhar(ultimaRota, false); });
$('rt-calcular').addEventListener('click', calcular);
$('rt-imprimir').addEventListener('click', () => window.print());
$('rt-recomecar').addEventListener('click', () => {
  if (!confirm('Desmarcar todas as paradas desta rota de hoje? Isso vale para os celulares de toda a equipe.')) return;
  Object.keys(lerMarcas()).forEach(k => registrar(k, null));
  if (ultimaRota) desenhar(ultimaRota, false);
  enviarPendentes().then(() => { if (ultimaRota) desenhar(ultimaRota, false); });
});
document.addEventListener('click', e => { const b = e.target.closest('[data-local]'); if (b) abrirLocal(b.dataset.local); });

/* ---------- marcar a casa no mapa (feito uma vez por criança) ----------
   Abre no satélite com zoom bem perto: fica fácil pôr o alfinete no portão certo. */
let mapaLocal = null, alfinete = null, localAtual = null, localIds = [];
function fecharLocal() { $('modal-local').hidden = true; document.body.classList.remove('travado'); localAtual = null; localIds = []; }
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
/* ids = um código ou vários separados por "+" (irmãos da mesma parada) */
async function abrirLocal(ids) {
  const lista = String(ids || '').split('+').filter(Boolean);
  const c = contratos.find(x => x.id === lista[0]); if (!c) return;
  localIds = lista; localAtual = c;
  const nomes = lista.map(id => (contratos.find(x => x.id === id) || {}).crianca).filter(Boolean).join(' + ');
  $('local-sub').textContent = nomes + ' · ' + c.endereco + (c.bairro ? ', ' + c.bairro : '');
  $('local-erro').textContent = '';
  $('local-aviso').textContent = 'Procurando o endereço…';
  $('local-salvar').disabled = true;
  $('modal-local').hidden = false; document.body.classList.add('travado');
  if (!mapaLocal) {
    mapaLocal = L.map('local-mapa').setView(CENTRO_REGIAO, 12);
    fundoDoMapa(mapaLocal);
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
  mapaLocal.setView([p.lat, p.lng], pos ? 18 : 12);
  $('local-aviso').textContent =
    origem === 'salvo' ? 'Este é o local marcado. Se estiver errado, arraste o alfinete até a porta da casa (ou toque no lugar certo) e confirme.'
    : origem === 'busca' ? 'Achei este endereço, mas confira: a busca automática às vezes erra o número. Arraste o alfinete até a porta da casa (ou toque no lugar certo) e confirme.'
    : 'Não achei este endereço sozinho. Aproxime o mapa e toque na porta da casa.';
  $('local-salvar').disabled = false;
}
$('local-salvar').addEventListener('click', async () => {
  if (!localAtual || !localIds.length) return;
  const { lat, lng } = alfinete.getLatLng(), btn = $('local-salvar'), ids = localIds.slice();
  btn.disabled = true;
  const { data, error } = await sb.from('contratos').update({ lat, lng }).in('id', ids).select('id');
  btn.disabled = false;
  if (error) { $('local-erro').textContent = /lat|lng/i.test(error.message) ? 'O banco ainda não tem as colunas do roteiro. Rode o SQL do roteiro.' : 'Não consegui salvar: ' + error.message; return; }
  if (!data.length) { $('local-erro').textContent = 'O banco não deixou salvar (falta permissão).'; return; }
  fecharLocal();
  toast(data.length < ids.length ? 'Atenção: só parte das crianças desta parada foi atualizada.' : 'Local confirmado.');
  await carregar();
});

iniciar();