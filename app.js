/* =================== VAN PV · painel conectado ao banco (Supabase) ===================
   Os dados ficam no banco. O navegador guarda só a sessão de login.
   A assinatura online usa a Edge Function "assinatura" no Supabase. */
const LUGARES = 23, ANO = 2027, ASSINATURA_ATIVA = true;
const SERIES = ['Pré', '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série do Ensino Médio', '2ª série do Ensino Médio', '3ª série do Ensino Médio'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

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
const primeiroNome = s => (s || '').trim().split(' ')[0];
let tt; function toast(m) { const el = document.getElementById('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200); }
function erroLogin(m) { document.getElementById('erro-login').textContent = m || ''; }
function traduzErro(e) {
  const m = (e && (e.message || String(e))) || 'Erro desconhecido.';
  if (/failed to fetch|networkerror|network request/i.test(m)) return 'Sem conexão com o banco. Confira a internet e tente de novo.';
  if (/jwt|token.*expired/i.test(m)) return 'Sua sessão expirou. Saia e entre de novo.';
  if (/permission denied|row-level security/i.test(m)) return 'Sem permissão para esta ação.';
  if (/mensalidade_paga_completa/i.test(m)) return 'Informe a forma e a data do pagamento.';
  return m;
}
const linkAssinatura = c => location.href.split('#')[0] + '#assinar/' + c.token;
function mensagemWhatsApp(c) {
  return `Olá, ${primeiroNome(c.responsavel.nome)}! Segue o link para assinar o contrato de transporte escolar 2027 de ${c.crianca.nome}:\n\n${linkAssinatura(c)}\n\n` +
    `Na página, clique em "Receber código por e-mail". O código chega em ${c.responsavel.email} e vale por 15 minutos.\n` +
    `Se não aparecer na caixa de entrada, confira a pasta de lixo eletrônico (spam).`;
}
/* Link wa.me: abre a conversa com a mensagem já escrita (nada é enviado sozinho) */
function linkWa(tel, msg) {
  let n = soDigitos(tel);
  if (n.length === 10 || n.length === 11) n = '55' + n;
  if (!/^55\d{10,11}$/.test(n)) return null;
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
}
function abrirConversa(tel, msg) {
  const url = linkWa(tel, msg);
  if (!url) { toast('WhatsApp do responsável vazio ou incompleto. Copie a mensagem e envie pelo seu WhatsApp.'); return; }
  window.open(url, '_blank', 'noopener');
}
const abrirWhatsApp = c => abrirConversa(c.responsavel.tel, mensagemWhatsApp(c));
async function copiar(t) {
  const aviso = 'Mensagem copiada. Cole no WhatsApp do responsável.';
  try { await navigator.clipboard.writeText(t); toast(aviso); } catch (e) { prompt('Copie a mensagem:', t); }
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
  fecharModais();
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
  const acao = c => c.status === 'aguardando' ? `<button class="btn or sm" data-whats="${c.id}" type="button">WhatsApp</button> <button class="btn ghost sm" data-copiar="${c.id}" type="button">Copiar mensagem</button>` : c.status === 'assinado' ? `<button class="btn ghost sm" data-pdf="${c.id}" type="button">PDF</button>` : c.status === 'rascunho' ? `<button class="btn ghost sm" data-editar="${c.id}" type="button">Editar</button>` : '';
  const vazio = cs.length ? 'Nenhum contrato aqui.' : 'Nenhum contrato ainda. Clique em "+ Novo contrato" para começar.';
  document.getElementById('tab-contratos').innerHTML = lista.length ? lista.map(c => `<tr class="clicavel" data-id="${c.id}"><td>${esc(c.responsavel.nome)}<small>${esc(c.responsavel.tel)}</small></td><td>${esc(c.crianca.nome)}<small>${esc(c.crianca.serie)}</small></td><td>${esc(c.turma)}</td><td>${fmtBRL(c.mensalidade)}</td><td><span class="tag ${c.status}">${rotulo(c)}</span></td><td style="white-space:nowrap">${acao(c)}</td></tr>`).join('') : `<tr><td colspan="6" class="vazio">${vazio}</td></tr>`;
}
document.getElementById('tab-contratos').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { e.stopPropagation(); if (b.dataset.whats) abrirWhatsApp(achar(b.dataset.whats)); if (b.dataset.copiar) copiar(mensagemWhatsApp(achar(b.dataset.copiar))); if (b.dataset.pdf) abrirPDF(achar(b.dataset.pdf)); if (b.dataset.editar) irPara('#novo/' + b.dataset.editar); return; }
  const tr = e.target.closest('tr[data-id]'); if (tr) irPara('#contrato/' + tr.dataset.id);
});
document.querySelectorAll('.chip[data-f]').forEach(ch => ch.addEventListener('click', () => { filtro = ch.dataset.f; document.querySelectorAll('.chip[data-f]').forEach(x => x.classList.toggle('on', x === ch)); renderContratos(); }));
document.getElementById('busca').addEventListener('input', e => { busca = e.target.value; renderContratos(); });
function baixarCSV(nome, cab, linhas) {
  const csv = [cab, ...linhas].map(l => l.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click();
}
document.getElementById('exportar').addEventListener('click', () => {
  const cab = ['Responsável', 'CPF', 'WhatsApp', 'E-mail', 'Criança', 'Série', 'Turma', 'Bairro', 'Mensalidade', 'Status', 'Assinado em'];
  baixarCSV('contratos-2027.csv', cab, DB.contratos.map(c => [c.responsavel.nome, fmtCPF(c.responsavel.cpf), c.responsavel.tel, c.responsavel.email, c.crianca.nome, c.crianca.serie, c.turma, c.bairro, c.mensalidade, c.status, c.assinatura ? fmtData(c.assinatura.em, true) : '']));
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
  toast(status === 'aguardando' ? 'Contrato gerado. Clique em "Enviar no WhatsApp".' : 'Rascunho salvo.');
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
  mostra('det-gerar', c.status === 'rascunho'); mostra('det-editar', c.status === 'rascunho'); mostra('det-copiar', c.status === 'aguardando'); mostra('det-whats', c.status === 'aguardando'); mostra('det-pdf', c.status !== 'rascunho'); mostra('det-cancelar', c.status === 'rascunho' || c.status === 'aguardando');
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
  if (ok) toast('Link gerado. Clique em "Enviar no WhatsApp".');
});
document.getElementById('det-editar').addEventListener('click', () => irPara('#novo/' + atual.id));
document.getElementById('det-copiar').addEventListener('click', () => copiar(mensagemWhatsApp(atual)));
/* Botão "Enviar no WhatsApp", criado ao lado do "Copiar" */
const detWhats = document.createElement('button');
detWhats.className = 'btn or sm'; detWhats.id = 'det-whats'; detWhats.type = 'button'; detWhats.textContent = 'Enviar no WhatsApp';
document.getElementById('det-copiar').after(detWhats);
detWhats.addEventListener('click', () => abrirWhatsApp(atual));
document.getElementById('det-pdf').addEventListener('click', () => abrirPDF(atual));
document.getElementById('det-cancelar').addEventListener('click', async () => {
  if (!confirm('Cancelar este contrato?')) return;
  const ok = await atualizarContrato(atual.id, { status: 'cancelado', cancelado_em: agora() }, ['rascunho', 'aguardando']);
  telaDetalhe(atual.id);
  if (ok) toast('Contrato cancelado.');
});

/* ---------- PDF: assinado vem do servidor; os outros abrem para "Salvar como PDF" ---------- */
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
    if (!r.ok) return { erro: j.erro || 'Não foi possível concluir (erro ' + r.status + '). Tente de novo.' };
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

/* ---------- financeiro (fase 2) ---------- */
const pegar = id => document.getElementById(id);
let finFiltro = 'todos', finBusca = '';
const hojeMeioDia = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const vencDe = m => new Date(m.vencimento + 'T12:00:00');
const estaAtrasada = m => !m.pago && vencDe(m) < hojeMeioDia();
const diasAtraso = m => Math.round((hojeMeioDia() - vencDe(m)) / 86400000);
const nomeForma = f => f === 'pix' ? 'Pix' : f === 'dinheiro' ? 'Dinheiro' : '—';
const nomeMesAno = m => MESES_LONGO[m.mes - 1] + ' de ' + m.ano;

/* Todas as mensalidades dos contratos assinados, cada uma com o seu contrato */
function todasMensalidades() {
  const out = [];
  DB.contratos.filter(c => c.status === 'assinado').forEach(c => {
    for (let i = 1; i <= 12; i++) { const m = c.mensalidades[i]; if (m) out.push({ c, m }); }
  });
  return out;
}
const acharMens = id => todasMensalidades().find(x => x.m.id === id);
function mensagemCobranca(c, m) {
  return `Olá, ${primeiroNome(c.responsavel.nome)}! Lembrete: a mensalidade de ${MESES_LONGO[m.mes - 1]} do transporte escolar de ${c.crianca.nome} (${fmtBRL(m.valor)}, vencimento ${fmtDia(m.vencimento)}) ainda está em aberto.`;
}

function renderFinanceiro() {
  const todas = todasMensalidades(), hoje = hojeMeioDia(), mesAtual = hojeISO().slice(0, 7);
  let dinheiro = 0, pix = 0, aberto = 0, recMes = 0, valorAtraso = 0;
  const atrasadas = [], proximas = [];
  todas.forEach(({ c, m }) => {
    const v = Number(m.valor);
    if (m.pago) {
      if (m.forma_pagamento === 'pix') pix += v; else dinheiro += v;
      if ((m.pago_em || '').slice(0, 7) === mesAtual) recMes += v;
    } else {
      aberto += v;
      if (estaAtrasada(m)) { atrasadas.push({ c, m }); valorAtraso += v; }
      else { const d = Math.round((vencDe(m) - hoje) / 86400000); if (d >= 0 && d <= 7) proximas.push({ c, m }); }
    }
  });

  /* Cartões */
  pegar('fin-recebido').textContent = fmtBRL(dinheiro + pix);
  pegar('fin-formas').textContent = 'Dinheiro ' + fmtBRL(dinheiro) + ' · Pix ' + fmtBRL(pix);
  pegar('fin-mes').textContent = fmtBRL(recMes);
  pegar('fin-mes-nome').textContent = MESES_LONGO[new Date().getMonth()] + ' de ' + new Date().getFullYear();
  pegar('fin-aberto').textContent = fmtBRL(aberto);
  pegar('fin-atrasados').textContent = atrasadas.length;
  pegar('fin-atrasados-valor').textContent = fmtBRL(valorAtraso);

  /* Próximos vencimentos */
  const avisoProx = pegar('fin-proximos');
  avisoProx.hidden = !proximas.length;
  if (proximas.length) avisoProx.textContent = `${proximas.length} mensalidade(s) vencem nos próximos 7 dias, somando ${fmtBRL(proximas.reduce((s, x) => s + Number(x.m.valor), 0))}.`;

  /* Lista de atrasados (mais antigos primeiro) */
  atrasadas.sort((a, b) => vencDe(a.m) - vencDe(b.m));
  pegar('fin-bloco-atrasos').hidden = !atrasadas.length;
  pegar('fin-atrasos-qtd').textContent = atrasadas.length ? '(' + atrasadas.length + ')' : '';
  pegar('tab-atrasos').innerHTML = atrasadas.map(({ c, m }) => `<tr><td>${esc(c.responsavel.nome)}<small>${esc(c.responsavel.tel)}</small></td><td>${esc(c.crianca.nome)}</td><td>${esc(nomeMesAno(m))}<small>venceu ${fmtDia(m.vencimento)}</small></td><td>${fmtBRL(m.valor)}</td><td><span class="tag atrasado">${diasAtraso(m)} dia(s)</span></td><td><button class="btn sm" data-pag="${m.id}" type="button">Registrar pagamento</button> <button class="btn or sm" data-cobrar="${m.id}" type="button">Cobrar no WhatsApp</button></td></tr>`).join('');

  /* Tabela de 12 meses */
  const assinados = DB.contratos.filter(c => c.status === 'assinado'), b = finBusca.toLowerCase();
  const cs = assinados.filter(c => {
    const temAtraso = Object.values(c.mensalidades).some(estaAtrasada);
    if (finFiltro === 'atraso' && !temAtraso) return false;
    if (finFiltro === 'emdia' && temAtraso) return false;
    return !b || (c.responsavel.nome + ' ' + c.crianca.nome).toLowerCase().includes(b);
  });
  const linhas = cs.map(c => {
    let pagos = 0;
    const cels = MESES.map((nomeMes, i) => {
      const m = c.mensalidades[i + 1];
      if (!m) return `<td><button class="mes" type="button" disabled title="${nomeMes} · mensalidade não criada">·</button></td>`;
      const atr = estaAtrasada(m), pix = m.forma_pagamento === 'pix';
      if (m.pago) pagos++;
      const situacao = m.pago ? 'pago em ' + fmtDia(m.pago_em) + ' · ' + nomeForma(m.forma_pagamento) : atr ? 'atrasado' : 'a vencer';
      const cls = m.pago ? 'pago' + (pix ? ' pix' : '') : atr ? 'atrasado' : '';
      return `<td><button class="mes ${cls}" data-mid="${m.id}" type="button" title="${nomeMes} · ${fmtBRL(m.valor)} · ${situacao}">${m.pago ? (pix ? 'P' : 'D') : ''}</button></td>`;
    }).join('');
    return `<tr><td><button class="linknome" data-extrato="${c.responsavel.id}" type="button">${esc(c.responsavel.nome)}</button><small>${esc(c.crianca.nome)} · ${esc(c.turma)} · ${fmtBRL(c.mensalidade)}</small></td>${cels}<td><b>${pagos}/12</b></td></tr>`;
  });
  const vazio = assinados.length ? 'Nenhum contrato neste filtro.' : 'Nenhum contrato assinado ainda. As mensalidades aparecem aqui depois da assinatura.';
  pegar('tab-fin').innerHTML = linhas.length ? linhas.join('') : `<tr><td colspan="14" class="vazio">${vazio}</td></tr>`;
}

/* Cliques no financeiro */
pegar('tab-fin').addEventListener('click', e => {
  const mes = e.target.closest('button.mes'); if (mes && !mes.disabled) { abrirPagamento(mes.dataset.mid); return; }
  const nome = e.target.closest('button[data-extrato]'); if (nome) abrirExtrato(nome.dataset.extrato);
});
pegar('tab-atrasos').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pag) abrirPagamento(b.dataset.pag);
  if (b.dataset.cobrar) { const x = acharMens(b.dataset.cobrar); if (x) abrirConversa(x.c.responsavel.tel, mensagemCobranca(x.c, x.m)); }
});
document.querySelectorAll('.chip[data-ff]').forEach(ch => ch.addEventListener('click', () => { finFiltro = ch.dataset.ff; document.querySelectorAll('.chip[data-ff]').forEach(x => x.classList.toggle('on', x === ch)); renderFinanceiro(); }));
pegar('fin-busca').addEventListener('input', e => { finBusca = e.target.value; renderFinanceiro(); });
pegar('fin-exportar').addEventListener('click', () => {
  const cab = ['Responsável', 'CPF', 'Criança', 'Turma', 'Mês', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Forma', 'Registrado por'];
  const linhas = todasMensalidades().map(({ c, m }) => [c.responsavel.nome, fmtCPF(c.responsavel.cpf), c.crianca.nome, c.turma, nomeMesAno(m), fmtDia(m.vencimento), Number(m.valor).toFixed(2).replace('.', ','), m.pago ? 'Pago' : estaAtrasada(m) ? 'Atrasado' : 'A vencer', m.pago ? fmtDia(m.pago_em) : '', m.pago ? nomeForma(m.forma_pagamento) : '', m.pago_por_nome || '']);
  baixarCSV('financeiro-2027.csv', cab, linhas);
});

/* Janelinhas (modais) */
function abrirModal(id) { pegar(id).hidden = false; document.body.classList.add('travado'); }
function fecharModais() { document.querySelectorAll('.modal-fundo').forEach(x => { x.hidden = true; }); document.body.classList.remove('travado'); }
document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModais));
document.querySelectorAll('.modal-fundo').forEach(f => f.addEventListener('click', e => { if (e.target === f) fecharModais(); }));
addEventListener('keydown', e => { if (e.key === 'Escape') fecharModais(); });

