/* =================== VAN PV · painel conectado ao banco (Supabase) ===================
   Os dados ficam no banco. O navegador guarda só a sessão de login.
   A assinatura online (etapa 6) ainda não está ativa: o link mostra um aviso. */
const LUGARES = 23, ANO = 2027, ASSINATURA_ATIVA = true;
const SERIES = ['Pré', '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série do Ensino Médio', '2ª série do Ensino Médio', '3ª série do Ensino Médio'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ---------- conexão com o banco ---------- */
const CFG = window.VAN_CONFIG || {};
const sb = (window.supabase && CFG.supabaseUrl && CFG.supabaseKey) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const CAMPOS = '*, responsavel:responsaveis!responsavel_id(*), crianca:criancas!crianca_id(*), assinatura:assinaturas(*), mensalidades(*)';

/* ---------- ajudantes ---------- */
const agora = () => new Date().toISOString();
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const soDigitos = s => (s || '').replace(/\D/g, '');
const fmtCPF = d => { d = soDigitos(d); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d; };
const fmtBRL = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso, hora) => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR') + (hora ? ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''); };
const fmtDia = s => s ? s.split('-').reverse().join('/') : '—';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let tt; function toast(m) { const el = document.getElementById('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200); }
function erroLogin(m) { document.getElementById('erro-login').textContent = m || ''; }
function traduzErro(e) {
  const m = (e && (e.message || String(e))) || 'Erro desconhecido.';
  if (/failed to fetch|networkerror|network request/i.test(m)) return 'Sem conexão com o banco. Confira a internet e tente de novo.';
  if (/jwt|token.*expired/i.test(m)) return 'Sua sessão expirou. Saia e entre de novo.';
  if (/permission denied|row-level security/i.test(m)) return 'Sem permissão para esta ação.';
  return m;
}
const linkAssinatura = c => location.href.split('#')[0] + '#assinar/' + c.token;
async function copiar(t) {
  const aviso = ASSINATURA_ATIVA ? 'Link copiado. Cole no WhatsApp do responsável.' : 'Link copiado. Atenção: a assinatura online ainda não está ativa.';
  try { await navigator.clipboard.writeText(t); toast(aviso); } catch (e) { prompt('Copie o link:', t); }
}
function irPara(h) { if (location.hash === h) rota(); else location.hash = h; }

/* ---------- estado (o que está carregado na tela) ---------- */
let DB = { contratos: [] }, usuario = null, acessoOk = false, carregado = false;
const achar = id => DB.contratos.find(c => c.id === id);
function limparEstado() { DB.contratos = []; usuario = null; acessoOk = false; carregado = false; }

/* Converte uma linha do banco no formato que as telas usam */
function deBanco(r) {
  const a = Array.isArray(r.assinatura) ? r.assinatura[0] : r.assinatura;
  const resp = r.responsavel || {}, cri = r.crianca || {}, mens = {};
  (r.mensalidades || []).forEach(m => { if (m.ano === ANO) mens[m.mes] = m; });
  return {
    id: r.id, token: r.token, status: r.status, criadoEm: r.criado_em, enviadoEm: r.enviado_em,
    responsavel: { id: resp.id, nome: resp.nome || '', cpf: resp.cpf || '', tel: resp.telefone || '', email: resp.email || '' },
    crianca: { nome: cri.nome || '', serie: cri.serie || '' },
    turma: r.turma, endereco: r.endereco || '', bairro: r.bairro || '', mensalidade: Number(r.mensalidade),
    vencimento: r.vencimento, inicio: r.inicio, fim: r.fim, vale: r.vale_desconto, obs: r.observacoes || '',
    assinatura: a ? { nome: a.nome, cpf: a.cpf, em: a.assinado_em, ip: a.ip || '—', hash: a.hash_documento, pdf: a.pdf_caminho } : null,
    mensalidades: mens
  };
}
async function recarregar() {
  const { data, error } = await sb.from('contratos').select(CAMPOS).order('criado_em', { ascending: false });
  if (error) { toast('Erro ao carregar: ' + traduzErro(error)); return false; }
  DB.contratos = data.map(deBanco); carregado = true; return true;
}

/* ---------- texto do contrato (MODELO DE DEMONSTRAÇÃO) ---------- */
function textoContrato(c, html) {
  const v = s => html ? '<strong>' + esc(s) + '</strong>' : String(s);
  const linhas = [
    'CONTRATO DE PRESTAÇÃO DE SERVIÇO DE TRANSPORTE ESCOLAR · TURMA 2027',
    '(modelo de demonstração: as cláusulas definitivas serão definidas com a Tia Patrícia)', '',
    'CONTRATADA: Van Escolar Tia Patrícia e Tio Vitor.',
    'CONTRATANTE: ' + v(c.responsavel.nome) + ', CPF ' + v(fmtCPF(c.responsavel.cpf)) + ', telefone ' + v(c.responsavel.tel) + ', e-mail ' + v(c.responsavel.email) + '.',
    'ALUNO(A): ' + v(c.crianca.nome) + ', ' + v(c.crianca.serie) + ', turma da ' + v(c.turma.toLowerCase()) + '.',
    'ENDEREÇO DE EMBARQUE: ' + v(c.endereco) + ', ' + v(c.bairro) + '.', '',
    '1. OBJETO. Transporte do(a) aluno(a) entre o endereço acima e a Fundação Bradesco (Cidade de Deus, Osasco), ida e volta, nos dias letivos.',
    '2. VIGÊNCIA. De ' + v(fmtDia(c.inicio)) + ' a ' + v(fmtDia(c.fim)) + '.',
    '3. MENSALIDADE. ' + v(fmtBRL(c.mensalidade)) + ' por mês, com vencimento todo dia ' + v(c.vencimento) + ', em dinheiro ou Pix, durante 12 meses, inclusive janeiro e fevereiro.',
    c.vale ? '3.1. VALE DESCONTO PV. Na primeira mensalidade será aplicado desconto de 20%.' : null,
    '4. FALTAS. O responsável avisa pelo WhatsApp com antecedência, inclusive em caso de atestado médico.',
    '5. RESCISÃO. [a definir com a Tia Patrícia]',
    '6. OUTRAS CONDIÇÕES. ' + v(c.obs || '—'), '',
    'Ao assinar eletronicamente, o CONTRATANTE declara que leu e concorda com todas as cláusulas acima.'
  ].filter(l => l !== null);
  return linhas.join('\n');
}

/* ---------- navegação por #rota ---------- */
function mostrar(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function carregando() { document.getElementById('tab-contratos').innerHTML = '<tr><td colspan="6" class="vazio">Carregando…</td></tr>'; }
async function rota() {
  const h = location.hash.slice(1) || 'contratos', [tela, param] = h.split('/');
  if (tela === 'assinar') { mostrar('tela-assinar'); telaAssinar(param); window.scrollTo(0, 0); return; }
  if (!sb) { mostrar('tela-login'); erroLogin('Não foi possível carregar a conexão com o banco. Confira a internet e o arquivo config.js.'); document.getElementById('login-btn').disabled = true; return; }
  if (!usuario) { mostrar('tela-login'); return; }
  if (!acessoOk) {
    const { data, error } = await sb.from('usuarios_painel').select('id').eq('id', usuario.id).maybeSingle();
    if (error) { mostrar('tela-login'); erroLogin(traduzErro(error)); return; }
    if (!data) { await sb.auth.signOut(); limparEstado(); mostrar('tela-login'); erroLogin('Este login não tem acesso ao painel.'); return; }
    acessoOk = true;
  }
  mostrar('app');
  document.getElementById('quem-email').textContent = usuario.email;
  const grupo = (tela === 'novo' || tela === 'contrato') ? 'contratos' : tela;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === grupo));
  const mapa = { contratos: 'tela-contratos', novo: 'tela-novo', contrato: 'tela-detalhe', financeiro: 'tela-financeiro', responsaveis: 'tela-responsaveis' };
  const alvo = mapa[tela] || 'tela-contratos';
  document.querySelectorAll('#app .screen').forEach(s => s.classList.toggle('active', s.id === alvo));
  const listas = ['tela-contratos', 'tela-financeiro', 'tela-responsaveis'];
  if (!carregado) carregando();
  if (!carregado || listas.includes(alvo)) { if (!(await recarregar())) return; }
  if (alvo === 'tela-contratos') renderContratos();
  if (alvo === 'tela-novo') telaNovo(param);
  if (alvo === 'tela-detalhe') telaDetalhe(param);
  if (alvo === 'tela-financeiro') renderFinanceiro();
  if (alvo === 'tela-responsaveis') renderResponsaveis();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', rota);

/* ---------- login de verdade ---------- */
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault(); if (!sb) return;
  const email = document.getElementById('login-email').value.trim(), senhaEl = document.getElementById('login-senha'), btn = document.getElementById('login-btn');
  if (!email || !senhaEl.value) return;
  erroLogin(''); btn.disabled = true; btn.textContent = 'Entrando…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senhaEl.value });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) { erroLogin(/invalid login credentials/i.test(error.message) ? 'E-mail ou senha incorretos.' : traduzErro(error)); return; }
  senhaEl.value = ''; usuario = data.user; acessoOk = false; carregado = false;
  irPara('#contratos');
});
document.getElementById('sair').addEventListener('click', async () => { await sb.auth.signOut(); limparEstado(); irPara('#login'); });

