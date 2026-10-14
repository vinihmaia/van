/* =================== VAN PV · documentos da van ===================
   Página separada do painel: se algo der errado aqui, o painel continua funcionando.
   Cada documento tem uma data de vencimento e "quantos dias antes avisar".
   Verde = em dia · amarelo = vence logo · vermelho = vencido.
   "📅 Agenda" põe o vencimento na agenda do celular.
   "✓ Renovei" guarda o histórico e pode lançar o custo em Despesas (função renovar_documento no banco). */
const CFG = window.VAN_CONFIG || {};
const sb = (window.supabase && CFG.supabaseUrl && CFG.supabaseKey) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDia = s => s ? s.split('-').reverse().join('/') : '—';
const fmtBRL = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
let tt; function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 4000); }

/* Tipos sugeridos (use só os que valem para a van de vocês) */
const TIPOS = ['Vistoria do Detran', 'Licenciamento (CRLV)', 'Autorização da prefeitura', 'Seguro', 'CNH do motorista', 'Curso de transporte escolar', 'Aferição do tacógrafo', 'Extintor', 'Outro'];
const MSG_SQL = 'Falta criar a tabela de documentos no banco: rode o SQL dos documentos no Supabase.';
const MSG_SQL_RENOVA = 'Falta a parte nova no banco: rode o SQL do histórico de renovações no Supabase.';
const tabelaFalta = e => /documentos_van|does not exist|schema cache/i.test((e && e.message) || '');
const renovaFalta = e => /documentos_renovacoes|renovar_documento|does not exist|schema cache/i.test((e && e.message) || '');

/* ---------- situação de cada documento ---------- */
const hojeMeioDia = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const diasPara = iso => Math.round((new Date(iso + 'T12:00:00') - hojeMeioDia()) / 86400000);
function situacao(d) {
  const n = diasPara(d.vencimento), aviso = d.avisar_dias || 30;
  if (n < 0) return { cls: 'vencido', n, txt: n === -1 ? 'Venceu ontem' : `Venceu há ${-n} dias` };
  if (n <= aviso) return { cls: 'breve', n, txt: n === 0 ? 'Vence hoje' : n === 1 ? 'Vence amanhã' : `Vence em ${n} dias` };
  return { cls: 'ok', n, txt: 'Em dia' };
}

let docs = [], usuarioNome = '', editando = null, renovando = false;

/* ---------- início: confere o login (o mesmo do painel) ---------- */
function avisar(html) { const a = $('aviso-login'); a.innerHTML = html; a.hidden = false; }
async function iniciar() {
  if (!sb) { avisar('Não consegui carregar o sistema. Confira a internet e abra a página de novo.'); return; }
  const { data } = await sb.auth.getSession();
  const user = data.session && data.session.user;
  if (!user) { avisar('Você não está logado neste aparelho. <a href="index.html">Entre no painel</a> e depois volte aqui.'); return; }
  const { data: acesso, error } = await sb.from('usuarios_painel').select('id').eq('id', user.id).maybeSingle();
  if (error || !acesso) { avisar('Este login não tem acesso aos documentos.'); return; }
  /* Nome de quem atualiza (se o perfil ainda não tiver nome, usa o começo do e-mail) */
  const p = await sb.from('usuarios_painel').select('nome').eq('id', user.id).maybeSingle();
  usuarioNome = (!p.error && p.data && p.data.nome) || (user.email || '').split('@')[0];
  $('conteudo').hidden = false;
  await carregar();
}

async function carregar() {
  const { data, error } = await sb.from('documentos_van').select('*').order('vencimento', { ascending: true });
  if (error) { docs = []; mostrarAlerta(tabelaFalta(error) ? MSG_SQL : 'Erro ao carregar: ' + error.message, true); desenhar(); return; }
  docs = data; mostrarAlerta(''); desenhar();
}
function mostrarAlerta(txt, erro) { $('dc-alertas').innerHTML = txt ? `<div class="alerta${erro ? ' erro' : ''}">${esc(txt)}</div>` : ''; }

