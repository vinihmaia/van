/* =================== VAN PV · painel conectado ao banco (Supabase) ===================
   Os dados ficam no banco. O navegador guarda só a sessão de login.
   A assinatura online usa a Edge Function "assinatura" no Supabase. */
const LUGARES = 23, ANO = 2027; /* LUGARES = lugares por turma */
const DIAS_LEMBRETE = 3;     /* lembrar mensalidades que vencem de hoje até daqui a X dias */
const DIAS_ANIVERSARIO = 7;  /* mostrar aniversários de hoje até daqui a X dias */
const SERIES = ['Pré', '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série do Ensino Médio', '2ª série do Ensino Médio', '3ª série do Ensino Médio'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/* Campos de saúde e segurança da ficha (colunas da tabela "criancas") */
const CAMPOS_SAUDE = ['alergias', 'saude', 'emerg1_nome', 'emerg1_tel', 'emerg2_nome', 'emerg2_tel', 'autorizados'];

/* ---------- link de "esqueci minha senha" ----------
   O link do e-mail chega com "type=recovery" no endereço. Lemos isso ANTES de criar a conexão,
   porque a biblioteca do Supabase limpa o endereço logo em seguida. */
const HASH_INICIAL = location.hash;
const VEIO_RECUPERACAO = /type=recovery/.test(HASH_INICIAL);
const ERRO_LINK = /error_code=/.test(HASH_INICIAL);

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
/* Data N dias antes de uma data "aaaa-mm-dd" (devolve no mesmo formato) */
const diasAntes = (iso, n) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const primeiroNome = s => (s || '').trim().split(' ')[0];
/* Idade em anos completos hoje, a partir de "aaaa-mm-dd" */
function idade(nasc) {
  if (!nasc) return null;
  const [a, m, d] = nasc.split('-').map(Number), h = new Date();
  let i = h.getFullYear() - a;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) i--;
  return i;
}
let tt; function toast(m) { const el = document.getElementById('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200); }
function erroLogin(m) { document.getElementById('erro-login').textContent = m || ''; }
function traduzErro(e) {
  const m = (e && (e.message || String(e))) || 'Erro desconhecido.';
  if (/failed to fetch|networkerror|network request/i.test(m)) return 'Sem conexão com o banco. Confira a internet e tente de novo.';
  if (/jwt|token.*expired/i.test(m)) return 'Sua sessão expirou. Saia e entre de novo.';
  if (/permission denied|row-level security/i.test(m)) return 'Sem permissão para esta ação.';
  if (/mensalidade_paga_completa/i.test(m)) return 'Informe a forma e a data do pagamento.';
  if (/turma_lotada/i.test(m)) return 'A turma lotou enquanto você preenchia: alguém gerou um link agora há pouco. Escolha a outra turma ou salve como rascunho.';
  if (/could not find the .* column|column .* does not exist/i.test(m)) return 'O banco ainda não tem os campos novos. Rode o SQL desta atualização no Supabase.';
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
/* Link tel: para ligar direto do celular */
function telLink(tel) {
  let n = soDigitos(tel);
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return /^55\d{10,11}$/.test(n) ? 'tel:+' + n : (n ? 'tel:' + n : '');
}
/* Devolve true se conseguiu abrir o WhatsApp */
function abrirConversa(tel, msg) {
  const url = linkWa(tel, msg);
  if (!url) { toast('WhatsApp do responsável vazio ou incompleto. Copie a mensagem e envie pelo seu WhatsApp.'); return false; }
  window.open(url, '_blank', 'noopener');
  return true;
}
const abrirWhatsApp = c => abrirConversa(c.responsavel.tel, mensagemWhatsApp(c));
async function copiar(t) {
  const aviso = 'Mensagem copiada. Cole no WhatsApp do responsável.';
  try { await navigator.clipboard.writeText(t); toast(aviso); } catch (e) { prompt('Copie a mensagem:', t); }
}
function irPara(h) { if (location.hash === h) rota(); else location.hash = h; }

/* ---------- estado (o que está carregado na tela) ---------- */
let DB = { contratos: [] }, usuario = null, acessoOk = false, carregado = false, perfil = { nome: '', foto: '' };
const achar = id => DB.contratos.find(c => c.id === id);
function limparEstado() { DB.contratos = []; usuario = null; acessoOk = false; carregado = false; perfil = { nome: '', foto: '' }; atualizarSelo(); }

/* Converte uma linha do banco no formato que as telas usam */
function deBanco(r) {
  const a = Array.isArray(r.assinatura) ? r.assinatura[0] : r.assinatura;
  const resp = r.responsavel || {}, cri = r.crianca || {}, mens = {};
  (r.mensalidades || []).forEach(m => { if (m.ano === ANO) mens[m.mes] = m; });
  return {
    id: r.id, token: r.token, status: r.status, criadoEm: r.criado_em, enviadoEm: r.enviado_em,
    responsavel: { id: resp.id, nome: resp.nome || '', cpf: resp.cpf || '', tel: resp.telefone || '', email: resp.email || '' },
    crianca: {
      id: cri.id, nome: cri.nome || '', serie: cri.serie || '', nascimento: cri.nascimento || null, desce_sozinho: !!cri.desce_sozinho,
      ...Object.fromEntries(CAMPOS_SAUDE.map(k => [k, cri[k] || '']))
    },
    turma: r.turma, endereco: r.endereco || '', bairro: r.bairro || '', mensalidade: Number(r.mensalidade),
    vencimento: r.vencimento, inicio: r.inicio, fim: r.fim, vale: r.vale_desconto, obs: r.observacoes || '',
    assinatura: a ? { nome: a.nome, cpf: a.cpf, em: a.assinado_em, ip: a.ip || '—', hash: a.hash_documento, pdf: a.pdf_caminho } : null,
    mensalidades: mens
  };
}
async function recarregar() {
  const { data, error } = await sb.from('contratos').select(CAMPOS).order('criado_em', { ascending: false });
  if (error) { toast('Erro ao carregar: ' + traduzErro(error)); return false; }
  DB.contratos = data.map(deBanco); carregado = true; atualizarSelo(); return true;
}

/* ---------- filtro de turma e ordem alfabética (vale para todas as abas ao mesmo tempo) ---------- */
let turmaFiltro = ''; /* '' = as duas turmas */
const naTurma = c => !turmaFiltro || c.turma === turmaFiltro;
const porNome = (a, b) => (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' });
const ordemAlfabetica = (a, b) => porNome(a.responsavel.nome, b.responsavel.nome) || porNome(a.crianca.nome, b.crianca.nome);
function redesenharLista() {
  const tela = location.hash.slice(1).split('/')[0];
  if (tela === 'financeiro') renderFinanceiro();
  else if (tela === 'responsaveis') renderResponsaveis();
  else if (tela === 'emergencia') renderEmergencia();
  else renderContratos();
}
document.querySelectorAll('.chip[data-turma]').forEach(ch => ch.addEventListener('click', () => {
  turmaFiltro = ch.dataset.turma;
  document.querySelectorAll('.chip[data-turma]').forEach(x => x.classList.toggle('on', x.dataset.turma === turmaFiltro));
  redesenharLista();
}));

/* ---------- dados e números do contrato (PREENCHER / CONFERIR) ----------
   O CPF da Tia Patrícia NÃO fica aqui, porque este arquivo é público.
   Ele entra só na via que o responsável recebe pelo link de assinatura (montada no servidor). */
const CONTRATADA = {
  nome: 'Patrícia Maia',
  endereco: 'Rua Tomas Sepe, 615, Cotia/SP, CEP 06711-270',
  whatsapp: '(11) 99692-9358',
  email: 'tiapaty_2012@hotmail.com'
};
const MES_RESCISAO = '[MÊS]';     /* PREENCHER: 2º mês em que dá para desistir sem multa (ex.: 'fevereiro'). Mude também na Edge Function. */
const REAJUSTE = 0.10;            /* 10% a cada 6 meses (vale de julho em diante) */
const ESPERA_MIN = 3;             /* minutos que a van espera no ponto */
const DIAS_ATRASO_RESCISAO = 60;  /* atraso no pagamento que permite encerrar o contrato */
const DIAS_RENOVACAO = 30;        /* para garantir a vaga do ano seguinte, avisar até X dias antes do fim do contrato */
const FORO = 'Osasco/SP';

/* ---------- texto do contrato ---------- */
function textoContrato(c, html) {
  const v = s => html ? '<strong>' + esc(s) + '</strong>' : String(s);
  const m1 = Number(c.mensalidade);                          /* janeiro a junho */
  const m2 = Math.round(m1 * (1 + REAJUSTE) * 100) / 100;    /* julho a dezembro (+10%) */
  const total = 6 * m1 + 6 * m2 - (c.vale ? m1 * 0.2 : 0);   /* desconta o vale da 1ª parcela */
  const linhas = [
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE DE ESTUDANTES · ' + ANO, '',
    'IDENTIFICAÇÃO DAS PARTES CONTRATANTES:', '',
    'CONTRATANTE: ' + v(c.responsavel.nome) + ', CPF ' + v(fmtCPF(c.responsavel.cpf)) + ', telefone ' + v(c.responsavel.tel) + ', e-mail ' + v(c.responsavel.email) + ', residente no endereço de embarque indicado abaixo.',
    'CONTRATADA: ' + v(CONTRATADA.nome) + ' (CPF incluído na via de assinatura), residente e domiciliada em ' + v(CONTRATADA.endereco) + ', que presta o serviço com o nome Van Escolar Tia Patrícia e Tio Vitor.',
    'ALUNO(A): ' + v(c.crianca.nome) + ', ' + v(c.crianca.serie) + ', turma da ' + v(c.turma.toLowerCase()) + '.',
    'ENDEREÇO DE EMBARQUE: ' + v(c.endereco) + ', ' + v(c.bairro) + '.', '',
    'Contrato que fazem entre si as partes acima identificadas para a prestação do serviço de transporte coletivo de estudantes porta a porta, sob o regime de fretamento, entre o endereço de embarque e a Fundação Bradesco (Cidade de Deus, Osasco), ida e volta, nos dias letivos, mediante as cláusulas e condições a seguir:', '',

    'Cláusula 1ª – VIGÊNCIA. O presente contrato terá validade de ' + v(fmtDia(c.inicio)) + ' a ' + v(fmtDia(c.fim)) + ' e poderá ser renovado para o ano seguinte, mediante assinatura de novo contrato, se houver interesse das partes.',
    '§ 1º – Este contrato poderá ser rescindido por qualquer das partes durante o primeiro mês de sua assinatura ou durante o mês de ' + v(MES_RESCISAO) + ', sendo devido pelo CONTRATANTE somente o valor proporcional aos dias utilizados.',
    '§ 2º – Fora desses períodos, o CONTRATANTE poderá interromper este contrato mediante o pagamento de multa no valor de 01 (uma) parcela mensal, subsequente à formalização por escrito da rescisão deste contrato.', '',

    'Cláusula 2ª – SEMESTRES. Para efeito de interpretação deste instrumento, considera-se como 1º semestre os meses de fevereiro a junho e como 2º semestre os meses de agosto a dezembro.', '',

    'Cláusula 3ª – VALOR TOTAL. O valor total do presente contrato é de ' + v(fmtBRL(total)) + ', dividido em 12 (doze) parcelas mensais, de janeiro a dezembro. As parcelas dos meses de férias escolares (janeiro e julho) são devidas normalmente, pois a vaga do(a) aluno(a) na van fica reservada durante todo o ano.',
    c.vale ? 'Parágrafo único – VALE DESCONTO PV. Na primeira parcela será aplicado desconto de 20% (vinte por cento), já considerado no valor total acima.' : null, '',

    'Cláusula 4ª – VALOR DA PARCELA. O valor de cada parcela será de ' + v(fmtBRL(m1)) + ' de janeiro a junho e de ' + v(fmtBRL(m2)) + ' de julho a dezembro, já com o reajuste previsto na Cláusula 6ª.',
    '§ 1º – As parcelas vencerão no dia ' + v(c.vencimento) + ' de cada mês e poderão ser pagas em dinheiro ou Pix.',
    '§ 2º – Incidirão multa de 10% (dez por cento) e juros de 1% (um por cento) ao mês sobre as parcelas não pagas na data definida nesta cláusula.', '',

    'Cláusula 5ª – PANDEMIA OU QUARENTENA. Em caso de pandemia, quarentena ou determinação de autoridade pública que suspenda as aulas presenciais e impeça a prestação do serviço, o CONTRATANTE continuará obrigado ao pagamento de 75% (setenta e cinco por cento) do valor da parcela mensal enquanto durar a suspensão. Esse percentual se justifica porque a CONTRATADA mantém custos fixos que não são interrompidos nesse período, em especial as parcelas do financiamento da van escolar, assumido em seu nome.',
    'Parágrafo único – Com a retomada das aulas presenciais, a parcela volta ao valor integral a partir do mês em que o transporte for retomado.', '',

    'Cláusula 6ª – REAJUSTE SEMESTRAL. Em razão dos aumentos de combustível (gasolina) e de pedágio, o valor da parcela é reajustado em 10% (dez por cento) a cada 6 (seis) meses. Neste contrato, o reajuste se aplica a partir da parcela de julho, nos valores já fixados na Cláusula 4ª.', '',

    'Cláusula 7ª – OBRIGAÇÕES DA CONTRATADA. A CONTRATADA se obriga a: (a) manter o veículo com a autorização do órgão municipal competente e com as vistorias exigidas pelo Código de Trânsito Brasileiro em dia; (b) conduzir o veículo com motorista habilitado na forma da lei para o transporte escolar; (c) manter o veículo em boas condições de conservação, limpeza e segurança, com cinto de segurança em todos os assentos; (d) cumprir o roteiro e os horários combinados, ressalvados os imprevistos de trânsito.', '',

    'Cláusula 8ª – ROTEIRO, HORÁRIOS E TEMPO DE ESPERA. A CONTRATADA define o roteiro e os horários de embarque, que poderão ser ajustados ao longo do ano, com aviso prévio ao CONTRATANTE.',
    '§ 1º – O(a) aluno(a) deverá estar pronto(a) no local de embarque no horário combinado. A van aguardará no máximo ' + v(ESPERA_MIN + ' minutos') + '; após esse tempo, seguirá viagem para não atrasar os demais alunos.',
    '§ 2º – A perda do transporte por atraso do(a) aluno(a) não gera desconto na parcela, cabendo ao CONTRATANTE levá-lo(a) à escola por seus próprios meios.', '',

    'Cláusula 9ª – RESPONSABILIDADE. A responsabilidade da CONTRATADA pelo(a) aluno(a) começa no momento do embarque e termina no desembarque, no portão da escola ou no endereço de embarque. A CONTRATADA não responde por fatos ocorridos antes do embarque, depois do desembarque ou dentro da escola.', '',

    'Cláusula 10ª – PESSOAS AUTORIZADAS. Na volta, o(a) aluno(a) somente será entregue ao CONTRATANTE ou às pessoas que ele autorizar por escrito, em lista entregue à CONTRATADA no início do contrato e atualizada sempre que necessário.',
    '§ 1º – Se não houver pessoa autorizada para receber o(a) aluno(a), ele(a) permanecerá na van até o fim do roteiro, e a CONTRATADA entrará em contato com o CONTRATANTE, que deverá buscá-lo(a) no último ponto do roteiro ou em local combinado. Em nenhuma hipótese o(a) aluno(a) será deixado(a) sozinho(a).',
    '§ 2º – O(a) aluno(a) só poderá descer sem ninguém para recebê-lo(a) mediante autorização por escrito do CONTRATANTE, que assume integralmente essa responsabilidade.', '',

    'Cláusula 11ª – SAÚDE. O CONTRATANTE informará por escrito à CONTRATADA as alergias, problemas de saúde e cuidados especiais do(a) aluno(a), além de ao menos dois contatos de emergência, mantendo essas informações atualizadas.',
    'Parágrafo único – A CONTRATADA não administra medicamentos. Em caso de mal-estar ou emergência durante o trajeto, a CONTRATADA comunicará imediatamente o CONTRATANTE e, se necessário, acionará o serviço de emergência (SAMU 192).', '',

    'Cláusula 12ª – IMPREVISTOS COM O VEÍCULO OU O MOTORISTA. Em caso de defeito no veículo, doença do motorista ou outro imprevisto, a CONTRATADA providenciará veículo ou motorista substituto, igualmente habilitado, ou avisará o CONTRATANTE com a maior antecedência possível.', '',

    'Cláusula 13ª – FALTAS E DIAS SEM AULA. O CONTRATANTE avisará pelo WhatsApp, com antecedência, as faltas do(a) aluno(a), inclusive em caso de atestado médico. Faltas, feriados, recessos, greves e outros dias sem aula não geram desconto na parcela, ressalvado o disposto na Cláusula 5ª.',
    'Parágrafo único – Passeios, eventos e aulas fora do calendário regular não estão incluídos neste contrato e poderão ser combinados à parte.', '',

    'Cláusula 14ª – MUDANÇA DE ENDEREÇO. O CONTRATANTE avisará a mudança de endereço com antecedência mínima de 15 (quinze) dias. Se o novo endereço estiver fora do roteiro, a CONTRATADA poderá recusar o atendimento, caso em que o contrato será rescindido sem multa para nenhuma das partes, ou propor novo valor, que só valerá se aceito pelo CONTRATANTE.', '',

    'Cláusula 15ª – COMPORTAMENTO E DANOS. O(a) aluno(a) deverá permanecer sentado(a) e com o cinto de segurança afivelado durante todo o trajeto, e respeitar o motorista, a equipe da van e os colegas.',
    '§ 1º – Os danos causados ao veículo pelo(a) aluno(a) serão ressarcidos pelo CONTRATANTE, mediante comprovação do valor do conserto.',
    '§ 2º – Em caso de comportamento grave ou repetido que coloque em risco a segurança, a CONTRATADA advertirá o CONTRATANTE por escrito; persistindo o problema, poderá rescindir o contrato, sem multa para nenhuma das partes.', '',

    'Cláusula 16ª – OBJETOS PESSOAIS. A CONTRATADA não se responsabiliza por objetos pessoais, celulares ou valores levados pelo(a) aluno(a). Objetos esquecidos na van serão guardados e devolvidos ao CONTRATANTE.', '',

    'Cláusula 17ª – ATRASO NO PAGAMENTO. Havendo atraso superior a ' + v(DIAS_ATRASO_RESCISAO + ' dias') + ' em qualquer parcela, a CONTRATADA poderá rescindir este contrato, mediante aviso por escrito com antecedência mínima de 15 (quinze) dias, sem prejuízo da cobrança dos valores devidos, com a multa e os juros da Cláusula 4ª.',
    'Parágrafo único – A cobrança será sempre feita diretamente ao CONTRATANTE, de forma reservada, nunca ao(à) aluno(a) ou na presença dos colegas.', '',

    'Cláusula 18ª – COMUNICAÇÃO OFICIAL. As comunicações entre as partes, inclusive avisos, advertências e o pedido de rescisão por escrito previsto na Cláusula 1ª, serão válidas quando feitas por WhatsApp ou e-mail, usando os contatos informados neste contrato: os do CONTRATANTE, indicados acima, e os da CONTRATADA, WhatsApp ' + v(CONTRATADA.whatsapp) + ' e e-mail ' + v(CONTRATADA.email) + '. Cada parte deve avisar a outra se mudar de contato.', '',

    'Cláusula 19ª – USO DE IMAGEM. A CONTRATADA não usará fotos ou vídeos do(a) aluno(a) em grupos de mensagens, redes sociais ou materiais de divulgação, salvo autorização específica do CONTRATANTE, dada à parte e por escrito. Essa autorização é opcional, pode ser recusada ou cancelada a qualquer momento e não interfere neste contrato.', '',

    'Cláusula 20ª – RESERVA DE VAGA PARA O ANO SEGUINTE. Os alunos com este contrato terão prioridade na reserva de vaga para o ano seguinte, desde que o CONTRATANTE manifeste interesse com antecedência mínima de ' + v(DIAS_RENOVACAO + ' dias') + ' do término deste contrato, ou seja, até ' + v(fmtDia(diasAntes(c.fim, DIAS_RENOVACAO))) + ', e esteja com as parcelas em dia. Após essa data, a vaga poderá ser oferecida a outros interessados. A renovação depende de novo contrato, conforme a Cláusula 1ª.', '',

    'Cláusula 21ª – OUTRAS CONDIÇÕES. ' + v(c.obs || '—'), '',

    'Cláusula 22ª – FORO. Fica eleito o foro da comarca de ' + v(FORO) + ' para resolver as questões decorrentes deste contrato.', '',
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
  if (tela === 'nova-senha') { mostrar('tela-nova-senha'); prepararNovaSenha(); window.scrollTo(0, 0); return; }
  if (!acessoOk) {
    const { data, error } = await sb.from('usuarios_painel').select('id').eq('id', usuario.id).maybeSingle();
    if (error) { mostrar('tela-login'); erroLogin(traduzErro(error)); return; }
    if (!data) { await sb.auth.signOut(); limparEstado(); mostrar('tela-login'); erroLogin('Este login não tem acesso ao painel.'); return; }
    acessoOk = true;
    await carregarPerfil();
  }
  mostrar('app');
  renderPerfil();
  const grupo = (tela === 'novo' || tela === 'contrato') ? 'contratos' : tela;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === grupo));
  const mapa = { contratos: 'tela-contratos', novo: 'tela-novo', contrato: 'tela-detalhe', financeiro: 'tela-financeiro', responsaveis: 'tela-responsaveis', emergencia: 'tela-emergencia' };
  const alvo = mapa[tela] || 'tela-contratos';
  document.querySelectorAll('#app .screen').forEach(s => s.classList.toggle('active', s.id === alvo));
  const listas = ['tela-contratos', 'tela-financeiro', 'tela-responsaveis', 'tela-emergencia'];
  if (!carregado) carregando();
  if (!carregado || listas.includes(alvo)) { if (!(await recarregar())) return; }
  if (alvo === 'tela-contratos') renderContratos();
  if (alvo === 'tela-novo') telaNovo(param);
  if (alvo === 'tela-detalhe') telaDetalhe(param);
  if (alvo === 'tela-financeiro') renderFinanceiro();
  if (alvo === 'tela-responsaveis') renderResponsaveis();
  if (alvo === 'tela-emergencia') renderEmergencia();
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
document.getElementById('sair').addEventListener('click', async () => { await sb.auth.signOut(); limparEstado(); modoRecuperar(false); irPara('#login'); });

/* ---------- esqueci minha senha ---------- */
function modoRecuperar(sim) {
  document.getElementById('form-login').hidden = sim;
  document.getElementById('form-recuperar').hidden = !sim;
  document.getElementById('login-titulo').textContent = sim ? 'Recuperar senha' : 'Entrar no painel';
  document.getElementById('erro-rec').textContent = '';
  document.getElementById('rec-ok').hidden = true;
  if (sim) { erroLogin(''); document.getElementById('rec-email').value = document.getElementById('login-email').value; document.getElementById('rec-btn').disabled = false; }
}
document.getElementById('esqueci').addEventListener('click', () => modoRecuperar(true));
document.getElementById('rec-voltar').addEventListener('click', () => modoRecuperar(false));
document.getElementById('form-recuperar').addEventListener('submit', async e => {
  e.preventDefault(); if (!sb) return;
  const email = document.getElementById('rec-email').value.trim(), btn = document.getElementById('rec-btn'), erro = document.getElementById('erro-rec'), ok = document.getElementById('rec-ok');
  if (!email) return;
  erro.textContent = ''; ok.hidden = true; btn.disabled = true; btn.textContent = 'Enviando…';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  btn.textContent = 'Enviar link';
  if (error) {
    btn.disabled = false;
    erro.textContent = /rate limit|seconds|too many/i.test(error.message) ? 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.' : traduzErro(error);
    return;
  }
  ok.textContent = 'Se este e-mail tiver acesso ao painel, você vai receber um link em alguns minutos. Confira também o lixo eletrônico (spam).';
  ok.hidden = false;
  setTimeout(() => { btn.disabled = false; }, 60000);
});

/* ---------- criar nova senha (pelo link do e-mail ou pelo "Trocar senha") ---------- */
function prepararNovaSenha() {
  document.getElementById('form-nova-senha').reset();
  document.getElementById('erro-ns').textContent = '';
  const b = document.getElementById('ns-btn'); b.disabled = false; b.textContent = 'Salvar nova senha';
}
document.getElementById('form-nova-senha').addEventListener('submit', async e => {
  e.preventDefault();
  const s1 = document.getElementById('ns-senha').value, s2 = document.getElementById('ns-senha2').value, erro = document.getElementById('erro-ns'), btn = document.getElementById('ns-btn');
  erro.textContent = '';
  if (s1.length < 8) { erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
  if (s1 !== s2) { erro.textContent = 'As duas senhas não são iguais.'; return; }
  btn.disabled = true; btn.textContent = 'Salvando…';
  const { error } = await sb.auth.updateUser({ password: s1 });
  btn.disabled = false; btn.textContent = 'Salvar nova senha';
  if (error) {
    const m = error.message || '';
    erro.textContent = /different|same/i.test(m) ? 'A nova senha precisa ser diferente da atual.'
      : /weak|short|least|characters/i.test(m) ? 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
      : /reauthentic|nonce/i.test(m) ? 'Por segurança, saia e entre de novo antes de trocar a senha.'
      : traduzErro(error);
    return;
  }
  prepararNovaSenha();
  toast('Senha alterada.');
  irPara('#contratos');
});

/* ---------- lugares por turma (automático) ----------
   Ocupa lugar: contrato ASSINADO ou AGUARDANDO assinatura (a vaga fica reservada).
   Rascunho e cancelado não ocupam: cancelou, o lugar volta na hora. */
function ocupacao(turma, ignorarId) {
  const cs = DB.contratos.filter(c => c.turma === turma && c.id !== ignorarId);
  const assinados = cs.filter(c => c.status === 'assinado').length;
  const aguardando = cs.filter(c => c.status === 'aguardando').length;
  return { assinados, aguardando, ocupados: assinados + aguardando, livres: Math.max(LUGARES - assinados - aguardando, 0) };
}
/* Devolve uma mensagem de erro se a turma estiver lotada (ou '' se tiver vaga) */
function erroLotada(turma, ignorarId) {
  if (ocupacao(turma, ignorarId).livres > 0) return '';
  return `A turma da ${turma.toLowerCase()} está lotada (${LUGARES} de ${LUGARES} lugares). Escolha a outra turma, salve como rascunho ou cancele um contrato que não vai ser assinado.`;
}

/* ---------- contratos: lista ---------- */
let filtro = 'todos', busca = '';
const rotulo = c => ({ assinado: 'Assinado ' + fmtData(c.assinatura && c.assinatura.em), aguardando: 'Aguardando assinatura', rascunho: 'Rascunho', cancelado: 'Cancelado' })[c.status];
function renderContratos() {
  const cs = DB.contratos.filter(naTurma), n = s => cs.filter(c => c.status === s).length;
  document.getElementById('st-assinado').textContent = n('assinado');
  document.getElementById('st-aguardando').textContent = n('aguardando');
  document.getElementById('st-rascunho').textContent = n('rascunho');
  /* Cartão de lugares: sempre mostra as duas turmas, com ou sem filtro */
  const om = ocupacao('Manhã'), ot = ocupacao('Tarde'), stV = document.getElementById('st-vagas');
  stV.textContent = `M ${om.ocupados}/${LUGARES} · T ${ot.ocupados}/${LUGARES}`;
  stV.className = (!om.livres || !ot.livres) ? 'warn' : '';
  const reservados = om.aguardando + ot.aguardando;
  document.getElementById('st-vagas-det').textContent = `Livres: manhã ${om.livres} · tarde ${ot.livres}` + (reservados ? ` · ${reservados} reservado(s) aguardando assinatura` : '');
  const b = busca.toLowerCase();
  const lista = cs.filter(c => (filtro === 'todos' || c.status === filtro) && (!b || (c.responsavel.nome + ' ' + c.crianca.nome + ' ' + c.bairro).toLowerCase().includes(b))).sort(ordemAlfabetica);
  const acao = c => c.status === 'aguardando' ? `<button class="btn or sm" data-whats="${c.id}" type="button">WhatsApp</button> <button class="btn ghost sm" data-copiar="${c.id}" type="button">Copiar mensagem</button>` : c.status === 'assinado' ? `<button class="btn ghost sm" data-pdf="${c.id}" type="button">PDF</button>` : c.status === 'rascunho' ? `<button class="btn ghost sm" data-editar="${c.id}" type="button">Editar</button>` : '';
  const vazio = DB.contratos.length ? 'Nenhum contrato aqui.' : 'Nenhum contrato ainda. Clique em "+ Novo contrato" para começar.';
  document.getElementById('tab-contratos').innerHTML = lista.length ? lista.map(c => `<tr class="clicavel" data-id="${c.id}"><td>${esc(c.responsavel.nome)}<small>${esc(c.responsavel.tel)}</small></td><td>${esc(c.crianca.nome)}<small>${esc(c.crianca.serie)}</small></td><td>${esc(c.turma)}</td><td>${fmtBRL(c.mensalidade)}</td><td><span class="tag ${c.status}">${rotulo(c)}</span></td><td style="white-space:nowrap">${acao(c)}</td></tr>`).join('') : `<tr><td colspan="6" class="vazio">${vazio}</td></tr>`;
  renderAniversarios();
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
/* Mostra as vagas livres nos botões da turma: "Manhã (20 livres)" */
function mostrarVagasNoForm(ignorarId) {
  formC.querySelectorAll('input[name=turma]').forEach(inp => { inp.parentElement.lastChild.textContent = `${inp.value} (${ocupacao(inp.value, ignorarId).livres} livres)`; });
}
function telaNovo(id) {
  formC.reset(); document.getElementById('erro-contrato').textContent = '';
  formC.elements.id.value = ''; formC.elements.inicio.value = '2027-01-01'; formC.elements.fim.value = '2027-12-31'; formC.elements.vencimento.value = 10;
  document.getElementById('novo-titulo').textContent = id ? 'Editar contrato' : 'Novo contrato';
  mostrarVagasNoForm(id || null);
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
  const d = lerForm(), erroEl = document.getElementById('erro-contrato');
  /* Rascunho pode ser salvo mesmo com a turma lotada (lista de espera); gerar link, não */
  const erro = validar(d) || (status === 'aguardando' ? erroLotada(d.turma, formC.elements.id.value || null) : '');
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
  const k = c.crianca, anos = idade(k.nascimento);
  document.getElementById('det-titulo').textContent = c.responsavel.nome + ' · ' + k.nome;
  document.getElementById('det-status').innerHTML = `<span class="tag ${c.status}">${rotulo(c)}</span>`;
  const kv = [['Responsável', c.responsavel.nome], ['CPF', fmtCPF(c.responsavel.cpf)], ['WhatsApp', c.responsavel.tel], ['E-mail', c.responsavel.email], ['Criança', k.nome], ['Série em 2027', k.serie], ['Nascimento', k.nascimento ? fmtDia(k.nascimento) + (anos !== null ? ' · ' + anos + ' anos' : '') : '—'], ['Turma', c.turma], ['Endereço', c.endereco + (c.bairro ? ', ' + c.bairro : '')], ['Mensalidade', fmtBRL(c.mensalidade) + ' · vence dia ' + c.vencimento], ['Vigência', fmtDia(c.inicio) + ' a ' + fmtDia(c.fim)], ['Vale desconto PV', c.vale ? 'Sim, 20% na 1ª mensalidade' : 'Não'], ['Observações', c.obs || '—']];
  document.getElementById('det-kv').innerHTML = kv.map(([chave, v]) => `<dt>${chave}</dt><dd>${esc(v)}</dd>`).join('');
  const temLink = c.status === 'aguardando' || c.status === 'assinado';
  document.getElementById('det-linkbox').hidden = !temLink; document.getElementById('det-link').value = temLink ? linkAssinatura(c) : '';
  const a = c.assinatura;
  const passos = [['Rascunho criado', fmtData(c.criadoEm, true), true], ['Link de assinatura gerado', c.enviadoEm ? fmtData(c.enviadoEm, true) : 'ainda não', !!c.enviadoEm], ['Assinado pelo responsável', a ? `${a.nome} · CPF ${fmtCPF(a.cpf)} · ${fmtData(a.em, true)} · IP ${a.ip} · impressão digital ${a.hash}` : 'ainda não', !!a]];
  if (c.status === 'cancelado') passos.push(['Contrato cancelado', '', true]);
  let marcouAtual = false;
  document.getElementById('det-tl').innerHTML = passos.map(([t, s, feito], i) => { const cls = feito ? 'feito' : (!marcouAtual ? (marcouAtual = true, 'atual') : ''); return `<li class="${cls}"><i>${feito ? '✓' : i + 1}</i><div>${t}<small>${esc(s)}</small></div></li>`; }).join('');
  const mostra = (id, sim) => { document.getElementById(id).hidden = !sim; };
  const ativo = c.status === 'aguardando' || c.status === 'assinado';
  mostra('det-gerar', c.status === 'rascunho'); mostra('det-editar', c.status === 'rascunho'); mostra('det-copiar', c.status === 'aguardando'); mostra('det-whats', c.status === 'aguardando'); mostra('det-pdf', c.status !== 'rascunho'); mostra('det-cancelar', c.status === 'rascunho' || c.status === 'aguardando');
  mostra('det-ficha', ativo); mostra('det-emerg', ativo); mostra('det-mapa', !!c.endereco);
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
  const lotada = erroLotada(atual.turma, atual.id); if (lotada) { toast(lotada); return; }
  const b = e.currentTarget; b.disabled = true;
  const ok = await atualizarContrato(atual.id, { status: 'aguardando', enviado_em: atual.enviadoEm || agora() }, ['rascunho']);
  b.disabled = false; telaDetalhe(atual.id);
  if (ok) toast('Link gerado. Clique em "Enviar no WhatsApp".');
});
document.getElementById('det-editar').addEventListener('click', () => irPara('#novo/' + atual.id));
document.getElementById('det-copiar').addEventListener('click', () => copiar(mensagemWhatsApp(atual)));
document.getElementById('det-whats').addEventListener('click', () => abrirWhatsApp(atual));
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

/* ---------- financeiro ---------- */
const pegar = id => document.getElementById(id);
let finFiltro = 'todos', finBusca = '';
const hojeMeioDia = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const vencDe = m => new Date(m.vencimento + 'T12:00:00');
const estaAtrasada = m => !m.pago && vencDe(m) < hojeMeioDia();
const diasAtraso = m => Math.round((hojeMeioDia() - vencDe(m)) / 86400000);
const diasAte = m => Math.round((vencDe(m) - hojeMeioDia()) / 86400000);
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

/* ---------- lembretes de vencimento ---------- */
/* Mensalidades não pagas que vencem de hoje até daqui a DIAS_LEMBRETE dias */
const lembretesJanela = () => todasMensalidades().filter(({ m }) => { if (m.pago) return false; const d = diasAte(m); return d >= 0 && d <= DIAS_LEMBRETE; });
function mensagemLembrete(c, m) {
  return `Olá, ${primeiroNome(c.responsavel.nome)}! Lembrete: a mensalidade de ${MESES_LONGO[m.mes - 1]} do transporte escolar de ${c.crianca.nome} (${fmtBRL(m.valor)}) vence em ${fmtDia(m.vencimento).slice(0, 5)}. Se já pagou, desconsidere esta mensagem.`;
}
/* Número de lembretes pendentes ao lado do nome da aba "Financeiro" (conta as duas turmas) */
function atualizarSelo() {
  const aba = document.querySelector('.tabs a[data-tab="financeiro"]'); if (!aba) return;
  const n = DB.contratos.length ? lembretesJanela().filter(({ m }) => !m.lembrete_em).length : 0;
  aba.textContent = 'Financeiro' + (n ? ` (${n})` : '');
}
/* O bloco "Lembretes de hoje" está no index.html; aqui só preenchemos o número de dias */
pegar('fin-dias-lembrete').textContent = DIAS_LEMBRETE;

/* ---------- recibo de pagamento ---------- */
/* Número do recibo: ano-mês-6 primeiros caracteres do código da mensalidade (único e fixo) */
const numeroRecibo = m => `${m.ano}-${String(m.mes).padStart(2, '0')}-${String(m.id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
const formaFrase = f => f === 'pix' ? 'via Pix' : 'em dinheiro';
/* Valor por extenso em reais (ex.: 384 → "trezentos e oitenta e quatro reais") */
function porExtenso(valor) {
  const un = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dez = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const cen = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, partes = [];
    if (c) partes.push(cen[c]);
    if (r) partes.push(r < 20 ? un[r] : dez[Math.floor(r / 10)] + (r % 10 ? ' e ' + un[r % 10] : ''));
    return partes.join(' e ');
  };
  const total = Math.round(Number(valor) * 100), inteiro = Math.floor(total / 100), cent = total % 100;
  const mil = Math.floor(inteiro / 1000), resto = inteiro % 1000;
  let reais = '';
  if (mil) reais = mil === 1 ? 'mil' : ate999(mil) + ' mil';
  if (resto) reais += (reais ? ((resto < 100 || resto % 100 === 0) ? ' e ' : ' ') : '') + ate999(resto);
  const partes = [];
  if (inteiro) partes.push(reais + (inteiro === 1 ? ' real' : ' reais'));
  if (cent) partes.push(ate999(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return partes.join(' e ') || 'zero reais';
}
function mensagemRecibo(c, m) {
  return `Olá, ${primeiroNome(c.responsavel.nome)}! Recebemos o pagamento da mensalidade de ${nomeMesAno(m)} do transporte escolar de ${c.crianca.nome}: ${fmtBRL(m.valor)}, pago em ${fmtDia(m.pago_em)} ${formaFrase(m.forma_pagamento)}. Recibo nº ${numeroRecibo(m)}. Obrigado!`;
}
function imprimirRecibo(c, m) {
  const w = window.open('', '_blank'); if (!w) { toast('O navegador bloqueou a janela. Permita pop-ups para imprimir.'); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Recibo ${numeroRecibo(m)}</title><style>body{font-family:Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#111;font-size:14px;line-height:1.7}.caixa{border:1.5px solid #333;border-radius:8px;padding:28px 30px}h1{font-size:18px;margin:0 0 4px;letter-spacing:.04em}.valor{font-size:20px;font-weight:bold;margin:0 0 18px}p{margin:0 0 14px}.rodape{margin-top:28px;border-top:1px solid #ccc;padding-top:12px;font-size:12.5px;color:#444}.dica{font-size:12px;color:#666;margin-bottom:16px}@media print{.dica{display:none}}</style></head><body><p class="dica">Use Ctrl+P e escolha "Salvar como PDF".</p><div class="caixa"><h1>RECIBO Nº ${numeroRecibo(m)}</h1><p class="valor">${fmtBRL(m.valor)}</p><p>Recebemos de <b>${esc(c.responsavel.nome)}</b>, CPF ${fmtCPF(c.responsavel.cpf)}, a importância de <b>${fmtBRL(m.valor)} (${porExtenso(m.valor)})</b>, referente à mensalidade de <b>${esc(nomeMesAno(m))}</b> do serviço de transporte escolar de <b>${esc(c.crianca.nome)}</b>, paga em <b>${fmtDia(m.pago_em)}</b> ${formaFrase(m.forma_pagamento)}.</p><div class="rodape">Van Escolar Tia Patrícia e Tio Vitor<br>${m.pago_por_nome ? 'Registrado por: ' + esc(m.pago_por_nome) + ' · ' : ''}Emitido em ${fmtDia(hojeISO())}</div></div><script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
  w.document.close();
}

/* ---------- gráfico mês a mês (esperado x recebido, dinheiro e Pix) ---------- */
const abrevBRL = v => v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: v >= 10000 ? 0 : 1 }) + ' mil' : 'R$ ' + Math.round(v);
function renderGrafico(todas) {
  const card = pegar('fin-grafico-card');
  card.hidden = !todas.length; if (!todas.length) return;
  const meses = MESES.map(() => ({ esperado: 0, pix: 0, dinheiro: 0 }));
  todas.forEach(({ m }) => {
    const x = meses[m.mes - 1]; if (!x) return;
    const v = Number(m.valor) || 0;
    x.esperado += v;
    if (m.pago) { if (m.forma_pagamento === 'pix') x.pix += v; else x.dinheiro += v; }
  });
  const W = 720, H = 250, topo = 14, base = 196, esq = 64, dir = 8;
  const max = Math.max(1, ...meses.map(x => Math.max(x.esperado, x.pix + x.dinheiro)));
  const larg = (W - esq - dir) / 12, barra = Math.min(34, larg * 0.6);
  const y = v => base - (v / max) * (base - topo);
  const mesAtual = new Date().getFullYear() === ANO ? new Date().getMonth() : -1;
  const f1 = n => n.toFixed(1);
  let s = '';
  [0, max / 2, max].forEach(v => { s += `<line class="g-linha" x1="${esq}" x2="${W - dir}" y1="${f1(y(v))}" y2="${f1(y(v))}"/><text class="g-eixo" x="${esq - 8}" y="${f1(y(v) + 4)}" text-anchor="end">${abrevBRL(v)}</text>`; });
  meses.forEach((x, i) => {
    const cx = esq + i * larg + (larg - barra) / 2, meio = cx + barra / 2, rec = x.pix + x.dinheiro;
    s += `<g><title>${MESES_LONGO[i]}: esperado ${fmtBRL(x.esperado)} · recebido ${fmtBRL(rec)} (dinheiro ${fmtBRL(x.dinheiro)} · Pix ${fmtBRL(x.pix)})</title>`;
    s += `<rect class="g-esperado" x="${f1(cx)}" y="${f1(y(x.esperado))}" width="${f1(barra)}" height="${f1(base - y(x.esperado))}" rx="4"/>`;
    s += `<rect class="g-dinheiro" x="${f1(cx)}" y="${f1(y(x.dinheiro))}" width="${f1(barra)}" height="${f1(base - y(x.dinheiro))}"/>`;
    s += `<rect class="g-pix" x="${f1(cx)}" y="${f1(y(rec))}" width="${f1(barra)}" height="${f1(y(x.dinheiro) - y(rec))}"/>`;
    s += `<rect x="${f1(esq + i * larg)}" y="${topo}" width="${f1(larg)}" height="${H - topo}" fill="transparent"/></g>`;
    s += `<text class="g-eixo${i === mesAtual ? ' g-atual' : ''}" x="${f1(meio)}" y="${base + 18}" text-anchor="middle">${MESES[i]}</text>`;
    if (x.esperado) s += `<text class="g-pct" x="${f1(meio)}" y="${base + 36}" text-anchor="middle">${Math.round(rec / x.esperado * 100)}%</text>`;
  });
  pegar('fin-grafico').innerHTML = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Recebido e esperado por mês">${s}</svg>`;
}

function renderFinanceiro() {
  const todas = todasMensalidades().filter(({ c }) => naTurma(c)), hoje = hojeMeioDia(), mesAtual = hojeISO().slice(0, 7);
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

  /* Gráfico mês a mês */
  renderGrafico(todas);

  /* Lembretes de hoje (pendentes primeiro, depois os já lembrados) */
  const lemb = lembretesJanela().filter(({ c }) => naTurma(c)).sort((a, b) => (!!a.m.lembrete_em - !!b.m.lembrete_em) || (vencDe(a.m) - vencDe(b.m)));
  const pendentes = lemb.filter(({ m }) => !m.lembrete_em).length;
  pegar('fin-bloco-lembretes').hidden = !lemb.length;
  pegar('fin-lembretes-qtd').textContent = lemb.length ? (pendentes ? `(${pendentes} para enviar)` : '(todos lembrados)') : '';
  pegar('tab-lembretes').innerHTML = lemb.map(({ c, m }) => {
    const d = diasAte(m), quando = d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`;
    const acao = m.lembrete_em
      ? `<span class="tag aberto">Lembrado ${fmtData(m.lembrete_em)}${m.lembrete_por_nome ? ' por ' + esc(m.lembrete_por_nome) : ''}</span> <button class="btn ghost sm" data-lembrar="${m.id}" type="button">Lembrar de novo</button>`
      : `<button class="btn or sm" data-lembrar="${m.id}" type="button">Lembrar no WhatsApp</button>`;
    return `<tr><td>${esc(c.responsavel.nome)}<small>${esc(c.responsavel.tel)}</small></td><td>${esc(c.crianca.nome)}</td><td>${esc(nomeMesAno(m))}</td><td>${fmtBRL(m.valor)}</td><td>${quando}<small>${fmtDia(m.vencimento)}</small></td><td>${acao}</td></tr>`;
  }).join('');

  /* Próximos vencimentos */
  const avisoProx = pegar('fin-proximos');
  avisoProx.hidden = !proximas.length;
  if (proximas.length) avisoProx.textContent = `${proximas.length} mensalidade(s) vencem nos próximos 7 dias, somando ${fmtBRL(proximas.reduce((s, x) => s + Number(x.m.valor), 0))}.`;

  /* Lista de atrasados (mais antigos primeiro) */
  atrasadas.sort((a, b) => vencDe(a.m) - vencDe(b.m));
  pegar('fin-bloco-atrasos').hidden = !atrasadas.length;
  pegar('fin-atrasos-qtd').textContent = atrasadas.length ? '(' + atrasadas.length + ')' : '';
  pegar('tab-atrasos').innerHTML = atrasadas.map(({ c, m }) => `<tr><td>${esc(c.responsavel.nome)}<small>${esc(c.responsavel.tel)}</small></td><td>${esc(c.crianca.nome)}</td><td>${esc(nomeMesAno(m))}<small>venceu ${fmtDia(m.vencimento)}</small></td><td>${fmtBRL(m.valor)}</td><td><span class="tag atrasado">${diasAtraso(m)} dia(s)</span></td><td><button class="btn sm" data-pag="${m.id}" type="button">Registrar pagamento</button> <button class="btn or sm" data-cobrar="${m.id}" type="button">Cobrar no WhatsApp</button></td></tr>`).join('');

  /* Tabela de 12 meses (ordem alfabética pelo responsável) */
  const assinados = DB.contratos.filter(c => c.status === 'assinado' && naTurma(c)), b = finBusca.toLowerCase();
  const cs = assinados.filter(c => {
    const temAtraso = Object.values(c.mensalidades).some(estaAtrasada);
    if (finFiltro === 'atraso' && !temAtraso) return false;
    if (finFiltro === 'emdia' && temAtraso) return false;
    return !b || (c.responsavel.nome + ' ' + c.crianca.nome).toLowerCase().includes(b);
  });
  const linhas = cs.sort(ordemAlfabetica).map(c => {
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
  const vazio = DB.contratos.some(c => c.status === 'assinado') ? 'Nenhum contrato neste filtro.' : 'Nenhum contrato assinado ainda. As mensalidades aparecem aqui depois da assinatura.';
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
pegar('tab-lembretes').addEventListener('click', async e => {
  const b = e.target.closest('button[data-lembrar]'); if (!b) return;
  const x = acharMens(b.dataset.lembrar); if (!x) return;
  if (!abrirConversa(x.c.responsavel.tel, mensagemLembrete(x.c, x.m))) return; /* sem WhatsApp válido, não marca */
  b.disabled = true;
  const { error } = await sb.from('mensalidades').update({ lembrete_em: agora() }).eq('id', x.m.id);
  if (error) { b.disabled = false; toast('O WhatsApp abriu, mas não consegui marcar como lembrado: ' + traduzErro(error)); return; }
  await recarregar(); renderFinanceiro();
  toast('Marcado como lembrado.');
});
document.querySelectorAll('.chip[data-ff]').forEach(ch => ch.addEventListener('click', () => { finFiltro = ch.dataset.ff; document.querySelectorAll('.chip[data-ff]').forEach(x => x.classList.toggle('on', x === ch)); renderFinanceiro(); }));
pegar('fin-busca').addEventListener('input', e => { finBusca = e.target.value; renderFinanceiro(); });
pegar('fin-exportar').addEventListener('click', () => {
  const cab = ['Responsável', 'CPF', 'Criança', 'Turma', 'Mês', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Forma', 'Registrado por', 'Recibo'];
  const linhas = todasMensalidades().map(({ c, m }) => [c.responsavel.nome, fmtCPF(c.responsavel.cpf), c.crianca.nome, c.turma, nomeMesAno(m), fmtDia(m.vencimento), Number(m.valor).toFixed(2).replace('.', ','), m.pago ? 'Pago' : estaAtrasada(m) ? 'Atrasado' : 'A vencer', m.pago ? fmtDia(m.pago_em) : '', m.pago ? nomeForma(m.forma_pagamento) : '', m.pago ? (m.pago_por_nome || '') : '', m.pago ? numeroRecibo(m) : '']);
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
/* Botões do recibo (estão no index.html, na área de "já pago") */
pegar('recibo-wa').addEventListener('click', () => { const x = pagAtual && acharMens(pagAtual.m.id); if (x && x.m.pago) abrirConversa(x.c.responsavel.tel, mensagemRecibo(x.c, x.m)); });
pegar('recibo-imp').addEventListener('click', () => { const x = pagAtual && acharMens(pagAtual.m.id); if (x && x.m.pago) imprimirRecibo(x.c, x.m); });

function abrirPagamento(mid) {
  const x = acharMens(mid); if (!x) return; pagAtual = x;
  const { c, m } = x;
  pegar('pag-titulo').textContent = m.pago ? 'Pagamento registrado' : 'Registrar pagamento';
  pegar('pag-sub').textContent = c.responsavel.nome + ' · ' + c.crianca.nome;
  let info = `<b>${esc(nomeMesAno(m))}</b> · ${fmtBRL(m.valor)} · vencimento ${fmtDia(m.vencimento)}`;
  if (m.mes === 1 && c.vale) info += '<br>Já com o desconto de 20% do vale PV.';
  if (m.pago) info += `<br>Pago em ${fmtDia(m.pago_em)} · ${nomeForma(m.forma_pagamento)}${m.pago_por_nome ? ' · registrado por ' + esc(m.pago_por_nome) : ''}<br>Recibo nº ${numeroRecibo(m)}`;
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
  const mid = pagAtual.m.id;
  const { data: res, error } = await sb.from('mensalidades').update({ pago: true, forma_pagamento: forma, pago_em: data }).eq('id', mid).eq('pago', false).select('id');
  b.disabled = false;
  if (error) { erro.textContent = traduzErro(error); return; }
  await recarregar(); renderFinanceiro();
  if (!res.length) { fecharModais(); toast('Este mês já tinha sido marcado como pago em outro aparelho. A tela foi atualizada.'); return; }
  abrirPagamento(mid); /* reabre já no modo "pago", com os botões do recibo */
  toast('Pagamento registrado. Se quiser, envie ou imprima o recibo.');
});
pegar('pag-desfazer').addEventListener('click', async () => {
  if (!pagAtual || !confirm('Desfazer este pagamento? O mês volta a ficar em aberto.')) return;
  const { error } = await sb.from('mensalidades').update({ pago: false, forma_pagamento: null, pago_em: null }).eq('id', pagAtual.m.id);
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
    return `<tr><td>${esc(c.crianca.nome)}</td><td>${esc(MESES_LONGO[m.mes - 1])}</td><td>${fmtDia(m.vencimento)}</td><td>${fmtBRL(v)}</td><td>${sit}</td><td>${m.pago ? fmtDia(m.pago_em) : '—'}</td><td>${m.pago ? nomeForma(m.forma_pagamento) : '—'}</td><td>${m.pago ? esc(m.pago_por_nome || '—') : '—'}</td></tr>`;
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
  const lista = Object.values(agruparResponsaveis())
    .map(x => ({ ...x, contratos: x.contratos.filter(naTurma).sort((a, b) => porNome(a.crianca.nome, b.crianca.nome)) }))
    .filter(x => x.contratos.length)
    .sort((a, b) => porNome(a.r.nome, b.r.nome));
  const linha = c => {
    const ativo = c.status === 'aguardando' || c.status === 'assinado';
    const acoes = [
      c.endereco ? `<button class="link" data-mapa="${c.id}" type="button">Ver no mapa</button>` : '',
      ativo ? `<button class="link" data-ficha="${c.id}" type="button">Editar ficha</button>` : '',
      ativo ? `<button class="link" data-emerg="${c.id}" type="button">Emergência</button>` : ''
    ].filter(Boolean).join(' · ');
    const end = c.endereco ? c.endereco + (c.bairro ? ', ' + c.bairro : '') : 'Sem endereço de embarque';
    return `<div class="filho"><button class="linknome" data-contrato="${c.id}" type="button">${esc(c.crianca.nome)}</button> · ${esc(c.turma)} <span class="tag ${c.status}">${nomeStatus[c.status] || c.status}</span><small>${esc(end)}${acoes ? ' · ' + acoes : ''}</small></div>`;
  };
  const vazio = DB.contratos.length ? 'Nenhum responsável nesta turma.' : 'Nenhum responsável cadastrado.';
  document.getElementById('tab-resp').innerHTML = lista.length ? lista.map(x => `<tr><td>${esc(x.r.nome)}<small>CPF ${fmtCPF(x.r.cpf)}</small></td><td>${esc(x.r.tel)}<small>${esc(x.r.email)}</small></td><td>${x.contratos.map(linha).join('')}</td><td><button class="link" data-apagar="${x.r.id}" type="button">Apagar cadastro</button></td></tr>`).join('') : `<tr><td colspan="4" class="vazio">${vazio}</td></tr>`;
}
document.getElementById('tab-resp').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.apagar) apagarResponsavel(b.dataset.apagar);
  if (b.dataset.contrato) irPara('#contrato/' + b.dataset.contrato);
  if (b.dataset.ficha) { const c = achar(b.dataset.ficha); if (c) abrirFicha(c); }
  if (b.dataset.emerg) abrirEmergencia(b.dataset.emerg);
  if (b.dataset.mapa) abrirMapa(b.dataset.mapa);
});
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

/* ---------- mapa do endereço de embarque ----------
   Nada aqui precisa de chave ou cadastro. O mapa embutido é um recurso do Google
   que funciona há anos sem chave, mas não é oficial; se um dia parar, os dois botões continuam valendo. */
const REGIAO_MAPA = 'SP'; /* vai no fim do endereço para o mapa procurar no lugar certo */
const enderecoCompleto = c => [c.endereco, c.bairro, REGIAO_MAPA].filter(Boolean).join(', ');
function abrirMapa(id) {
  const c = achar(id); if (!c || !c.endereco) { toast('Este contrato não tem endereço de embarque.'); return; }
  const end = enderecoCompleto(c), q = encodeURIComponent(end);
  pegar('mapa-titulo').textContent = c.crianca.nome + ' · ' + c.turma;
  pegar('mapa-sub').textContent = end;
  pegar('mapa-frame').src = 'https://www.google.com/maps?q=' + q + '&output=embed';
  pegar('mapa-google').href = 'https://www.google.com/maps/search/?api=1&query=' + q;
  pegar('mapa-waze').href = 'https://waze.com/ul?q=' + q + '&navigate=yes';
  abrirModal('modal-mapa');
}

/* ---------- ficha da criança: dados do dia a dia + saúde e segurança ----------
   Edita só o que não muda o acordo. Valor, vencimento, vigência, nome e CPF
   do responsável ficam travados, porque são o que foi assinado. */
const formFicha = pegar('form-ficha');
let fichaAtual = null;
SERIES.forEach(s => { const o = document.createElement('option'); o.textContent = s; formFicha.elements.serie.appendChild(o); });
function abrirFicha(c) {
  fichaAtual = c;
  const f = formFicha.elements, k = c.crianca;
  pegar('ficha-sub').textContent = k.nome + ' · ' + nomeStatus[c.status];
  pegar('ficha-info').innerHTML =
    `Responsável: <b>${esc(c.responsavel.nome)}</b> · CPF ${fmtCPF(c.responsavel.cpf)}<br>` +
    `Mensalidade ${fmtBRL(c.mensalidade)} · vence dia ${esc(c.vencimento)} · vigência ${fmtDia(c.inicio)} a ${fmtDia(c.fim)}<br>` +
    `<small style="color:var(--mu2)">Esses dados fazem parte do contrato e não mudam por aqui.` +
    (c.status === 'assinado' ? ' O PDF assinado também não muda.' : '') +
    ' WhatsApp e e-mail valem para todos os contratos deste responsável.</small>';
  f.crianca.value = k.nome; f.serie.value = k.serie; f.turma.value = c.turma;
  f.endereco.value = c.endereco; f.bairro.value = c.bairro; f.tel.value = c.responsavel.tel; f.email.value = c.responsavel.email;
  f.nascimento.value = k.nascimento || ''; f.nascimento.max = hojeISO();
  CAMPOS_SAUDE.forEach(campo => { f[campo].value = k[campo] || ''; });
  f.desce_sozinho.checked = !!k.desce_sozinho;
  pegar('ficha-erro').textContent = '';
  abrirModal('modal-ficha');
}
document.getElementById('det-ficha').addEventListener('click', () => abrirFicha(atual));
document.getElementById('det-mapa').addEventListener('click', () => abrirMapa(atual.id));
formFicha.addEventListener('submit', async e => {
  e.preventDefault(); if (!fichaAtual) return;
  const c = fichaAtual, k = c.crianca, f = formFicha.elements, erro = pegar('ficha-erro'), btn = pegar('ficha-salvar');
  const n = { crianca: f.crianca.value.trim(), serie: f.serie.value, turma: f.turma.value, endereco: f.endereco.value.trim(), bairro: f.bairro.value.trim(), tel: f.tel.value.trim(), email: f.email.value.trim() };
  const novaCrianca = { nome: n.crianca, serie: n.serie, nascimento: f.nascimento.value || null, desce_sozinho: f.desce_sozinho.checked };
  CAMPOS_SAUDE.forEach(campo => { novaCrianca[campo] = f[campo].value.trim() || null; });
  erro.textContent = '';
  if (!n.crianca || !n.serie || !n.turma || !n.email) { erro.textContent = 'Preencha nome, série, turma e e-mail.'; return; }
  if (novaCrianca.nascimento && novaCrianca.nascimento > hojeISO()) { erro.textContent = 'A data de nascimento não pode ser no futuro.'; return; }
  if (n.turma !== c.turma) { const lotada = erroLotada(n.turma, c.id); if (lotada) { erro.textContent = lotada; return; } }
  /* Só grava as tabelas que mudaram */
  const passos = [];
  if (n.turma !== c.turma || n.endereco !== c.endereco || n.bairro !== c.bairro)
    passos.push(() => sb.from('contratos').update({ turma: n.turma, endereco: n.endereco, bairro: n.bairro }).eq('id', c.id).in('status', ['aguardando', 'assinado']).select('id'));
  const valorAntigo = campo => campo === 'desce_sozinho' ? !!k.desce_sozinho : k[campo];
  if (Object.keys(novaCrianca).some(campo => String(novaCrianca[campo] ?? '') !== String(valorAntigo(campo) ?? '')))
    passos.push(() => sb.from('criancas').update(novaCrianca).eq('id', k.id).select('id'));
  if (n.tel !== c.responsavel.tel || n.email !== c.responsavel.email)
    passos.push(() => sb.from('responsaveis').update({ telefone: n.tel, email: n.email }).eq('id', c.responsavel.id).select('id'));
  if (!passos.length) { fecharModais(); toast('Nada mudou.'); return; }
  btn.disabled = true;
  let falha = '';
  for (const passo of passos) {
    const { data, error } = await passo();
    if (error) { falha = traduzErro(error); break; }
    if (!data.length) { falha = 'O banco não deixou salvar (o registro mudou em outro aparelho ou falta permissão).'; break; }
  }
  btn.disabled = false;
  await recarregar();
  if (falha) { erro.textContent = falha + (passos.length > 1 ? ' Parte das mudanças pode ter sido salva; confira depois de fechar.' : ''); return; }
  fecharModais();
  if (location.hash.startsWith('#contrato/')) telaDetalhe(c.id); else redesenharLista();
  toast('Ficha atualizada.');
});

/* ---------- emergência: saúde, contatos e quem pode buscar ---------- */
let emergBusca = '', emergAtual = null;
/* Crianças com contrato ativo (assinado ou aguardando), uma vez cada */
function criancasAtivas() {
  const porCrianca = new Map();
  DB.contratos.filter(c => (c.status === 'assinado' || c.status === 'aguardando') && naTurma(c)).forEach(c => {
    const ja = porCrianca.get(c.crianca.id);
    if (!ja || (ja.status !== 'assinado' && c.status === 'assinado')) porCrianca.set(c.crianca.id, c);
  });
  return [...porCrianca.values()];
}
const semContatoEmerg = k => !soDigitos(k.emerg1_tel) && !soDigitos(k.emerg2_tel);
function renderEmergencia() {
  const termo = emergBusca.toLowerCase(), todas = criancasAtivas();
  const lista = todas.filter(c => !termo || (c.crianca.nome + ' ' + c.responsavel.nome).toLowerCase().includes(termo)).sort((a, b) => porNome(a.crianca.nome, b.crianca.nome));
  const faltam = todas.filter(c => semContatoEmerg(c.crianca)).length, aviso = pegar('emerg-pendentes');
  aviso.hidden = !faltam;
  aviso.textContent = faltam ? `${faltam} criança(s) sem contato de emergência cadastrado. O contrato pede pelo menos dois (Cláusula 11): preencha em "Editar ficha".` : '';
  pegar('emerg-lista').innerHTML = lista.length ? lista.map(c => {
    const k = c.crianca, anos = idade(k.nascimento);
    const tags = [k.alergias ? '<span class="tag atrasado">Alergia</span>' : '', k.saude ? '<span class="tag aguardando">Cuidados de saúde</span>' : '', semContatoEmerg(k) ? '<span class="tag aberto">Sem contato de emergência</span>' : ''].filter(Boolean).join('');
    return `<button class="emerg-item" data-emerg="${c.id}" type="button"><b>${esc(k.nome)}</b><small>${esc(c.turma)} · ${esc(k.serie)}${anos !== null ? ' · ' + anos + ' anos' : ''}</small>${tags ? `<span class="emerg-tags">${tags}</span>` : ''}</button>`;
  }).join('') : `<p class="vazio">${DB.contratos.length ? 'Nenhuma criança encontrada.' : 'Nenhum contrato ainda.'}</p>`;
}
pegar('emerg-lista').addEventListener('click', e => { const b = e.target.closest('[data-emerg]'); if (b) abrirEmergencia(b.dataset.emerg); });
pegar('emerg-busca').addEventListener('input', e => { emergBusca = e.target.value; renderEmergencia(); });
function botoesContato(numero) {
  const tel = telLink(numero), wa = linkWa(numero, '');
  return (tel ? `<a class="btn sm" href="${tel}">Ligar</a>` : '') + (wa ? `<a class="btn ghost sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : '');
}
function linhaContato(titulo, nome, numero) {
  if (!nome && !soDigitos(numero)) return '';
  return `<div class="emerg-contato"><div><b>${esc(nome || '—')}</b><small>${esc(titulo)}${numero ? ' · ' + esc(numero) : ''}</small></div><div class="acoes">${botoesContato(numero)}</div></div>`;
}
function abrirEmergencia(id) {
  const c = achar(id); if (!c) return;
  emergAtual = c;
  const k = c.crianca, anos = idade(k.nascimento);
  pegar('emerg-titulo').textContent = k.nome;
  pegar('emerg-sub').textContent = ['Turma da ' + String(c.turma || '').toLowerCase(), k.serie, anos !== null ? anos + ' anos' : '', k.nascimento ? 'nasc. ' + fmtDia(k.nascimento) : ''].filter(Boolean).join(' · ');
  const contatos = linhaContato('Responsável', c.responsavel.nome, c.responsavel.tel) + linhaContato('Contato de emergência 1', k.emerg1_nome, k.emerg1_tel) + linhaContato('Contato de emergência 2', k.emerg2_nome, k.emerg2_tel);
  const end = c.endereco ? c.endereco + (c.bairro ? ', ' + c.bairro : '') : '';
  pegar('emerg-corpo').innerHTML =
    `<div class="emerg-bloco${k.alergias ? ' alerta-saude' : ''}"><span class="emerg-rot">Alergias</span><p>${k.alergias ? esc(k.alergias) : '<i>Nenhuma informada</i>'}</p></div>` +
    `<div class="emerg-bloco${k.saude ? ' atencao-saude' : ''}"><span class="emerg-rot">Saúde e cuidados especiais</span><p>${k.saude ? esc(k.saude) : '<i>Nada informado</i>'}</p></div>` +
    `<div class="emerg-bloco"><span class="emerg-rot">Ligar para</span>${contatos}${semContatoEmerg(k) ? '<p class="nao-desce">Nenhum contato de emergência cadastrado. Preencha em "Editar ficha".</p>' : ''}</div>` +
    `<div class="emerg-bloco"><span class="emerg-rot">Quem pode buscar na volta</span><p>${k.autorizados ? esc(k.autorizados) : '<i>Só o responsável (nenhuma outra pessoa cadastrada)</i>'}</p>` +
    `<p class="${k.desce_sozinho ? '' : 'nao-desce'}">${k.desce_sozinho ? 'Tem autorização por escrito para descer sem ninguém esperando.' : 'NÃO pode descer sem ninguém esperando. Se não houver quem receba, fica na van e o responsável é avisado (Cláusula 10).'}</p></div>` +
    `<div class="emerg-bloco"><span class="emerg-rot">Endereço de embarque</span><p>${esc(end || '—')}</p>${c.endereco ? '<button class="link" data-emerg-mapa type="button">Ver no mapa</button>' : ''}</div>`;
  abrirModal('modal-emerg');
}
pegar('emerg-corpo').addEventListener('click', e => {
  if (!e.target.closest('[data-emerg-mapa]') || !emergAtual) return;
  const id = emergAtual.id; fecharModais(); abrirMapa(id);
});
pegar('emerg-ficha').addEventListener('click', () => {
  if (!emergAtual) return;
  const c = achar(emergAtual.id); fecharModais(); if (c) abrirFicha(c);
});
document.getElementById('det-emerg').addEventListener('click', () => abrirEmergencia(atual.id));

/* ---------- aniversários (aviso no topo de Contratos) ---------- */
/* Dias até o próximo aniversário (0 = hoje). Quem nasceu em 29/02 comemora em 28/02 nos anos comuns. */
function diasAteAniversario(nasc) {
  if (!nasc) return null;
  const [, m, d] = nasc.split('-').map(Number), hoje = hojeMeioDia();
  const noAno = y => { const bissexto = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; return new Date(y, m - 1, (m === 2 && d === 29 && !bissexto) ? 28 : d, 12); };
  let prox = noAno(hoje.getFullYear());
  if (prox < hoje) prox = noAno(hoje.getFullYear() + 1);
  return Math.round((prox - hoje) / 86400000);
}
function mensagemParabens(c) {
  return `Olá, ${primeiroNome(c.responsavel.nome)}! Hoje é aniversário de ${primeiroNome(c.crianca.nome)} 🎉 A equipe da Van Escolar Tia Patrícia e Tio Vitor deseja um dia muito feliz, cheio de alegria e carinho! 🎂`;
}
const chaveParabens = c => 'van-parabens-' + hojeISO() + '-' + c.crianca.id;
function renderAniversarios() {
  const el = pegar('aniversarios'), vistos = new Set(), lista = [];
  DB.contratos.filter(c => (c.status === 'assinado' || c.status === 'aguardando') && c.crianca.nascimento).forEach(c => {
    if (vistos.has(c.crianca.id)) return; vistos.add(c.crianca.id);
    const d = diasAteAniversario(c.crianca.nascimento);
    if (d !== null && d <= DIAS_ANIVERSARIO) lista.push({ c, d });
  });
  lista.sort((a, b) => a.d - b.d || porNome(a.c.crianca.nome, b.c.crianca.nome));
  el.hidden = !lista.length;
  el.innerHTML = lista.map(({ c, d }) => {
    const k = c.crianca, anos = (idade(k.nascimento) ?? 0) + (d === 0 ? 0 : 1);
    if (d > 0) return `<div class="aniver-linha"><span>🎈 Aniversário de <b>${esc(k.nome)}</b> ${d === 1 ? 'amanhã' : 'em ' + d + ' dias'} (${fmtDia(k.nascimento).slice(0, 5)}) · vai fazer ${anos} anos</span></div>`;
    let enviado = false; try { enviado = !!localStorage.getItem(chaveParabens(c)); } catch (e) { /* sem armazenamento */ }
    return `<div class="aniver-linha"><span>🎂 Hoje é aniversário de <b>${esc(k.nome)}</b> · faz ${anos} anos <small>· ${esc(c.turma)} · resp. ${esc(c.responsavel.nome)}</small></span>` +
      (enviado ? '<span class="tag pago">Parabéns enviado</span>' : `<button class="btn or sm" data-parabens="${c.id}" type="button">Mandar parabéns no WhatsApp</button>`) + '</div>';
  }).join('');
}
pegar('aniversarios').addEventListener('click', e => {
  const b = e.target.closest('button[data-parabens]'); if (!b) return;
  const c = achar(b.dataset.parabens); if (!c) return;
  if (!abrirConversa(c.responsavel.tel, mensagemParabens(c))) return;
  try { localStorage.setItem(chaveParabens(c), '1'); } catch (err) { /* sem armazenamento */ }
  renderAniversarios();
});

/* ---------- perfil (nome e foto na barra do topo) ----------
   Nome e foto ficam na tabela usuarios_painel (colunas "nome" e "foto"). */
const nomeDoEmail = email => {
  const parte = (email || '').split('@')[0].split(/[._\-+]/)[0].replace(/\d+/g, '');
  return parte ? parte[0].toUpperCase() + parte.slice(1) : '';
};
const meuNome = () => perfil.nome || nomeDoEmail(usuario && usuario.email);
const iniciais = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
function pintarAvatar(el, nome, foto) {
  el.style.backgroundImage = foto ? `url(${foto})` : '';
  el.textContent = foto ? '' : iniciais(nome);
}
async function carregarPerfil() {
  perfil = { nome: '', foto: '' };
  const { data, error } = await sb.from('usuarios_painel').select('nome, foto').eq('id', usuario.id).maybeSingle();
  if (error) { console.warn('Perfil ainda não configurado no banco (rode o SQL do perfil):', error.message); return; }
  if (data) perfil = { nome: data.nome || '', foto: data.foto || '' };
}
function renderPerfil() {
  if (!usuario) return;
  const nome = meuNome();
  document.getElementById('perfil-ola').textContent = nome ? 'Olá, ' + nome : 'Olá!';
  document.getElementById('menu-nome').textContent = nome || '—';
  document.getElementById('menu-email').textContent = usuario.email;
  pintarAvatar(document.getElementById('perfil-avatar'), nome, perfil.foto);
}

/* Menu que abre no clique do nome */
const perfilBtn = document.getElementById('perfil-btn'), perfilMenu = document.getElementById('perfil-menu');
function fecharMenu() { perfilMenu.hidden = true; perfilBtn.setAttribute('aria-expanded', 'false'); }
perfilBtn.addEventListener('click', e => { e.stopPropagation(); perfilMenu.hidden = !perfilMenu.hidden; perfilBtn.setAttribute('aria-expanded', String(!perfilMenu.hidden)); });
perfilMenu.addEventListener('click', e => { if (e.target.closest('a,button')) fecharMenu(); });
addEventListener('click', e => { if (!perfilMenu.hidden && !perfilMenu.contains(e.target)) fecharMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenu(); });
addEventListener('hashchange', fecharMenu);

/* Janela "Editar perfil" */
const formPerfil = document.getElementById('form-perfil');
let fotoNova = null; /* null = não mexeu · '' = remover · 'data:…' = foto nova */
const previewPerfil = () => pintarAvatar(document.getElementById('perfil-preview'), formPerfil.elements.nome.value.trim() || meuNome(), fotoNova === null ? perfil.foto : fotoNova);
function abrirPerfil() {
  fotoNova = null;
  formPerfil.elements.nome.value = perfil.nome;
  formPerfil.elements.nome.placeholder = nomeDoEmail(usuario.email) || 'Seu nome';
  document.getElementById('perfil-foto').value = '';
  document.getElementById('perfil-erro').textContent = '';
  previewPerfil();
  abrirModal('modal-perfil');
}
document.getElementById('menu-editar').addEventListener('click', abrirPerfil);
formPerfil.elements.nome.addEventListener('input', previewPerfil);
/* Corta a imagem em quadrado, reduz para 96 px e devolve como texto (data URL) */
function reduzirFoto(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(arquivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const T = 96, lado = Math.min(img.width, img.height), cv = document.createElement('canvas');
      cv.width = cv.height = T;
      cv.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, T, T);
      resolve(cv.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem. Tente um JPG ou PNG.')); };
    img.src = url;
  });
}
document.getElementById('perfil-foto').addEventListener('change', async e => {
  const arq = e.target.files[0]; if (!arq) return;
  const erro = document.getElementById('perfil-erro'); erro.textContent = '';
  try { fotoNova = await reduzirFoto(arq); previewPerfil(); }
  catch (err) { erro.textContent = err.message; }
});
document.getElementById('perfil-remover').addEventListener('click', () => { fotoNova = ''; document.getElementById('perfil-foto').value = ''; previewPerfil(); });
formPerfil.addEventListener('submit', async e => {
  e.preventDefault();
  const nome = formPerfil.elements.nome.value.trim(), erro = document.getElementById('perfil-erro'), btn = document.getElementById('perfil-salvar');
  const dados = { nome };
  if (fotoNova !== null) dados.foto = fotoNova || null;
  erro.textContent = ''; btn.disabled = true; btn.textContent = 'Salvando…';
  const { data, error } = await sb.from('usuarios_painel').update(dados).eq('id', usuario.id).select('nome, foto');
  btn.disabled = false; btn.textContent = 'Salvar';
  if (error) { erro.textContent = /column|coluna/i.test(error.message) ? 'O banco ainda não tem as colunas do perfil. Rode o SQL do perfil no Supabase.' : traduzErro(error); return; }
  if (!data.length) { erro.textContent = 'O banco não deixou salvar. Falta a regra de permissão do perfil (está no SQL do perfil).'; return; }
  perfil = { nome: data[0].nome || '', foto: data[0].foto || '' };
  renderPerfil(); fecharModais(); toast('Perfil salvo.');
});

/* ---------- tema claro / escuro (escolha guardada neste aparelho) ---------- */
const MQ_ESCURO = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const NOMES_TEMA = { auto: 'automático', escuro: 'escuro', claro: 'claro' };
function temaEscolhido() { try { const t = localStorage.getItem('van-tema'); return NOMES_TEMA[t] ? t : 'auto'; } catch (e) { return 'auto'; } }
function aplicarTema() {
  const t = temaEscolhido(), naAssinatura = location.hash.startsWith('#assinar');
  const escuro = !naAssinatura && (t === 'escuro' || (t === 'auto' && !!MQ_ESCURO && MQ_ESCURO.matches));
  if (escuro) document.documentElement.setAttribute('data-tema', 'escuro'); else document.documentElement.removeAttribute('data-tema');
  document.getElementById('menu-tema').textContent = 'Tema: ' + NOMES_TEMA[t];
}
document.getElementById('menu-tema').addEventListener('click', () => {
  const ordem = ['auto', 'escuro', 'claro'], prox = ordem[(ordem.indexOf(temaEscolhido()) + 1) % ordem.length];
  try { localStorage.setItem('van-tema', prox); } catch (e) { /* sem armazenamento: vale só agora */ }
  aplicarTema();
  toast(prox === 'auto' ? 'Tema automático: segue o modo claro/escuro do aparelho.' : 'Tema ' + NOMES_TEMA[prox] + '.');
});
if (MQ_ESCURO && MQ_ESCURO.addEventListener) MQ_ESCURO.addEventListener('change', aplicarTema);
addEventListener('hashchange', aplicarTema);
aplicarTema();

/* ---------- início ---------- */
async function iniciar() {
  if (sb) {
    const { data } = await sb.auth.getSession();
    usuario = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT') { limparEstado(); setTimeout(rota, 0); }
      else if (evento === 'PASSWORD_RECOVERY' && sessao) { usuario = sessao.user; setTimeout(() => irPara('#nova-senha'), 0); }
      else if (sessao) usuario = sessao.user;
    });
    /* Chegou pelo link do e-mail: vai direto para "Criar nova senha" */
    if (VEIO_RECUPERACAO && usuario) history.replaceState(null, '', location.pathname + '#nova-senha');
    else if (ERRO_LINK) {
      history.replaceState(null, '', location.pathname + '#login');
      erroLogin('O link para criar nova senha expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
    }
  }
  rota();
}
iniciar();