/* Registrar / desfazer pagamento */
const formPag = pegar('form-pag');
let pagAtual = null;
function abrirPagamento(mid) {
  const x = acharMens(mid); if (!x) return; pagAtual = x;
  const { c, m } = x;
  pegar('pag-titulo').textContent = m.pago ? 'Pagamento registrado' : 'Registrar pagamento';
  pegar('pag-sub').textContent = c.responsavel.nome + ' · ' + c.crianca.nome;
  let info = `<b>${esc(nomeMesAno(m))}</b> · ${fmtBRL(m.valor)} · vencimento ${fmtDia(m.vencimento)}`;
  if (m.mes === 1 && c.vale) info += '<br>Já com o desconto de 20% do vale PV.';
  if (m.pago) info += `<br>Pago em ${fmtDia(m.pago_em)} · ${nomeForma(m.forma_pagamento)}${m.pago_por_nome ? ' · registrado por ' + esc(m.pago_por_nome) : ''}`;
  else if (estaAtrasada(m)) info += `<br><span style="color:var(--red)">Atrasada há ${diasAtraso(m)} dia(s).</span>`;
  pegar('pag-info').innerHTML = info;
  formPag.reset(); formPag.elements.data.value = hojeISO(); formPag.elements.data.max = hojeISO();
  formPag.hidden = m.pago; pegar('pag-pago').hidden = !m.pago; pegar('pag-erro').textContent = '';
  abrirModal('modal-pag');
}
formPag.addEventListener('submit', async e => {
  e.preventDefault(); if (!pagAtual) return;
  const forma = formPag.elements.forma.value, data = formPag.elements.data.value, erro = pegar('pag-erro');
  erro.textContent = '';
  if (!forma) { erro.textContent = 'Escolha dinheiro ou Pix.'; return; }
  if (!data) { erro.textContent = 'Informe a data do pagamento.'; return; }
  if (data > hojeISO()) { erro.textContent = 'A data do pagamento não pode ser no futuro.'; return; }
  const b = pegar('pag-confirmar'); b.disabled = true;
  const { data: res, error } = await sb.from('mensalidades').update({ pago: true, forma_pagamento: forma, pago_em: data }).eq('id', pagAtual.m.id).eq('pago', false).select('id');
  b.disabled = false;
  if (error) { erro.textContent = traduzErro(error); return; }
  fecharModais(); await recarregar(); renderFinanceiro();
  toast(res.length ? 'Pagamento registrado.' : 'Este mês já tinha sido marcado como pago em outro aparelho. A tela foi atualizada.');
});
pegar('pag-desfazer').addEventListener('click', async () => {
  if (!pagAtual || !confirm('Desfazer este pagamento? O mês volta a ficar em aberto.')) return;
  const { error } = await sb.from('mensalidades').update({ pago: false }).eq('id', pagAtual.m.id);
  if (error) { pegar('pag-erro').textContent = traduzErro(error); return; }
  fecharModais(); await recarregar(); renderFinanceiro();
  toast('Pagamento desfeito.');
});