/* ---------- desenho ---------- */
function desenhar() {
  const lista = docs.map(d => ({ d, s: situacao(d) })).sort((a, b) => a.s.n - b.s.n);
  const conta = c => lista.filter(x => x.s.cls === c).length;
  $('dc-resumo').innerHTML = [['vencido', conta('vencido'), 'vencidos'], ['breve', conta('breve'), 'vencem logo'], ['ok', conta('ok'), 'em dia']]
    .map(([c, n, l]) => `<div class="dc-num ${c}"><b>${n}</b><span>${l}</span></div>`).join('');
  $('dc-lista').innerHTML = lista.length
    ? lista.map(({ d, s }) => `<li class="dc-item ${s.cls}"><div>` +
        `<b class="dc-tipo">${esc(d.tipo)}</b>` +
        (d.descricao ? `<span class="dc-sub">${esc(d.descricao)}</span>` : '') +
        `<span class="dc-sub">Vencimento: <b>${fmtDia(d.vencimento)}</b>${d.numero ? ' · nº ' + esc(d.numero) : ''} · avisa ${esc(d.avisar_dias)} dias antes</span>` +
        (d.obs ? `<span class="dc-sub">${esc(d.obs)}</span>` : '') +
        (d.atualizado_por_nome ? `<span class="dc-sub">Atualizado por ${esc(d.atualizado_por_nome)}</span>` : '') +
        `</div><span class="dc-quando">${esc(s.txt)}</span><div class="dc-acoes">` +
        (s.cls !== 'ok' ? `<button class="btn ok sm" data-renovar="${esc(d.id)}" type="button">✓ Renovei</button>` : '') +
        `<button class="btn ghost sm" data-editar="${esc(d.id)}" type="button">Editar</button>` +
        `<button class="btn ghost sm" data-agenda="${esc(d.id)}" type="button">📅 Agenda</button></div></li>`).join('')
    : '<li class="dc-vazio">Nenhum documento cadastrado ainda.<br>Toque em "+ Adicionar" e comece pelos que vencem primeiro.</li>';
}

/* ---------- lembrete na agenda do celular ----------
   iPhone/iPad/Mac: baixa um arquivo .ics (o "convite de agenda" que todo calendário entende),
   com dois alarmes: N dias antes e na véspera, às 9h da manhã.
   Android/Windows: abre o Google Agenda já preenchido (lá o alarme é ajustado à mão). */
const ehApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const nomeDoc = d => d.tipo + (d.descricao ? ' · ' + d.descricao : '');
const semTraco = iso => iso.replace(/-/g, '');
const diaSeguinte = iso => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + 1); return x.toLocaleDateString('sv-SE'); };
const textoIcs = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const UTF8 = new TextEncoder();
/* O formato pede linhas de até 75 bytes; o que passar continua na linha de baixo, começando com espaço */
function dobrar(linha) {
  let out = '', tam = 0;
  for (const ch of linha) {
    const b = UTF8.encode(ch).length;
    if (tam + b > 74) { out += '\r\n '; tam = 1; }
    out += ch; tam += b;
  }
  return out;
}
function detalhesAgenda(d) {
  return 'Documento da van. Vencimento: ' + fmtDia(d.vencimento) + '.' + (d.numero ? ' Nº ' + d.numero + '.' : '') +
    '\nDepois de renovar, toque em "✓ Renovei" no painel e ponha a data nova na agenda.\n' + location.origin + location.pathname;
}
function arquivoAgenda(d) {
  const n = Number(d.avisar_dias) || 30;
  const alarme = (horas, txt) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + textoIcs(txt), 'TRIGGER:-PT' + horas + 'H', 'END:VALARM'];
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Van PV//Documentos//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    /* Mesmo documento + mesma data = mesmo código: adicionar de novo não duplica no iPhone */
    'UID:doc-' + d.id + '-' + semTraco(d.vencimento) + '@van-pv',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
    'DTSTART;VALUE=DATE:' + semTraco(d.vencimento),
    'DTEND;VALUE=DATE:' + semTraco(diaSeguinte(d.vencimento)),
    'SUMMARY:' + textoIcs('Vence: ' + nomeDoc(d)),
    'DESCRIPTION:' + textoIcs(detalhesAgenda(d)),
    'TRANSP:TRANSPARENT',
    /* O evento de dia inteiro começa à meia-noite: (dias × 24 − 9) horas antes = 9h da manhã daquele dia */
    ...alarme(n * 24 - 9, nomeDoc(d) + ' vence em ' + n + ' dias'),
    ...alarme(15, nomeDoc(d) + ' vence amanhã'),
    'END:VEVENT', 'END:VCALENDAR'
  ].map(dobrar).join('\r\n') + '\r\n';
}
function linkGoogleAgenda(d) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: 'Vence: ' + nomeDoc(d), dates: semTraco(d.vencimento) + '/' + semTraco(diaSeguinte(d.vencimento)), details: detalhesAgenda(d) });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
function porNaAgenda(d) {
  const n = Number(d.avisar_dias) || 30;
  if (!ehApple) {
    window.open(linkGoogleAgenda(d), '_blank', 'noopener');
    toast('No Google Agenda, antes de salvar, mude a notificação para ' + n + ' dias antes.');
    return;
  }
  const nome = 'vencimento-' + nomeDoc(d).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() + '.ics';
  const url = URL.createObjectURL(new Blob([arquivoAgenda(d)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Toque no arquivo baixado e escolha "Adicionar" à agenda.');
}

/* ---------- histórico de renovações (aparece ao abrir um documento) ---------- */
async function carregarHistorico(d) {
  const caixa = $('doc-historico');
  const { data, error } = await sb.from('documentos_renovacoes')
    .select('vencimento_antigo, vencimento_novo, valor, feito_por_nome')
    .eq('documento_id', d.id).order('feito_em', { ascending: false });
  if (editando !== d) return; /* fechou ou trocou de documento enquanto buscava */
  if (error) { if (!renovaFalta(error)) console.warn('Histórico:', error.message); return; }
  if (!data.length) return;
  caixa.innerHTML = '<b>Renovações anteriores</b><ul>' + data.map(r =>
    `<li>${fmtDia(r.vencimento_antigo)} → ${fmtDia(r.vencimento_novo)}${r.valor ? ' · ' + fmtBRL(r.valor) : ''}${r.feito_por_nome ? ' · ' + esc(r.feito_por_nome) : ''}</li>`).join('') + '</ul>';
  caixa.hidden = false;
}

/* ---------- janela de adicionar / editar / renovar ---------- */
const form = $('form-doc');
form.elements.tipo.innerHTML = TIPOS.map(t => `<option>${esc(t)}</option>`).join('');
/* Garante que um valor antigo exista na lista (para não sumir ao editar) */
function garantirOpcao(select, valor, texto) {
  if (![...select.options].some(o => o.value === String(valor))) { const o = document.createElement('option'); o.value = valor; o.textContent = texto; select.appendChild(o); }
  select.value = String(valor);
}
function abrir(d, renovar) {
  editando = d || null; renovando = !!(d && renovar);
  form.reset();
  const f = form.elements;
  $('doc-titulo').textContent = renovando ? 'Renovar documento' : d ? 'Editar documento' : 'Adicionar documento';
  $('doc-dica').hidden = !renovando;
  $('doc-dica').textContent = renovando ? `Coloque a NOVA data de vencimento do documento renovado. A antiga era ${fmtDia(d.vencimento)}.` : '';
  $('doc-erro').textContent = '';
  $('doc-apagar').hidden = !d || renovando;
  /* Na renovação só aparece o que muda de verdade: data, número, observação e o custo */
  ['tipo', 'descricao', 'avisar_dias'].forEach(n => { f[n].closest('label').hidden = renovando; });
  $('doc-renova').hidden = !renovando;
  f.pago_em.value = hojeISO(); f.pago_em.max = hojeISO();
  $('doc-historico').hidden = true; $('doc-historico').innerHTML = '';
  if (d) {
    garantirOpcao(f.tipo, d.tipo, d.tipo);
    f.descricao.value = d.descricao || '';
    f.numero.value = d.numero || '';
    f.vencimento.value = renovando ? '' : d.vencimento;
    garantirOpcao(f.avisar_dias, d.avisar_dias || 30, (d.avisar_dias || 30) + ' dias');
    f.obs.value = d.obs || '';
    carregarHistorico(d);
  } else {
    f.avisar_dias.value = '30';
  }
  $('modal-doc').hidden = false; document.body.classList.add('travado');
  setTimeout(() => (renovando ? f.vencimento : f.tipo).focus(), 50);
}
function fechar() { $('modal-doc').hidden = true; document.body.classList.remove('travado'); editando = null; renovando = false; }
$('doc-fechar').addEventListener('click', fechar);
$('modal-doc').addEventListener('click', e => { if (e.target === $('modal-doc')) fechar(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal-doc').hidden) fechar(); });
$('dc-novo').addEventListener('click', () => abrir(null, false));

$('dc-lista').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.agenda) { const d = docs.find(x => x.id === b.dataset.agenda); if (d) porNaAgenda(d); return; }
  const id = b.dataset.renovar || b.dataset.editar; if (!id) return;
  const d = docs.find(x => x.id === id); if (d) abrir(d, !!b.dataset.renovar);
});

/* Renovação: a função do banco muda a data, lança a despesa e anota o histórico de uma vez só */
async function salvarRenovacao(f, erro, btn) {
  const temValor = f.custo.value !== '', valor = Math.round(Number(f.custo.value) * 100) / 100;
  if (temValor && !(valor > 0)) { erro.textContent = 'O valor precisa ser maior que zero (ou deixe em branco).'; return; }
  if (temValor && !f.pago_em.value) { erro.textContent = 'Informe quando foi pago.'; return; }
  if (temValor && f.pago_em.value > hojeISO()) { erro.textContent = 'A data do pagamento não pode ser no futuro.'; return; }
  btn.disabled = true;
  const { error } = await sb.rpc('renovar_documento', {
    p_id: editando.id, p_vencimento: f.vencimento.value,
    p_numero: f.numero.value.trim() || null, p_obs: f.obs.value.trim() || null,
    p_valor: temValor ? valor : null, p_pago_em: temValor ? f.pago_em.value : null,
    p_forma: temValor ? (f.forma.value || null) : null, p_nome: usuarioNome || null
  });
  btn.disabled = false;
  if (error) {
    const m = error.message || '';
    erro.textContent = /vencimento_invalido/.test(m) ? 'A nova data precisa ser depois do vencimento antigo.'
      : /documento_nao_encontrado/.test(m) ? 'Este documento foi apagado em outro aparelho.'
      : renovaFalta(error) ? MSG_SQL_RENOVA
      : 'Não consegui salvar: ' + m;
    return;
  }
  fechar(); await carregar();
  toast(temValor ? 'Renovado e custo lançado em Despesas. Toque em 📅 para pôr a data nova na agenda.' : 'Renovado. Toque em 📅 para pôr a data nova na agenda.');
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements, erro = $('doc-erro'), btn = $('doc-salvar');
  erro.textContent = '';
  if (!f.vencimento.value) { erro.textContent = 'Informe a data de vencimento.'; return; }
  if (renovando && editando && f.vencimento.value <= editando.vencimento) {
    erro.textContent = 'A nova data precisa ser depois do vencimento antigo (' + fmtDia(editando.vencimento) + ').'; return;
  }
  if (renovando) { await salvarRenovacao(f, erro, btn); return; }
  const dados = {
    tipo: f.tipo.value, descricao: f.descricao.value.trim() || null, numero: f.numero.value.trim() || null,
    vencimento: f.vencimento.value, avisar_dias: Number(f.avisar_dias.value) || 30, obs: f.obs.value.trim() || null,
    atualizado_por_nome: usuarioNome || null, atualizado_em: new Date().toISOString()
  };
  const msg = editando ? 'Documento atualizado.' : 'Documento adicionado.';
  btn.disabled = true;
  const r = editando
    ? await sb.from('documentos_van').update(dados).eq('id', editando.id).select('id')
    : await sb.from('documentos_van').insert(dados).select('id');
  btn.disabled = false;
  if (r.error) { erro.textContent = tabelaFalta(r.error) ? MSG_SQL : 'Não consegui salvar: ' + r.error.message; return; }
  if (!r.data.length) { erro.textContent = 'O banco não deixou salvar (falta permissão ou o documento foi apagado em outro aparelho).'; return; }
  fechar(); await carregar(); toast(msg);
});

$('doc-apagar').addEventListener('click', async () => {
  if (!editando) return;
  if (!confirm(`Apagar "${nomeDoc(editando)}"?\n\nO histórico de renovações vai junto. As despesas já lançadas continuam no Financeiro.\n\nIsso não tem desfazer.`)) return;
  const { data, error } = await sb.from('documentos_van').delete().eq('id', editando.id).select('id');
  if (error) { $('doc-erro').textContent = 'Não consegui apagar: ' + error.message; return; }
  fechar(); await carregar();
  toast(data.length ? 'Documento apagado.' : 'Este documento já tinha sido apagado.');
});

iniciar();