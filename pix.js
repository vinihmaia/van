/* =================== VAN PV · Pix "copia e cola" nas cobranças ===================
   Gera o código Pix (padrão do Banco Central) com o valor exato da mensalidade
   e coloca no fim das mensagens de LEMBRETE e de COBRANÇA do WhatsApp.
   A chave fica no banco (tabela pix_config, só a equipe vê), nunca neste arquivo público.
   Usa as ferramentas do app.js. Se este arquivo der erro, o painel continua funcionando. */
(function () {
  const acts = document.querySelector('#tela-financeiro .head .acts'); if (!acts) return;

  const css = document.createElement('style');
  css.textContent = '.pix-cod{display:block;width:100%;min-height:84px;margin:8px 0;font:12px ui-monospace,Menlo,Consolas,monospace;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--card);color:var(--tx);word-break:break-all;resize:none}';
  document.head.appendChild(css);

  const MSG_SQL = 'Falta criar a tabela do Pix no banco: rode o SQL do Pix no Supabase.';
  const tabelaFalta = e => /pix_config|does not exist|schema cache/i.test((e && e.message) || '');
  const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const soTexto = (s, max) => semAcento(s).replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const DICAS = {
    aleatoria: 'A chave aleatória tem 32 letras e números, separados por 4 tracinhos.',
    celular: 'Use DDD + número, ex.: (11) 99999-9999.',
    email: 'Confira se o e-mail está completo.',
    cpf: 'O CPF tem 11 números.',
    cnpj: 'O CNPJ tem 14 números.'
  };

  /* Deixa a chave no formato que o Pix exige */
  function normalizarChave(tipo, ch) {
    ch = String(ch || '').trim();
    if (tipo === 'cpf') { const d = soDigitos(ch); return d.length === 11 ? d : null; }
    if (tipo === 'cnpj') { const d = soDigitos(ch); return d.length === 14 ? d : null; }
    if (tipo === 'celular') { let d = soDigitos(ch); if (d.length === 10 || d.length === 11) d = '55' + d; return /^55\d{10,11}$/.test(d) ? '+' + d : null; }
    if (tipo === 'email') { ch = ch.toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ch) && ch.length <= 77 ? ch : null; }
    ch = ch.toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ch) ? ch : null;
  }

  /* ---------- código Pix "copia e cola" (BR Code do Banco Central) ---------- */
  const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function crc16(s) {
    let crc = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  function codigoPix(c, valor, info) {
    const base = campo('00', 'br.gov.bcb.pix') + campo('01', c.chave);
    const cabe = 99 - base.length - 4; /* o bloco da conta tem no máximo 99 caracteres */
    const desc = info && cabe > 0 ? soTexto(info, cabe) : '';
    const conta = base + (desc ? campo('02', desc) : '');
    const s = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986') +
      (valor > 0 ? campo('54', Number(valor).toFixed(2)) : '') +
      campo('58', 'BR') + campo('59', c.nome) + campo('60', c.cidade) + campo('62', campo('05', '***')) + '6304';
    return s + crc16(s);
  }

  /* ---------- configuração guardada no banco ---------- */
  let cfg = null, dono = null, erroCfg = '';
  async function carregarCfg(forcar) {
    const logado = typeof usuario !== 'undefined' && usuario && typeof acessoOk !== 'undefined' && acessoOk;
    if (!logado) { cfg = null; dono = null; return; }
    if (!forcar && dono === usuario.id) return;
    dono = usuario.id;
    const { data, error } = await sb.from('pix_config').select('*').eq('id', 1).maybeSingle();
    if (error) { cfg = null; erroCfg = tabelaFalta(error) ? MSG_SQL : traduzErro(error); return; }
    cfg = data; erroCfg = '';
  }
  setInterval(carregarCfg, 3000);
  carregarCfg();

  /* ---------- acrescenta o Pix no fim das mensagens de lembrete e de cobrança ---------- */
  function textoPix(c, m) {
    if (!cfg || !cfg.ativo) return '';
    const cod = codigoPix(cfg, Number(m.valor), `Van ${MESES[m.mes - 1]} ${primeiroNome(c.crianca.nome)}`);
    return `\n\nPara pagar com Pix: copie o código abaixo e cole no app do banco, em "Pix copia e cola". O valor (${fmtBRL(m.valor)}) já vem preenchido.\n\n${cod}`;
  }
  ['mensagemCobranca', 'mensagemLembrete'].forEach(nome => {
    const original = window[nome];
    if (typeof original === 'function') window[nome] = (c, m) => original(c, m) + textoPix(c, m);
  });

  /* ---------- botão e janela "Configurar Pix" ---------- */
  const botao = document.createElement('button');
  botao.className = 'btn ghost'; botao.type = 'button'; botao.textContent = 'Configurar Pix';
  acts.prepend(botao);

  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo'; fundo.id = 'modal-pix'; fundo.hidden = true;
  fundo.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="pix-titulo">' +
      '<h2 id="pix-titulo">Pix nas cobranças</h2>' +
      '<p class="sub">Com isto preenchido, os lembretes e as cobranças no WhatsApp já vão com o código Pix "copia e cola" no valor certo da mensalidade.</p>' +
      '<form id="pix-form">' +
        '<label class="campo">Tipo da chave<select name="tipo"><option value="aleatoria">Chave aleatória</option><option value="celular">Celular</option><option value="email">E-mail</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option></select></label>' +
        '<label class="campo" style="margin-top:12px">Chave Pix<input name="chave" required autocomplete="off"></label>' +
        '<label class="campo" style="margin-top:12px">Nome de quem recebe<input name="nome" maxlength="25" required placeholder="Ex.: Patricia Maia"></label>' +
        '<label class="campo" style="margin-top:12px">Cidade<input name="cidade" maxlength="15" required placeholder="Ex.: Cotia"></label>' +
        '<label class="check" style="margin-top:12px"><input type="checkbox" name="ativo" checked>Colocar o Pix nas mensagens de lembrete e cobrança</label>' +
        '<p class="erro" id="pix-erro"></p>' +
        '<div class="info" id="pix-teste" hidden style="margin-top:12px"></div>' +
        '<div class="facts"><button class="btn ghost" type="button" data-pix-fechar>Fechar</button><button class="btn ghost" type="button" id="pix-testar">Testar (R$ 1,00)</button><button class="btn" type="submit" id="pix-salvar">Salvar</button></div>' +
      '</form>' +
    '</div>';
  document.body.appendChild(fundo);
  const $p = id => document.getElementById(id), form = $p('pix-form');

  function lerForm() {
    const f = form.elements, erro = $p('pix-erro');
    erro.textContent = '';
    const chave = normalizarChave(f.tipo.value, f.chave.value);
    if (!chave) { erro.textContent = 'Chave inválida para o tipo escolhido. ' + DICAS[f.tipo.value]; return null; }
    const nome = soTexto(f.nome.value, 25), cidade = soTexto(f.cidade.value, 15);
    if (!nome) { erro.textContent = 'Preencha o nome de quem recebe.'; return null; }
    if (!cidade) { erro.textContent = 'Preencha a cidade.'; return null; }
    return { tipo: f.tipo.value, chave, nome, cidade, ativo: f.ativo.checked };
  }

  botao.addEventListener('click', async () => {
    form.reset(); $p('pix-erro').textContent = ''; $p('pix-teste').hidden = true;
    abrirModal('modal-pix');
    await carregarCfg(true);
    if (erroCfg) { $p('pix-erro').textContent = erroCfg; return; }
    if (cfg) {
      const f = form.elements;
      f.tipo.value = cfg.tipo; f.chave.value = cfg.chave; f.nome.value = cfg.nome; f.cidade.value = cfg.cidade; f.ativo.checked = !!cfg.ativo;
    }
  });

  $p('pix-testar').addEventListener('click', () => {
    const c = lerForm(); if (!c) return;
    const cod = codigoPix(c, 1, 'Teste Van PV');
    const caixa = $p('pix-teste');
    caixa.hidden = false;
    caixa.innerHTML = '<b>Código de teste (R$ 1,00)</b><textarea class="pix-cod" readonly>' + esc(cod) + '</textarea>' +
      '<button class="btn sm" type="button" id="pix-copiar">Copiar código</button>' +
      '<p class="sub" style="margin-top:8px">Cole no app do banco em "Pix copia e cola" e confira se aparecem o nome certo e R$ 1,00. Depois é só cancelar.</p>';
    $p('pix-copiar').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cod); toast('Código copiado.'); } catch (e) { prompt('Copie o código:', cod); }
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const c = lerForm(); if (!c) return;
    const b = $p('pix-salvar'); b.disabled = true;
    const { data, error } = await sb.from('pix_config').upsert({ id: 1, ...c, atualizado_em: new Date().toISOString() }).select('id');
    b.disabled = false;
    if (error) { $p('pix-erro').textContent = tabelaFalta(error) ? MSG_SQL : traduzErro(error); return; }
    if (!data.length) { $p('pix-erro').textContent = 'O banco não deixou salvar (falta permissão).'; return; }
    cfg = { id: 1, ...c }; erroCfg = '';
    fecharModais();
    toast(c.ativo ? 'Pix salvo. Lembretes e cobranças já vão com o código.' : 'Pix salvo, mas desligado nas mensagens.');
  });

  fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('[data-pix-fechar]')) fecharModais(); });
})();