/* =================== VAN PV · despesas e lucro ===================
   Arquivo separado: usa as ferramentas do app.js (sb, pegar, fmtBRL, esc, todasMensalidades...).
   Se este arquivo der erro, o resto do painel continua funcionando.
   A conta é pelo dia em que o dinheiro entrou ou saiu (como um extrato de banco). */
(function () {
  const CATEGORIAS = {
    combustivel: 'Combustível', pedagio: 'Pedágio', manutencao: 'Manutenção',
    financiamento: 'Parcela da van', salario: 'Salário / ajudante', documentos: 'Documentos e seguro', outros: 'Outros'
  };
  const FORMAS = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' };
  const tabelaFalta = e => /despesas|does not exist|schema cache/i.test((e && e.message) || '');
  const MSG_SQL = 'Falta criar a tabela de despesas no banco: rode o SQL das despesas no Supabase.';

  let despesas = [], erroDesp = '', ultimaBusca = 0, buscando = null, donoDados = null, editando = null;
  const mesEl = pegar('desp-mes'), form = pegar('form-desp');
  mesEl.value = hojeISO().slice(0, 7);
  form.elements.categoria.innerHTML = Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  /* Busca no banco (no máximo a cada 30 s, a não ser que peça "forcar") */
  async function buscar(forcar) {
    const quem = usuario && usuario.id;
    if (!quem) return;
    if (!forcar && quem === donoDados && Date.now() - ultimaBusca < 30000) return;
    if (buscando) return buscando;
    buscando = (async () => {
      const { data, error } = await sb.from('despesas').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false });
      if (error) { despesas = []; erroDesp = tabelaFalta(error) ? MSG_SQL : traduzErro(error); }
      else { despesas = data; erroDesp = ''; }
      ultimaBusca = Date.now(); donoDados = quem;
    })();
    try { await buscando; } finally { buscando = null; }
  }

  const noMes = (iso, mes) => (iso || '').slice(0, 7) === mes;
  const noAno = (iso, ano) => (iso || '').slice(0, 4) === ano;
  const soma = lista => lista.reduce((s, x) => s + Number(x || 0), 0);
  /* Mensalidades pagas (todas as turmas) cujo pagamento caiu no período */
  const recebido = filtro => soma(todasMensalidades().filter(({ m }) => m.pago && filtro(m.pago_em)).map(({ m }) => m.valor));

  function desenhar() {
    const mes = mesEl.value || hojeISO().slice(0, 7), ano = mes.slice(0, 4);
    const nomeMes = MESES_LONGO[Number(mes.slice(5)) - 1] + ' de ' + ano;
    const aviso = pegar('desp-aviso'); aviso.hidden = !erroDesp; aviso.textContent = erroDesp;

    /* Números do mês e do ano */
    const doMes = despesas.filter(d => noMes(d.data, mes));
    const entrou = recebido(iso => noMes(iso, mes)), saiu = soma(doMes.map(d => d.valor)), sobrou = entrou - saiu;
    const sobrouAno = recebido(iso => noAno(iso, ano)) - soma(despesas.filter(d => noAno(d.data, ano)).map(d => d.valor));
    pegar('desp-entrou').textContent = fmtBRL(entrou);
    pegar('desp-saiu').textContent = fmtBRL(saiu);
    pegar('desp-qtd').textContent = doMes.length ? doMes.length + (doMes.length === 1 ? ' lançamento' : ' lançamentos') : 'nenhum lançamento';
    const elS = pegar('desp-sobrou'); elS.textContent = fmtBRL(sobrou); elS.className = sobrou < 0 ? 'neg' : 'ok';
    pegar('desp-sobrou-ano').textContent = 'No ano de ' + ano + ': ' + fmtBRL(sobrouAno);

    /* Para onde foi o dinheiro (por tipo) */
    const porCat = {};
    doMes.forEach(d => { porCat[d.categoria] = (porCat[d.categoria] || 0) + Number(d.valor); });
    const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]), caixa = pegar('desp-cats');
    caixa.hidden = !cats.length;
    caixa.innerHTML = cats.map(([k, v]) => {
      const pct = saiu ? Math.round(v / saiu * 100) : 0;
      return `<div class="desp-cat"><span>${esc(CATEGORIAS[k] || k)}</span><div class="desp-barra"><i style="width:${pct}%"></i></div><b>${fmtBRL(v)}</b><small>${pct}%</small></div>`;
    }).join('');

    /* Lista do mês */
    pegar('tab-desp').innerHTML = doMes.length
      ? doMes.map(d => `<tr><td>${fmtDia(d.data)}</td><td>${esc(CATEGORIAS[d.categoria] || d.categoria)}</td><td>${esc(d.descricao || '—')}</td><td>${esc(FORMAS[d.forma] || '—')}</td><td><b>${fmtBRL(d.valor)}</b></td><td>${esc(d.criado_por_nome || '—')}</td>` +
        `<td style="white-space:nowrap"><button class="btn ghost sm" data-desp-editar="${esc(d.id)}" type="button">Editar</button> <button class="link" data-desp-apagar="${esc(d.id)}" type="button">Apagar</button></td></tr>`).join('')
      : `<tr><td colspan="7" class="vazio">${erroDesp ? 'Despesas indisponíveis por enquanto.' : 'Nenhuma despesa em ' + esc(nomeMes) + '. Clique em "+ Lançar despesa".'}</td></tr>`;
  }

  /* Chamado pelo app.js no fim de renderFinanceiro() */
  window.renderDespesas = function () { desenhar(); buscar(false).then(desenhar); };

  /* Janela de lançar / editar */
  function abrir(d) {
    editando = d || null;
    form.reset();
    const f = form.elements;
    pegar('desp-titulo').textContent = d ? 'Editar despesa' : 'Lançar despesa';
    pegar('desp-erro').textContent = '';
    f.data.value = d ? d.data : hojeISO();
    f.categoria.value = d ? d.categoria : 'combustivel';
    f.valor.value = d ? d.valor : '';
    f.descricao.value = d ? (d.descricao || '') : '';
    if (d && d.forma) f.forma.value = d.forma;
    abrirModal('modal-desp');
    setTimeout(() => f.valor.focus(), 50);
  }
  pegar('desp-nova').addEventListener('click', () => abrir(null));
  mesEl.addEventListener('change', desenhar);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements, erro = pegar('desp-erro'), btn = pegar('desp-salvar');
    const valor = Math.round(Number(f.valor.value) * 100) / 100;
    erro.textContent = '';
    if (!(valor > 0)) { erro.textContent = 'Informe o valor.'; return; }
    if (!f.data.value) { erro.textContent = 'Informe a data.'; return; }
    const dados = { data: f.data.value, categoria: f.categoria.value, valor, descricao: f.descricao.value.trim() || null, forma: f.forma.value || null };
    const eraEdicao = !!editando;
    btn.disabled = true;
    const r = eraEdicao
      ? await sb.from('despesas').update(dados).eq('id', editando.id).select('id')
      : await sb.from('despesas').insert({ ...dados, criado_por_nome: meuNome() || null }).select('id');
    btn.disabled = false;
    if (r.error) { erro.textContent = tabelaFalta(r.error) ? MSG_SQL : traduzErro(r.error); return; }
    if (!r.data.length) { erro.textContent = 'O banco não deixou salvar (falta permissão ou a despesa foi apagada em outro aparelho).'; return; }
    fecharModais();
    mesEl.value = dados.data.slice(0, 7); /* mostra o mês da despesa lançada */
    await buscar(true); desenhar();
    toast(eraEdicao ? 'Despesa atualizada.' : 'Despesa lançada.');
  });

  /* Editar / apagar na lista */
  pegar('tab-desp').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.despEditar) { const d = despesas.find(x => x.id === b.dataset.despEditar); if (d) abrir(d); return; }
    if (b.dataset.despApagar) {
      const d = despesas.find(x => x.id === b.dataset.despApagar); if (!d) return;
      if (!confirm(`Apagar a despesa de ${fmtBRL(d.valor)} (${CATEGORIAS[d.categoria] || d.categoria}) do dia ${fmtDia(d.data)}?\n\nIsso não tem desfazer.`)) return;
      const { data, error } = await sb.from('despesas').delete().eq('id', d.id).select('id');
      if (error) { toast(traduzErro(error)); return; }
      await buscar(true); desenhar();
      toast(data.length ? 'Despesa apagada.' : 'Essa despesa já tinha sido apagada.');
    }
  });

  /* Planilha com todas as despesas */
  pegar('desp-exportar').addEventListener('click', async () => {
    await buscar(true);
    baixarCSV('despesas.csv', ['Data', 'Tipo', 'Descrição', 'Forma', 'Valor', 'Lançado por'],
      despesas.map(d => [fmtDia(d.data), CATEGORIAS[d.categoria] || d.categoria, d.descricao || '', FORMAS[d.forma] || '', Number(d.valor).toFixed(2).replace('.', ','), d.criado_por_nome || '']));
  });
})();