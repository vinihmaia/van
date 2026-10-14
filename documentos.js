/* =================== VAN PV · documentos da van ===================
   Página separada do painel: se algo der errado aqui, o painel continua funcionando.
   Cada documento tem uma data de vencimento e "quantos dias antes avisar".
   Verde = em dia · amarelo = vence logo · vermelho = vencido. */
const CFG = window.VAN_CONFIG || {};
const sb = (window.supabase && CFG.supabaseUrl && CFG.supabaseKey) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDia = s => s ? s.split('-').reverse().join('/') : '—';
let tt; function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200); }

/* Tipos sugeridos (use só os que valem para a van de vocês) */
const TIPOS = ['Vistoria do Detran', 'Licenciamento (CRLV)', 'Autorização da prefeitura', 'Seguro', 'CNH do motorista', 'Curso de transporte escolar', 'Aferição do tacógrafo', 'Extintor', 'Outro'];
const MSG_SQL = 'Falta criar a tabela de documentos no banco: rode o SQL dos documentos no Supabase.';
const tabelaFalta = e => /documentos_van|does not exist|schema cache/i.test((e && e.message) || '');

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
        `<button class="btn ghost sm" data-editar="${esc(d.id)}" type="button">Editar</button></div></li>`).join('')
    : '<li class="dc-vazio">Nenhum documento cadastrado ainda.<br>Toque em "+ Adicionar" e comece pelos que vencem primeiro.</li>';
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
  $('doc-apagar').hidden = !d;
  if (d) {
    garantirOpcao(f.tipo, d.tipo, d.tipo);
    f.descricao.value = d.descricao || '';
    f.numero.value = d.numero || '';
    f.vencimento.value = renovando ? '' : d.vencimento;
    garantirOpcao(f.avisar_dias, d.avisar_dias || 30, (d.avisar_dias || 30) + ' dias');
    f.obs.value = d.obs || '';
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
  const id = b.dataset.renovar || b.dataset.editar; if (!id) return;
  const d = docs.find(x => x.id === id); if (d) abrir(d, !!b.dataset.renovar);
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements, erro = $('doc-erro'), btn = $('doc-salvar');
  erro.textContent = '';
  if (!f.vencimento.value) { erro.textContent = 'Informe a data de vencimento.'; return; }
  if (renovando && editando && f.vencimento.value <= editando.vencimento) {
    erro.textContent = 'A nova data precisa ser depois do vencimento antigo (' + fmtDia(editando.vencimento) + ').'; return;
  }
  const dados = {
    tipo: f.tipo.value, descricao: f.descricao.value.trim() || null, numero: f.numero.value.trim() || null,
    vencimento: f.vencimento.value, avisar_dias: Number(f.avisar_dias.value) || 30, obs: f.obs.value.trim() || null,
    atualizado_por_nome: usuarioNome || null, atualizado_em: new Date().toISOString()
  };
  const msg = renovando ? 'Renovação registrada.' : editando ? 'Documento atualizado.' : 'Documento adicionado.';
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
  const nome = editando.tipo + (editando.descricao ? ' · ' + editando.descricao : '');
  if (!confirm(`Apagar "${nome}"?\n\nIsso não tem desfazer.`)) return;
  const { data, error } = await sb.from('documentos_van').delete().eq('id', editando.id).select('id');
  if (error) { $('doc-erro').textContent = 'Não consegui apagar: ' + error.message; return; }
  fechar(); await carregar();
  toast(data.length ? 'Documento apagado.' : 'Este documento já tinha sido apagado.');
});

iniciar();