/* =================== VAN PV · comunicado para as famílias ===================
   Você escreve a mensagem uma vez; cada toque abre o WhatsApp de uma família
   com o texto pronto, e você aperta "enviar" lá. Nada é enviado sozinho
   (o WhatsApp bloqueia números que disparam mensagens em massa).
   Usa as ferramentas do app.js. Se este arquivo der erro, o painel continua funcionando. */
(function () {
  const acts = document.querySelector('#tela-responsaveis .head .acts'); if (!acts) return;

  /* Estilo desta parte */
  const css = document.createElement('style');
  css.textContent =
    '.com-lista{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px;max-height:46vh;overflow:auto}' +
    '.com-item{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:14px}' +
    '.com-item small{display:block;color:var(--mu2);font-size:12.5px;margin-top:2px}' +
    '.com-item.feito{opacity:.55}' +
    '.com-prog{font-weight:600;font-size:14px;margin:12px 0 0}' +
    '.com-sem{margin-top:10px;font-size:13px;color:var(--mu2);line-height:1.5}' +
    '#com-texto{min-height:130px}';
  document.head.appendChild(css);

  /* Botão na aba Responsáveis */
  const botao = document.createElement('button');
  botao.className = 'btn'; botao.type = 'button'; botao.textContent = '📢 Comunicado para todos';
  acts.prepend(botao);

  /* Janela */
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo'; fundo.id = 'modal-com'; fundo.hidden = true;
  fundo.innerHTML =
    '<div class="modal largo" role="dialog" aria-modal="true" aria-labelledby="com-titulo">' +
      '<h2 id="com-titulo">Comunicado para as famílias</h2>' +
      '<p class="sub">Você escreve uma vez. Depois, cada toque abre o WhatsApp de uma família com a mensagem pronta; é só apertar "enviar" lá.</p>' +
      '<div id="com-passo1">' +
        '<span class="campo">Para quem</span>' +
        '<div class="rads"><label class="rad"><input type="radio" name="com-turma" value="" checked>Todas</label><label class="rad"><input type="radio" name="com-turma" value="Manhã">Só manhã</label><label class="rad"><input type="radio" name="com-turma" value="Tarde">Só tarde</label></div>' +
        '<label class="check" style="margin-top:12px"><input type="checkbox" id="com-aguardando">Incluir famílias que ainda não assinaram o contrato</label>' +
        '<label class="campo" style="margin-top:12px">Mensagem<textarea id="com-texto" maxlength="1500" placeholder="Ex.: Amanhã é feriado e não teremos transporte. Voltamos na quinta-feira, no horário normal."></textarea></label>' +
        '<label class="check" style="margin-top:10px"><input type="checkbox" id="com-ola" checked>Começar com "Olá, [primeiro nome do responsável]!"</label>' +
        '<label class="check" style="margin-top:8px"><input type="checkbox" id="com-assinatura" checked>Terminar com "Van Escolar Tia Patrícia e Tio Vitor"</label>' +
        '<p class="erro" id="com-erro"></p>' +
        '<div class="facts"><button class="btn ghost" type="button" data-com-fechar>Fechar</button><button class="btn" type="button" id="com-preparar">Preparar envio</button></div>' +
      '</div>' +
      '<div id="com-passo2" hidden>' +
        '<div class="info" id="com-previa" style="white-space:pre-wrap"></div>' +
        '<p class="com-prog" id="com-prog"></p>' +
        '<ul class="com-lista" id="com-lista"></ul>' +
        '<p class="com-sem" id="com-sem" hidden></p>' +
        '<div class="facts"><button class="btn ghost" type="button" id="com-voltar">Voltar e editar</button><button class="btn or" type="button" id="com-proximo">Abrir o próximo</button></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(fundo);
  const $c = id => document.getElementById(id);

  let fila = [], semZap = [];

  /* Famílias (um responsável aparece uma vez só, mesmo com dois filhos) */
  function familias(turma, comAguardando) {
    const porResp = new Map();
    DB.contratos
      .filter(c => (c.status === 'assinado' || (comAguardando && c.status === 'aguardando')) && (!turma || c.turma === turma))
      .forEach(c => {
        const k = c.responsavel.id;
        if (!porResp.has(k)) porResp.set(k, { r: c.responsavel, filhos: [] });
        porResp.get(k).filhos.push(c.crianca.nome);
      });
    return [...porResp.values()].sort((a, b) => porNome(a.r.nome, b.r.nome));
  }
  function montar(r) {
    const partes = [];
    if ($c('com-ola').checked) partes.push(`Olá, ${primeiroNome(r.nome)}!`);
    partes.push($c('com-texto').value.trim());
    if ($c('com-assinatura').checked) partes.push('Van Escolar Tia Patrícia e Tio Vitor');
    return partes.join('\n\n');
  }

  botao.addEventListener('click', () => {
    const tf = typeof turmaFiltro !== 'undefined' ? turmaFiltro : '';
    fundo.querySelectorAll('input[name=com-turma]').forEach(i => { i.checked = i.value === tf; });
    $c('com-erro').textContent = '';
    $c('com-passo1').hidden = false; $c('com-passo2').hidden = true;
    abrirModal('modal-com');
    setTimeout(() => $c('com-texto').focus(), 50);
  });

  $c('com-preparar').addEventListener('click', () => {
    if (!$c('com-texto').value.trim()) { $c('com-erro').textContent = 'Escreva a mensagem.'; return; }
    const turma = (fundo.querySelector('input[name=com-turma]:checked') || {}).value || '';
    const todas = familias(turma, $c('com-aguardando').checked);
    if (!todas.length) { $c('com-erro').textContent = 'Nenhuma família nesse filtro.'; return; }
    fila = todas.filter(f => linkWa(f.r.tel, '')).map(f => ({ ...f, aberto: false }));
    semZap = todas.filter(f => !linkWa(f.r.tel, ''));
    const exemplo = fila[0] ? fila[0].r : { nome: 'Fulano' };
    $c('com-previa').textContent = 'Como a mensagem vai chegar (exemplo para ' + primeiroNome(exemplo.nome) + '):\n\n' + montar(exemplo);
    $c('com-passo1').hidden = true; $c('com-passo2').hidden = false;
    desenhar();
  });

  function desenhar() {
    const feitos = fila.filter(f => f.aberto).length, prox = fila.findIndex(f => !f.aberto);
    $c('com-prog').textContent = fila.length
      ? `${feitos} de ${fila.length} conversas abertas` + (prox < 0 ? ' · pronto! 🎉' : '')
      : 'Nenhuma família com WhatsApp válido.';
    $c('com-lista').innerHTML = fila.map((f, i) =>
      `<li class="com-item${f.aberto ? ' feito' : ''}"><div><b>${esc(f.r.nome)}</b><small>${esc(f.filhos.join(', '))} · ${esc(f.r.tel)}</small></div>` +
      `<button class="btn ${f.aberto ? 'ghost' : 'or'} sm" data-com-i="${i}" type="button">${f.aberto ? 'Abrir de novo' : 'Abrir WhatsApp'}</button></li>`).join('');
    $c('com-sem').hidden = !semZap.length;
    $c('com-sem').textContent = semZap.length ? 'Sem WhatsApp válido no cadastro (avise de outro jeito): ' + semZap.map(f => f.r.nome).join(', ') + '.' : '';
    $c('com-proximo').disabled = prox < 0;
    $c('com-proximo').textContent = prox < 0 ? 'Todas abertas' : 'Abrir o próximo: ' + primeiroNome(fila[prox].r.nome);
  }
  function abrir(i) {
    const f = fila[i]; if (!f) return;
    if (abrirConversa(f.r.tel, montar(f.r))) { f.aberto = true; desenhar(); }
  }
  $c('com-lista').addEventListener('click', e => { const b = e.target.closest('[data-com-i]'); if (b) abrir(Number(b.dataset.comI)); });
  $c('com-proximo').addEventListener('click', () => abrir(fila.findIndex(f => !f.aberto)));
  $c('com-voltar').addEventListener('click', () => { $c('com-passo1').hidden = false; $c('com-passo2').hidden = true; });
  fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('[data-com-fechar]')) fecharModais(); });
})();