/* ---------- contratos: lista ---------- */
let filtro = 'todos', busca = '';
const rotulo = c => ({ assinado: 'Assinado ' + fmtData(c.assinatura && c.assinatura.em), aguardando: 'Aguardando assinatura', rascunho: 'Rascunho', cancelado: 'Cancelado' })[c.status];
function renderContratos() {
  const cs = DB.contratos, n = s => cs.filter(c => c.status === s).length;
  document.getElementById('st-assinado').textContent = n('assinado');
  document.getElementById('st-aguardando').textContent = n('aguardando');
  document.getElementById('st-rascunho').textContent = n('rascunho');
  const ocup = t => cs.filter(c => c.status === 'assinado' && c.turma === t).length;
  document.getElementById('st-vagas').textContent = 'M ' + (LUGARES - ocup('Manhã')) + ' · T ' + (LUGARES - ocup('Tarde'));
  const b = busca.toLowerCase();
  const lista = cs.filter(c => (filtro === 'todos' || c.status === filtro) && (!b || (c.responsavel.nome + ' ' + c.crianca.nome + ' ' + c.bairro).toLowerCase().includes(b)));
  const acao = c => c.status === 'aguardando' ? `<button class="btn ghost sm" data-copiar="${c.id}" type="button">Copiar link</button>` : c.status === 'assinado' ? `<button class="btn ghost sm" data-pdf="${c.id}" type="button">PDF</button>` : c.status === 'rascunho' ? `<button class="btn ghost sm" data-editar="${c.id}" type="button">Editar</button>` : '';
  const vazio = cs.length ? 'Nenhum contrato aqui.' : 'Nenhum contrato ainda. Clique em "+ Novo contrato" para começar.';
  document.getElementById('tab-contratos').innerHTML = lista.length ? lista.map(c => `<tr class="clicavel" data-id="${c.id}"><td>${esc(c.responsavel.nome)}<small>${esc(c.responsavel.tel)}</small></td><td>${esc(c.crianca.nome)}<small>${esc(c.crianca.serie)}</small></td><td>${esc(c.turma)}</td><td>${fmtBRL(c.mensalidade)}</td><td><span class="tag ${c.status}">${rotulo(c)}</span></td><td>${acao(c)}</td></tr>`).join('') : `<tr><td colspan="6" class="vazio">${vazio}</td></tr>`;
}
document.getElementById('tab-contratos').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { e.stopPropagation(); if (b.dataset.copiar) copiar(linkAssinatura(achar(b.dataset.copiar))); if (b.dataset.pdf) abrirPDF(achar(b.dataset.pdf)); if (b.dataset.editar) irPara('#novo/' + b.dataset.editar); return; }
  const tr = e.target.closest('tr[data-id]'); if (tr) irPara('#contrato/' + tr.dataset.id);
});
document.querySelectorAll('.chip[data-f]').forEach(ch => ch.addEventListener('click', () => { filtro = ch.dataset.f; document.querySelectorAll('.chip[data-f]').forEach(x => x.classList.toggle('on', x === ch)); renderContratos(); }));
document.getElementById('busca').addEventListener('input', e => { busca = e.target.value; renderContratos(); });
document.getElementById('exportar').addEventListener('click', () => {
  const cab = ['Responsável', 'CPF', 'WhatsApp', 'E-mail', 'Criança', 'Série', 'Turma', 'Bairro', 'Mensalidade', 'Status', 'Assinado em'];
  const linhas = DB.contratos.map(c => [c.responsavel.nome, fmtCPF(c.responsavel.cpf), c.responsavel.tel, c.responsavel.email, c.crianca.nome, c.crianca.serie, c.turma, c.bairro, c.mensalidade, c.status, c.assinatura ? fmtData(c.assinatura.em, true) : '']);
  const csv = [cab, ...linhas].map(l => l.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'contratos-2027.csv'; a.click();
});

/* ---------- contratos: novo / editar ---------- */
const formC = document.getElementById('form-contrato');
SERIES.forEach(s => { const o = document.createElement('option'); o.textContent = s; formC.elements.serie.appendChild(o); });
function telaNovo(id) {
  formC.reset(); document.getElementById('erro-contrato').textContent = '';
  formC.elements.id.value = ''; formC.elements.inicio.value = '2027-01-01'; formC.elements.fim.value = '2027-12-31'; formC.elements.vencimento.value = 10;
  document.getElementById('novo-titulo').textContent = id ? 'Editar contrato' : 'Novo contrato';
  const c = id && achar(id); if (!c) return;
  const f = formC.elements; f.id.value = c.id; f.nome.value = c.responsavel.nome; f.cpf.value = fmtCPF(c.responsavel.cpf); f.tel.value = c.responsavel.tel; f.email.value = c.responsavel.email; f.crianca.value = c.crianca.nome; f.serie.value = c.crianca.serie; f.turma.value = c.turma; f.endereco.value = c.endereco; f.bairro.value = c.bairro; f.mensalidade.value = c.mensalidade; f.vencimento.value = c.vencimento; f.inicio.value = c.inicio; f.fim.value = c.fim; f.vale.value = c.vale ? 'sim' : 'nao'; f.obs.value = c.obs || '';
}
function lerForm() {
  const f = formC.elements;
  return { responsavel: { nome: f.nome.value.trim(), cpf: soDigitos(f.cpf.value), tel: f.tel.value.trim(), email: f.email.value.trim() }, crianca: { nome: f.crianca.value.trim(), serie: f.serie.value }, turma: f.turma.value, endereco: f.endereco.value.trim(), bairro: f.bairro.value.trim(), mensalidade: Number(f.mensalidade.value), vencimento: Number(f.vencimento.value) || 10, inicio: f.inicio.value, fim: f.fim.value, vale: f.vale.value === 'sim', obs: f.obs.value.trim() };
}
function validar(d) {
  if (!d.responsavel.nome) return 'Preencha o nome do responsável.';
  if (d.responsavel.cpf.length !== 11) return 'O CPF precisa ter 11 números.';
  if (!d.responsavel.email) return 'Preencha o e-mail: é por ele que chega o código de assinatura.';
  if (!d.crianca.nome) return 'Preencha o nome da criança.';
  if (!d.crianca.serie) return 'Escolha a série.';
  if (!d.turma) return 'Escolha a turma.';
  if (!(d.mensalidade > 0)) return 'Informe a mensalidade.';
  return '';
}
function travarForm(sim) { formC.querySelectorAll('button').forEach(b => { b.disabled = sim; }); }
async function gravar(status) {
  const d = lerForm(), erroEl = document.getElementById('erro-contrato'), erro = validar(d);
  erroEl.textContent = erro; if (erro) return;
  travarForm(true);
  const { data, error } = await sb.rpc('salvar_contrato', { dados: {
    id: formC.elements.id.value || null, status,
    nome: d.responsavel.nome, cpf: d.responsavel.cpf, tel: d.responsavel.tel, email: d.responsavel.email,
    crianca: d.crianca.nome, serie: d.crianca.serie, turma: d.turma, endereco: d.endereco, bairro: d.bairro,
    mensalidade: d.mensalidade, vencimento: d.vencimento, vale: d.vale, inicio: d.inicio, fim: d.fim, obs: d.obs
  } });
  travarForm(false);
  if (error) { erroEl.textContent = traduzErro(error); return; }
  await recarregar();
  irPara('#contrato/' + data);
  toast(status === 'aguardando' ? (ASSINATURA_ATIVA ? 'Contrato gerado. Copie o link e envie no WhatsApp.' : 'Contrato gerado. A assinatura online ainda não está ativa.') : 'Rascunho salvo.');
}
formC.addEventListener('submit', e => { e.preventDefault(); gravar('aguardando'); });
document.getElementById('salvar-rascunho').addEventListener('click', () => gravar('rascunho'));

/* ---------- contratos: detalhe ---------- */
let atual = null;
function telaDetalhe(id) {
  const c = achar(id); if (!c) { irPara('#contratos'); return; } atual = c;
  document.getElementById('det-titulo').textContent = c.responsavel.nome + ' · ' + c.crianca.nome;
  document.getElementById('det-status').innerHTML = `<span class="tag ${c.status}">${rotulo(c)}</span>`;
  const kv = [['Responsável', c.responsavel.nome], ['CPF', fmtCPF(c.responsavel.cpf)], ['WhatsApp', c.responsavel.tel], ['E-mail', c.responsavel.email], ['Criança', c.crianca.nome], ['Série em 2027', c.crianca.serie], ['Turma', c.turma], ['Endereço', c.endereco + (c.bairro ? ', ' + c.bairro : '')], ['Mensalidade', fmtBRL(c.mensalidade) + ' · vence dia ' + c.vencimento], ['Vigência', fmtDia(c.inicio) + ' a ' + fmtDia(c.fim)], ['Vale desconto PV', c.vale ? 'Sim, 20% na 1ª mensalidade' : 'Não'], ['Observações', c.obs || '—']];
  document.getElementById('det-kv').innerHTML = kv.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const temLink = c.status === 'aguardando' || c.status === 'assinado';
  document.getElementById('det-linkbox').hidden = !temLink; document.getElementById('det-link').value = temLink ? linkAssinatura(c) : '';
  const a = c.assinatura;
  const passos = [['Rascunho criado', fmtData(c.criadoEm, true), true], ['Link de assinatura gerado', c.enviadoEm ? fmtData(c.enviadoEm, true) : 'ainda não', !!c.enviadoEm], ['Assinado pelo responsável', a ? `${a.nome} · CPF ${fmtCPF(a.cpf)} · ${fmtData(a.em, true)} · IP ${a.ip} · impressão digital ${a.hash}` : 'ainda não', !!a]];
  if (c.status === 'cancelado') passos.push(['Contrato cancelado', '', true]);
  let marcouAtual = false;
  document.getElementById('det-tl').innerHTML = passos.map(([t, s, feito], i) => { const cls = feito ? 'feito' : (!marcouAtual ? (marcouAtual = true, 'atual') : ''); return `<li class="${cls}"><i>${feito ? '✓' : i + 1}</i><div>${t}<small>${esc(s)}</small></div></li>`; }).join('');
  const mostra = (id, sim) => { document.getElementById(id).hidden = !sim; };
  mostra('det-gerar', c.status === 'rascunho'); mostra('det-editar', c.status === 'rascunho'); mostra('det-copiar', c.status === 'aguardando'); mostra('det-pdf', c.status !== 'rascunho'); mostra('det-cancelar', c.status === 'rascunho' || c.status === 'aguardando');
}
/* Atualiza o contrato só se ele ainda estiver num dos status permitidos */
async function atualizarContrato(id, campos, statusPermitidos) {
  const { data, error } = await sb.from('contratos').update(campos).eq('id', id).in('status', statusPermitidos).select('id');
  if (error) { toast(traduzErro(error)); return false; }
  await recarregar();
  if (!data.length) { toast('Este contrato mudou em outro aparelho. A tela foi atualizada.'); return false; }
  return true;
}
document.getElementById('det-gerar').addEventListener('click', async e => {
  const b = e.currentTarget; b.disabled = true;
  const ok = await atualizarContrato(atual.id, { status: 'aguardando', enviado_em: atual.enviadoEm || agora() }, ['rascunho']);
  b.disabled = false; telaDetalhe(atual.id);
  if (ok) toast(ASSINATURA_ATIVA ? 'Link gerado. Copie e envie no WhatsApp.' : 'Link gerado. A assinatura online ainda não está ativa.');
});
document.getElementById('det-editar').addEventListener('click', () => irPara('#novo/' + atual.id));
document.getElementById('det-copiar').addEventListener('click', () => copiar(linkAssinatura(atual)));
document.getElementById('det-pdf').addEventListener('click', () => abrirPDF(atual));
document.getElementById('det-cancelar').addEventListener('click', async () => {
  if (!confirm('Cancelar este contrato?')) return;
  const ok = await atualizarContrato(atual.id, { status: 'cancelado', cancelado_em: agora() }, ['rascunho', 'aguardando']);
  telaDetalhe(atual.id);
  if (ok) toast('Contrato cancelado.');
});

/* ---------- PDF: abre uma página pronta para "Salvar como PDF" ---------- */
async function baixarPDFAssinado(c) {
  const w = window.open('', '_blank'); if (!w) { toast('O navegador bloqueou a janela. Permita pop-ups para baixar o PDF.'); return; }
  w.document.write('<p style="font-family:sans-serif;padding:20px">Abrindo o PDF assinado…</p>');
  const { data, error } = await sb.storage.from('contratos').createSignedUrl(c.assinatura.pdf, 300);
  if (error || !data) { w.close(); toast('Não foi possível abrir o PDF: ' + traduzErro(error)); return; }
  w.location.href = data.signedUrl;
}
function abrirPDF(c) {
  if (c.assinatura && c.assinatura.pdf) { baixarPDFAssinado(c); return; }
  const w = window.open('', '_blank'); if (!w) { toast('O navegador bloqueou a janela. Permita pop-ups para gerar o PDF.'); return; }
  const a = c.assinatura;
  const ass = a ? `ASSINATURA ELETRÔNICA\nAssinado por ${a.nome}, CPF ${fmtCPF(a.cpf)}, em ${fmtData(a.em, true)}.\nEndereço de rede (IP): ${a.ip}\nImpressão digital do documento: ${a.hash}` : 'Documento ainda sem assinatura.';
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Contrato ${esc(c.crianca.nome)} · 2027</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}pre{white-space:pre-wrap;font:inherit;margin:0}.ass{margin-top:32px;padding:16px;border:1px solid #999;font-size:14px}.dica{font-family:sans-serif;font-size:12px;color:#666;margin-bottom:20px}@media print{.dica{display:none}}</style></head><body><p class="dica">Use Ctrl+P e escolha "Salvar como PDF".</p><pre>${esc(textoContrato(c, false))}</pre><div class="ass"><pre>${esc(ass)}</pre></div><script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
  w.document.close();
}

/* ---------- tela do responsável: aviso até a etapa 6 ---------- */
/* ---------- tela do responsável: assinatura de verdade (Edge Function) ---------- */
const FN_URL = (CFG.supabaseUrl || '') + '/functions/v1/assinatura';
const elA = id => document.getElementById(id);
const formA = elA('form-assinar');
let tokenAtual = '';

/* Botão "Receber código" e aviso, criados uma vez acima do campo do código */
const boxCodigo = document.createElement('div');
boxCodigo.className = 'codigo-demo';
boxCodigo.innerHTML = '<button class="btn ghost sm" id="ass-enviar" type="button">Receber código por e-mail</button><span id="ass-info" style="display:block;margin-top:8px"></span>';
formA.elements.codigo.closest('label').before(boxCodigo);

async function chamarAssinatura(dados) {
  try {
    const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { erro: j.erro || 'Não foi possível concluir. Tente de novo.' };
    return j;
  } catch (e) { return { erro: 'Sem conexão. Confira a internet e tente de novo.' }; }
}
function mostrarAssinado(nome, em, pdfUrl, extra) {
  const ok = elA('ass-ok'); ok.hidden = false;
  ok.innerHTML = `<b>Contrato assinado</b>Assinado por ${esc(nome)} em ${fmtData(em, true)}.` +
    (pdfUrl ? `<br><a href="${esc(pdfUrl)}" target="_blank" rel="noopener">Baixar PDF assinado</a>` : '') +
    (extra ? '<br>' + esc(extra) : '');
}
async function telaAssinar(tok) {
  tokenAtual = tok || '';
  const texto = elA('ass-texto');
  formA.hidden = true; elA('ass-ok').hidden = true; formA.reset();
  elA('erro-assinar').textContent = ''; elA('ass-info').textContent = '';
  const bEnviar = elA('ass-enviar'); bEnviar.disabled = false; bEnviar.textContent = 'Receber código por e-mail';
  texto.textContent = 'Carregando o contrato…';
  const r = await chamarAssinatura({ acao: 'ver', token: tokenAtual });
  if (r.erro) { texto.textContent = r.erro; return; }
  if (r.status === 'assinado' && r.assinatura) { texto.textContent = 'Este contrato já foi assinado.'; mostrarAssinado(r.assinatura.nome, r.assinatura.em, r.pdfUrl); return; }
  if (r.status !== 'aguardando') { texto.textContent = 'Este contrato não está disponível para assinatura. Fale com a equipe da van.'; return; }
  texto.textContent = r.texto;
  elA('ass-info').textContent = 'O código será enviado para ' + r.emailMascarado + '.';
  formA.hidden = false;
}
elA('ass-enviar').addEventListener('click', async e => {
  const b = e.currentTarget; b.disabled = true; elA('erro-assinar').textContent = '';
  const r = await chamarAssinatura({ acao: 'enviar-codigo', token: tokenAtual });
  if (r.erro) { elA('erro-assinar').textContent = r.erro; b.disabled = false; return; }
  elA('ass-info').textContent = `Enviamos um código para ${r.emailMascarado}. Ele vale por ${r.validadeMin} minutos. Confira também a caixa de spam.`;
  b.textContent = 'Reenviar código (aguarde 1 minuto)';
  setTimeout(() => { b.disabled = false; b.textContent = 'Reenviar código'; }, 60000);
});
formA.addEventListener('submit', async e => {
  e.preventDefault();
  const f = formA.elements, erro = elA('erro-assinar'), btn = formA.querySelector('button[type=submit]');
  erro.textContent = '';
  if (!f.aceite.checked) { erro.textContent = 'Marque que leu e concorda com o contrato.'; return; }
  if (!f.nome.value.trim()) { erro.textContent = 'Digite seu nome completo.'; return; }
  if (soDigitos(f.cpf.value).length !== 11) { erro.textContent = 'O CPF precisa ter 11 números.'; return; }
  if (soDigitos(f.codigo.value).length !== 6) { erro.textContent = 'Digite os 6 números do código.'; return; }
  btn.disabled = true; btn.textContent = 'Assinando…';
  const r = await chamarAssinatura({ acao: 'assinar', token: tokenAtual, aceite: true, nome: f.nome.value.trim(), cpf: f.cpf.value, codigo: f.codigo.value });
  btn.disabled = false; btn.textContent = 'Assinar contrato';
  if (r.erro) { erro.textContent = r.erro; return; }
  const v = await chamarAssinatura({ acao: 'ver', token: tokenAtual });
  formA.hidden = true;
  elA('ass-texto').textContent = 'Assinatura registrada. Obrigado!';
  mostrarAssinado(r.nome, r.em, v.pdfUrl, r.emailOk ? 'Uma cópia do PDF foi enviada para o seu e-mail.' : 'Não conseguimos enviar o PDF por e-mail agora. Use o link acima para baixar.');
  window.scrollTo(0, 0);
});

/* ---------- financeiro (prévia da fase 2) ---------- */
function renderFinanceiro() {
  const cs = DB.contratos.filter(c => c.status === 'assinado'), hoje = new Date();
  let recebido = 0, aberto = 0, atrasados = 0;
  const linhas = cs.map(c => {
    let pagos = 0;
    const cels = MESES.map((nomeMes, i) => {
      const m = c.mensalidades[i + 1], valor = m ? Number(m.valor) : c.mensalidade, pago = !!(m && m.pago);
      const venc = m ? new Date(m.vencimento + 'T12:00:00') : new Date(ANO, i, c.vencimento), atr = !pago && venc < hoje;
      if (pago) { recebido += valor; pagos++; } else aberto += valor;
      if (atr) atrasados++;
      return `<td><button class="mes ${pago ? 'pago' : atr ? 'atrasado' : ''}" data-id="${c.id}" data-m="${i + 1}" title="${nomeMes}${m ? '' : ' · mensalidade ainda não criada'}" type="button"${m ? '' : ' disabled'}>✓</button></td>`;
    }).join('');
    return `<tr><td>${esc(c.responsavel.nome)}<small>${esc(c.crianca.nome)} · ${esc(c.turma)} · ${fmtBRL(c.mensalidade)}</small></td>${cels}<td><b>${pagos}/12</b></td></tr>`;
  });
  document.getElementById('tab-fin').innerHTML = linhas.length ? linhas.join('') : '<tr><td colspan="14" class="vazio">Nenhum contrato assinado ainda. As mensalidades aparecem aqui depois da assinatura.</td></tr>';
  document.getElementById('fin-recebido').textContent = fmtBRL(recebido);
  document.getElementById('fin-aberto').textContent = fmtBRL(aberto);
  document.getElementById('fin-atrasados').textContent = atrasados;
}
document.getElementById('tab-fin').addEventListener('click', async e => {
  const b = e.target.closest('button.mes'); if (!b || b.disabled) return;
  const c = achar(b.dataset.id), m = c && c.mensalidades[b.dataset.m]; if (!m) return;
  b.disabled = true;
  const novo = !m.pago;
  const { error } = await sb.from('mensalidades').update({ pago: novo, pago_em: novo ? hojeISO() : null }).eq('id', m.id);
  if (error) { toast(traduzErro(error)); b.disabled = false; return; }
  await recarregar(); renderFinanceiro();
});

/* ---------- responsáveis ---------- */
const nomeStatus = { assinado: 'Assinado', aguardando: 'Aguardando assinatura', rascunho: 'Rascunho', cancelado: 'Cancelado' };
function agruparResponsaveis() {
  const porId = {};
  DB.contratos.forEach(c => {
    const k = c.responsavel.id;
    porId[k] = porId[k] || { r: c.responsavel, filhos: new Set(), status: [], contratos: [] };
    porId[k].filhos.add(c.crianca.nome); porId[k].status.push(c.status); porId[k].contratos.push(c);
  });
  return porId;
}
function renderResponsaveis() {
  const lista = Object.values(agruparResponsaveis());
  document.getElementById('tab-resp').innerHTML = lista.length ? lista.map(x => `<tr><td>${esc(x.r.nome)}<small>CPF ${fmtCPF(x.r.cpf)}</small></td><td>${esc(x.r.tel)}<small>${esc(x.r.email)}</small></td><td>${esc([...x.filhos].join(', '))}</td><td>${x.status.map(s => `<span class="tag ${s}">${nomeStatus[s] || s}</span>`).join(' ')}</td><td><button class="link" data-apagar="${x.r.id}" type="button">Apagar cadastro</button></td></tr>`).join('') : '<tr><td colspan="5" class="vazio">Nenhum responsável cadastrado.</td></tr>';
}
document.getElementById('tab-resp').addEventListener('click', e => { const b = e.target.closest('button[data-apagar]'); if (b) apagarResponsavel(b.dataset.apagar); });
async function apagarResponsavel(id) {
  const x = agruparResponsaveis()[id]; if (!x) return;
  const assinados = x.contratos.filter(c => c.status === 'assinado').length;
  let msg = `Apagar o cadastro de ${x.r.nome}?\n\nSerão apagados para sempre: ${x.filhos.size} criança(s) e ${x.contratos.length} contrato(s)`;
  if (assinados) msg += `, sendo ${assinados} ASSINADO(S), junto com o comprovante de assinatura`;
  msg += '.\n\nIsso não tem desfazer. Para confirmar, digite APAGAR:';
  const digitado = prompt(msg); if (digitado === null) return;
  if (digitado.trim().toUpperCase() !== 'APAGAR') { toast('Nada foi apagado: a palavra não confere.'); return; }
  const { data, error } = await sb.from('responsaveis').delete().eq('id', id).select('id');
  if (error) { toast(traduzErro(error)); return; }
  await recarregar(); renderResponsaveis();
  toast(data.length ? 'Cadastro apagado.' : 'Este cadastro já não existia. A tela foi atualizada.');
}

/* ---------- início ---------- */
async function iniciar() {
  if (sb) {
    const { data } = await sb.auth.getSession();
    usuario = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT') { limparEstado(); setTimeout(rota, 0); }
      else if (sessao) usuario = sessao.user;
    });
  }
  rota();
}
iniciar();