/* Extrato do responsável */
let extratoAtual = null;
function linhasExtrato(cs) {
  const out = [];
  cs.forEach(c => { for (let i = 1; i <= 12; i++) { const m = c.mensalidades[i]; if (m) out.push({ c, m }); } });
  return out;
}
function abrirExtrato(respId) {
  const cs = DB.contratos.filter(c => c.status === 'assinado' && c.responsavel.id === respId); if (!cs.length) return;
  const r = cs[0].responsavel, linhas = linhasExtrato(cs);
  extratoAtual = { r, linhas };
  let pago = 0, abertoV = 0, atrasoV = 0;
  pegar('ext-titulo').textContent = 'Extrato · ' + r.nome;
  pegar('ext-sub').textContent = 'Transporte escolar ' + ANO + ' · CPF ' + fmtCPF(r.cpf);
  pegar('tab-extrato').innerHTML = linhas.map(({ c, m }) => {
    const v = Number(m.valor), atr = estaAtrasada(m);
    if (m.pago) pago += v; else { abertoV += v; if (atr) atrasoV += v; }
    const sit = m.pago ? '<span class="tag pago">Pago</span>' : atr ? '<span class="tag atrasado">Atrasado</span>' : '<span class="tag aberto">A vencer</span>';
    return `<tr><td>${esc(c.crianca.nome)}</td><td>${esc(MESES_LONGO[m.mes - 1])}</td><td>${fmtDia(m.vencimento)}</td><td>${fmtBRL(v)}</td><td>${sit}</td><td>${m.pago ? fmtDia(m.pago_em) : '—'}</td><td>${m.pago ? nomeForma(m.forma_pagamento) : '—'}</td><td>${esc(m.pago_por_nome || '—')}</td></tr>`;
  }).join('');
  extratoAtual.totais = { pago, abertoV, atrasoV };
  pegar('ext-totais').innerHTML = `<span>Pago: <b>${fmtBRL(pago)}</b></span><span>Em aberto: <b>${fmtBRL(abertoV)}</b></span><span>Atrasado: <b style="color:var(--red)">${fmtBRL(atrasoV)}</b></span>`;
  abrirModal('modal-extrato');
}
pegar('ext-imprimir').addEventListener('click', () => {
  if (!extratoAtual) return;
  const { r, linhas, totais } = extratoAtual;
  const w = window.open('', '_blank'); if (!w) { toast('O navegador bloqueou a janela. Permita pop-ups para imprimir.'); return; }
  const corpo = linhas.map(({ c, m }) => `<tr><td>${esc(c.crianca.nome)}</td><td>${esc(MESES_LONGO[m.mes - 1])}</td><td>${fmtDia(m.vencimento)}</td><td>${fmtBRL(m.valor)}</td><td>${m.pago ? 'Pago' : estaAtrasada(m) ? 'Atrasado' : 'A vencer'}</td><td>${m.pago ? fmtDia(m.pago_em) : '—'}</td><td>${m.pago ? nomeForma(m.forma_pagamento) : '—'}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Extrato ${esc(r.nome)} · ${ANO}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#111;font-size:13px}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;color:#666}.tot{margin-top:16px;display:flex;gap:24px}.dica{font-size:12px;color:#666}@media print{.dica{display:none}}</style></head><body><p class="dica">Use Ctrl+P e escolha "Salvar como PDF".</p><h1>Extrato de mensalidades ${ANO}</h1><p>Van Escolar Tia Patrícia e Tio Vitor · Responsável: ${esc(r.nome)} · CPF ${fmtCPF(r.cpf)} · Emitido em ${fmtDia(hojeISO())}</p><table><thead><tr><th>Criança</th><th>Mês</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Pago em</th><th>Forma</th></tr></thead><tbody>${corpo}</tbody></table><div class="tot"><span>Pago: <b>${fmtBRL(totais.pago)}</b></span><span>Em aberto: <b>${fmtBRL(totais.abertoV)}</b></span><span>Atrasado: <b>${fmtBRL(totais.atrasoV)}</b></span></div><script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
  w.document.close();
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
  const pdfs = x.contratos.filter(c => c.assinatura && c.assinatura.pdf).map(c => c.assinatura.pdf);
  let msg = `Apagar o cadastro de ${x.r.nome}?\n\nSerão apagados para sempre: ${x.filhos.size} criança(s) e ${x.contratos.length} contrato(s)`;
  if (assinados) msg += `, sendo ${assinados} ASSINADO(S), junto com o comprovante de assinatura e as mensalidades`;
  if (pdfs.length) msg += ` e ${pdfs.length} PDF(s) assinado(s)`;
  msg += '.\n\nIsso não tem desfazer. Para confirmar, digite APAGAR:';
  const digitado = prompt(msg); if (digitado === null) return;
  if (digitado.trim().toUpperCase() !== 'APAGAR') { toast('Nada foi apagado: a palavra não confere.'); return; }

  // 1º os PDFs: se falhar, o cadastro fica intacto
  if (pdfs.length) {
    const { data: removidos, error: eArq } = await sb.storage.from('contratos').remove(pdfs);
    if (eArq) { toast('Não foi possível apagar o PDF: ' + traduzErro(eArq) + ' Nada foi apagado.'); return; }
    const faltam = pdfs.length - (removidos ? removidos.length : 0);
    if (faltam > 0 && !confirm(`${faltam} PDF(s) não foram encontrados ou não puderam ser apagados.\n\nSe você já apagou esse arquivo à mão no Supabase, pode continuar. Caso contrário, cancele e me avise.\n\nContinuar apagando o cadastro?`)) return;
  }

  // 2º o cadastro (a cascata leva crianças, contratos, assinaturas e mensalidades)
  const { data, error } = await sb.from('responsaveis').delete().eq('id', id).select('id');
  if (error) { toast(traduzErro(error)); return; }
  await recarregar(); renderResponsaveis();
  toast(data.length ? 'Cadastro e arquivos apagados.' : 'Este cadastro já não existia. A tela foi atualizada.');
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