/* =================== VAN PV · tela inicial (quadro do dia) ===================
   Recados presos na lousa, montados sozinhos com o que o sistema já sabe:
   - Fazer agora: mensalidade atrasada ou que vence hoje, aniversário de hoje, documento vencido.
   - Esta semana: mensalidade que vence nos próximos dias, contrato parado sem assinar,
     documento que vence em até 7 dias.
   - Feito hoje: o que foi resolvido hoje. Tudo é pela data de HOJE, então à meia-noite
     o "Feito hoje" fica vazio sozinho.
   Coluna sem nada fica em branco. O único botão que grava no banco é o "Lembrar"
   (marca o lembrete, igual ao Financeiro).
   Usa as ferramentas do app.js. Se este arquivo der erro, o resto do painel continua funcionando. */
(function () {
  const sec = document.getElementById('tela-inicio'); if (!sec) return;

  const DIAS_SEM_ASSINAR = 3;  /* contrato aguardando há mais dias que isso vira recado */
  const DIAS_DOC_SEMANA = 7;   /* documento que vence em até X dias aparece em "Esta semana" */
  const MAX_POR_COLUNA = 5;    /* depois disso, aparece "Mostrar mais" */

  /* ---------- estilo do quadro e dos recados ---------- */
  const css = document.createElement('style');
  css.textContent = [
    '#tela-inicio .ini-topo{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px}',
    '#tela-inicio #ini-ola{font-size:34px;line-height:1.1}',
    '.ini-nums{display:flex;gap:24px;flex-wrap:wrap;text-align:center}',
    '.ini-num b{display:block;font-family:var(--f-numero,inherit);font-weight:var(--peso-numero,600);font-size:28px;line-height:1.1}',
    '.ini-num span{font-size:12px;color:var(--mu2)}',
    '.ini-num.aberto b{color:var(--warn)}',
    '.ini-folha{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1.5px dashed var(--line);border-radius:8px;padding:10px 14px;margin:2px 0 18px;font-size:14px}',
    '.ini-folha small{display:block;font-size:12.5px;color:var(--mu2);margin-top:2px}',
    '.ini-folha .btn{margin-left:auto}',
    '.ini-quadro{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start;min-height:240px}',
    '.ini-col-topo{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px dashed var(--line);padding-bottom:6px;margin-bottom:16px}',
    '.ini-col-topo span{font-size:12px;color:var(--mu2)}',
    '.recado{position:relative;border-radius:3px;padding:13px 12px 12px;margin-bottom:16px;transform:rotate(var(--giro,0deg))}',
    '.recado::before{content:"";position:absolute;top:-6px;left:50%;margin-left:-6px;width:12px;height:12px;border-radius:50%;background:#8A6A43;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25)}',
    '.recado .r-tipo{display:block;font-size:12px;font-weight:500}',
    '.recado .r-titulo{display:block;font-family:var(--f-titulo,inherit);font-weight:400;font-size:20px;line-height:1.15;margin-top:2px}',
    '.recado .r-sub{display:block;font-size:12.5px;margin-top:3px;line-height:1.35}',
    '.recado button{margin-top:10px;border:0;border-radius:6px;padding:8px 11px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}',
    '.recado button:disabled{opacity:.6;cursor:wait}',
    '.r-rosa{background:#F4C2CC;color:#5C1626}.r-rosa button{background:#5C1626;color:#F4C2CC}',
    '.r-amarelo{background:#F6E27A;color:#4A3B00}.r-amarelo button{background:#4A3B00;color:#F6E27A}',
    '.r-azul{background:#BFE0F2;color:#0E3A55}.r-azul button{background:#0E3A55;color:#BFE0F2}',
    '.r-lilas{background:#D9CFF5;color:#33236E}.r-lilas button{background:#33236E;color:#D9CFF5}',
    '.r-verde{background:#C6E9CF;color:#174B2B}',
    '.ini-mais{display:block;width:100%;background:none;border:0;padding:4px;font:inherit;font-size:12.5px;color:var(--mu2);text-decoration:underline dotted;cursor:pointer}',
    '@media(max-width:760px){.ini-quadro{grid-template-columns:1fr;min-height:0}.ini-nums{gap:16px}}'
  ].join('');
  document.head.appendChild(css);

  /* ---------- ajudantes ---------- */
  const $i = id => document.getElementById(id);
  const diaLocal = iso => iso ? new Date(iso).toLocaleDateString('sv-SE') : '';
  const diasPara = iso => Math.round((new Date(iso + 'T12:00:00') - hojeMeioDia()) / 86400000);
  const diaDaSemana = iso => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const dataExtensa = () => { const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };

  /* "Cobrei hoje" e "reenviei o link hoje" ficam guardados neste aparelho, só pelo dia de hoje.
     Amanhã, se ainda estiver pendente, o recado volta para "Fazer agora". */
  const chaveDia = (tipo, id) => 'van-' + tipo + '-' + hojeISO() + '-' + id;
  const marcadoHoje = (tipo, id) => { try { return !!localStorage.getItem(chaveDia(tipo, id)); } catch (e) { return false; } };
  const marcarHoje = (tipo, id) => { try { localStorage.setItem(chaveDia(tipo, id), '1'); } catch (e) { /* sem armazenamento */ } };
  function limparMarcasVelhas() {
    try { Object.keys(localStorage).filter(k => /^van-(cobrado|reenviado)-/.test(k) && !k.includes(hojeISO())).forEach(k => localStorage.removeItem(k)); } catch (e) { /* sem armazenamento */ }
  }
  const parabensEnviado = c => { try { return !!localStorage.getItem(chaveParabens(c)); } catch (e) { return false; } };

  /* ---------- documentos (busca no banco no máximo a cada 2 minutos) ---------- */
  let docs = [], renovadosHoje = [], buscaDocs = 0, diaDocs = '', buscandoDocs = false;
  async function buscarDocs(forcar) {
    if (!usuario || buscandoDocs) return;
    if (!forcar && diaDocs === hojeISO() && Date.now() - buscaDocs < 120000) return;
    buscandoDocs = true;
    try {
      const r = await sb.from('documentos_van').select('id, tipo, descricao, vencimento, avisar_dias');
      docs = r.error ? [] : r.data;
      const meiaNoite = new Date(); meiaNoite.setHours(0, 0, 0, 0);
      const h = await sb.from('documentos_renovacoes').select('documento_id, vencimento_novo').gte('feito_em', meiaNoite.toISOString());
      renovadosHoje = h.error ? [] : h.data;
      buscaDocs = Date.now(); diaDocs = hojeISO();
    } finally { buscandoDocs = false; }
  }

  /* ---------- números do topo e a mensagem da folha do mês ---------- */
  function folhaDoMes() {
    const h = new Date(), ano = h.getFullYear(), mes = h.getMonth() + 1;
    const doMes = todasMensalidades().filter(({ c, m }) => naTurma(c) && m.ano === ano && m.mes === mes);
    const abertas = doMes.filter(({ m }) => !m.pago);
    return { mes, total: doMes.length, faltam: abertas.length, aberto: abertas.reduce((s, x) => s + Number(x.m.valor), 0) };
  }

  /* ---------- monta os recados das três colunas ---------- */
  function montar() {
    const hoje = hojeISO(), agoraL = [], semana = [], feito = [];

    /* Mensalidades */
    todasMensalidades().filter(({ c }) => naTurma(c)).forEach(({ c, m }) => {
      const quem = c.responsavel.nome, sub = `${c.crianca.nome}, ${MESES_LONGO[m.mes - 1]}, ${fmtBRL(m.valor)}`;
      if (m.pago) {
        if (m.pago_em === hoje) feito.push({ cor: 'verde', tipo: 'Pagamento ' + (m.forma_pagamento === 'pix' ? 'no Pix' : 'em dinheiro'), titulo: quem, sub });
        return;
      }
      if (estaAtrasada(m)) {
        const d = diasAtraso(m);
        if (marcadoHoje('cobrado', m.id)) feito.push({ cor: 'verde', tipo: 'Cobrança enviada', titulo: quem, sub });
        else agoraL.push({ peso: 1, ordem: -d, cor: 'rosa', tipo: `Atrasada há ${d} ${d === 1 ? 'dia' : 'dias'}`, titulo: quem, sub, botao: 'Cobrar no WhatsApp', acao: 'cobrar', id: m.id });
        return;
      }
      const d = diasAte(m);
      if (d < 0 || d > DIAS_LEMBRETE) return;
      if (m.lembrete_em) { if (diaLocal(m.lembrete_em) === hoje) feito.push({ cor: 'verde', tipo: 'Lembrete enviado', titulo: quem, sub }); return; }
      const quando = d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : 'Vence ' + diaDaSemana(m.vencimento);
      (d === 0 ? agoraL : semana).push({ peso: d === 0 ? 3 : 1, ordem: d, cor: 'amarelo', tipo: quando, titulo: quem, sub, botao: 'Lembrar no WhatsApp', acao: 'lembrar', id: m.id });
    });

    /* Contratos: assinados hoje e parados sem assinatura */
    DB.contratos.filter(naTurma).forEach(c => {
      if (c.status === 'assinado' && c.assinatura && diaLocal(c.assinatura.em) === hoje)
        feito.push({ cor: 'verde', tipo: 'Contrato assinado', titulo: c.responsavel.nome, sub: c.crianca.nome + ', turma da ' + c.turma.toLowerCase() });
      if (c.status !== 'aguardando' || !c.enviadoEm) return;
      const dias = Math.floor((Date.now() - new Date(c.enviadoEm)) / 86400000);
      if (dias < DIAS_SEM_ASSINAR) return;
      if (marcadoHoje('reenviado', c.id)) feito.push({ cor: 'verde', tipo: 'Link de assinatura reenviado', titulo: c.responsavel.nome, sub: 'Contrato de ' + c.crianca.nome });
      else semana.push({ peso: 2, ordem: -dias, cor: 'lilas', tipo: `Sem assinar há ${dias} dias`, titulo: c.responsavel.nome, sub: 'Contrato de ' + c.crianca.nome, botao: 'Reenviar link', acao: 'assinatura', id: c.id });
    });

    /* Aniversários de hoje (uma vez por criança) */
    const vistos = new Set();
    DB.contratos.filter(c => (c.status === 'assinado' || c.status === 'aguardando') && naTurma(c) && c.crianca.nascimento).forEach(c => {
      if (vistos.has(c.crianca.id)) return; vistos.add(c.crianca.id);
      if (diasAteAniversario(c.crianca.nascimento) !== 0) return;
      const anos = idade(c.crianca.nascimento), titulo = primeiroNome(c.crianca.nome) + ' faz ' + anos + ' anos';
      if (parabensEnviado(c)) feito.push({ cor: 'verde', tipo: 'Parabéns enviado', titulo, sub: 'Para ' + c.responsavel.nome });
      else agoraL.push({ peso: 2, ordem: 0, cor: 'amarelo', tipo: 'Aniversário hoje', titulo, sub: 'Turma da ' + c.turma.toLowerCase(), botao: 'Mandar parabéns', acao: 'parabens', id: c.id });
    });

    /* Documentos da van (valem para as duas turmas) */
    docs.forEach(d => {
      const n = diasPara(d.vencimento), base = { cor: 'azul', titulo: d.tipo, sub: d.descricao || '', botao: 'Abrir documentos', acao: 'docs' };
      if (n < 0) agoraL.push({ ...base, peso: 4, ordem: n, tipo: n === -1 ? 'Venceu ontem' : `Venceu há ${-n} dias` });
      else if (n === 0) agoraL.push({ ...base, peso: 4, ordem: 0, tipo: 'Vence hoje' });
      else if (n <= DIAS_DOC_SEMANA) semana.push({ ...base, peso: 3, ordem: n, tipo: n === 1 ? 'Vence amanhã' : `Vence em ${n} dias` });
    });
    renovadosHoje.forEach(r => {
      const d = docs.find(x => x.id === r.documento_id);
      if (d) feito.push({ cor: 'verde', tipo: 'Documento renovado', titulo: d.tipo, sub: 'Novo vencimento: ' + fmtDia(r.vencimento_novo) });
    });

    const ordenar = (a, b) => (a.peso - b.peso) || (a.ordem - b.ordem);
    return { agoraL: agoraL.sort(ordenar), semana: semana.sort(ordenar), feito };
  }

  /* ---------- desenho ---------- */
  const expandido = {};
  const GIROS = [-1.2, 0.9, -0.5, 0.7];
  function cartao(r, i) {
    return `<div class="recado r-${r.cor}" style="--giro:${GIROS[i % GIROS.length]}deg">` +
      `<span class="r-tipo">${esc(r.tipo)}</span><b class="r-titulo">${esc(r.titulo)}</b>` +
      (r.sub ? `<span class="r-sub">${esc(r.sub)}</span>` : '') +
      (r.botao ? `<button type="button" data-acao="${r.acao}"${r.id ? ` data-id="${esc(r.id)}"` : ''}>${esc(r.botao)}</button>` : '') + '</div>';
  }
  function coluna(chave, titulo, lista) {
    const aberta = !!expandido[chave], ver = aberta ? lista : lista.slice(0, MAX_POR_COLUNA), resto = lista.length - ver.length;
    return `<div class="ini-col"><div class="ini-col-topo"><h2>${titulo}</h2><span>${lista.length || ''}</span></div>` +
      ver.map(cartao).join('') +
      (resto > 0 ? `<button class="ini-mais" type="button" data-mais="${chave}">Mostrar mais ${resto}</button>` : '') +
      (aberta && lista.length > MAX_POR_COLUNA ? `<button class="ini-mais" type="button" data-menos="${chave}">Mostrar menos</button>` : '') + '</div>';
  }
  function desenhar() {
    if (!sec.classList.contains('active')) return;
    limparMarcasVelhas();
    const nome = meuNome();
    $i('ini-ola').textContent = saudacao() + (nome ? ', ' + nome : '');
    $i('ini-data').textContent = dataExtensa();

    /* Números do topo (seguem o filtro de turma) */
    const turmas = turmaFiltro ? [turmaFiltro] : ['Manhã', 'Tarde'];
    const ocupados = turmas.reduce((s, t) => s + ocupacao(t).ocupados, 0);
    const f = folhaDoMes();
    $i('ini-lugares').textContent = ocupados + ' de ' + turmas.length * LUGARES;
    $i('ini-aberto').textContent = fmtBRL(f.aberto);
    $i('ini-aberto-rot').textContent = 'em aberto em ' + MESES_LONGO[f.mes - 1];
    $i('ini-assinados').textContent = DB.contratos.filter(c => c.status === 'assinado' && naTurma(c)).length;

    /* Folha do mês: o nome do mês muda sozinho; só aparece se tiver mensalidade em aberto */
    const folha = $i('ini-folha');
    folha.hidden = !f.faltam;
    folha.innerHTML = f.faltam
      ? `<span>Conferir a folha de pagamento de ${MESES_LONGO[f.mes - 1]}<small>Faltam ${f.faltam} de ${f.total} mensalidades, somando ${fmtBRL(f.aberto)}</small></span><a class="btn sm" href="#financeiro">Abrir Financeiro</a>`
      : '';

    const { agoraL, semana, feito } = montar();
    $i('ini-quadro').innerHTML = coluna('agora', 'Fazer agora', agoraL) + coluna('semana', 'Esta semana', semana) + coluna('feito', 'Feito hoje', feito);
  }

  /* Chamado pelo app.js quando a tela "Início" abre ou o filtro de turma muda */
  let diaVisto = hojeISO(), ultimaRecarga = Date.now();
  window.renderInicio = function () {
    diaVisto = hojeISO(); ultimaRecarga = Date.now();
    desenhar();
    buscarDocs(false).then(desenhar);
  };

  /* ---------- botões dos recados ---------- */
  $i('ini-quadro').addEventListener('click', async e => {
    const mais = e.target.closest('[data-mais]'); if (mais) { expandido[mais.dataset.mais] = true; desenhar(); return; }
    const menos = e.target.closest('[data-menos]'); if (menos) { expandido[menos.dataset.menos] = false; desenhar(); return; }
    const b = e.target.closest('button[data-acao]'); if (!b) return;
    const acao = b.dataset.acao, id = b.dataset.id;

    if (acao === 'docs') { location.href = 'documentos.html'; return; }
    if (acao === 'cobrar') {
      const x = acharMens(id);
      if (x && abrirConversa(x.c.responsavel.tel, mensagemCobranca(x.c, x.m))) { marcarHoje('cobrado', id); desenhar(); }
      return;
    }
    if (acao === 'assinatura') {
      const c = achar(id);
      if (c && abrirWhatsApp(c)) { marcarHoje('reenviado', id); desenhar(); }
      return;
    }
    if (acao === 'parabens') {
      const c = achar(id);
      if (c && abrirConversa(c.responsavel.tel, mensagemParabens(c))) {
        try { localStorage.setItem(chaveParabens(c), '1'); } catch (err) { /* sem armazenamento */ }
        desenhar();
      }
      return;
    }
    if (acao === 'lembrar') {
      const x = acharMens(id); if (!x) return;
      if (!abrirConversa(x.c.responsavel.tel, mensagemLembrete(x.c, x.m))) return; /* sem WhatsApp válido, não marca */
      b.disabled = true;
      const { error } = await sb.from('mensalidades').update({ lembrete_em: new Date().toISOString() }).eq('id', id);
      if (error) { b.disabled = false; toast('O WhatsApp abriu, mas não consegui marcar como lembrado: ' + traduzErro(error)); return; }
      await recarregar(); desenhar();
      toast('Marcado como lembrado.');
    }
  });

  /* ---------- virada do dia e atualização ----------
   Com o Início aberto: confere a cada minuto. Se virou o dia, limpa o "Feito hoje"
   na hora; fora isso, busca novidades no banco a cada 5 minutos (o que a outra pessoa fez). */
  async function conferir() {
    if (!usuario || !acessoOk || !sec.classList.contains('active') || document.hidden) return;
    const virouODia = hojeISO() !== diaVisto;
    if (!virouODia && Date.now() - ultimaRecarga < 300000) return;
    diaVisto = hojeISO(); ultimaRecarga = Date.now();
    if (await recarregar()) { await buscarDocs(true); desenhar(); }
  }
  setInterval(conferir, 60000);
  document.addEventListener('visibilitychange', conferir);
})();