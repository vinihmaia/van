/* =================== VAN PV · aviso de documentos no painel ===================
   Cria a aba "Documentos" no topo (com o número de pendências)
   e uma faixa de aviso na tela de Contratos quando algo vence logo ou já venceu.
   Usa a conexão do app.js. Se este arquivo der erro, o painel continua funcionando. */
(function () {
  const nav = document.querySelector('.tabs'); if (!nav) return;
  const aba = document.createElement('a');
  aba.href = 'documentos.html'; aba.textContent = 'Documentos';
  nav.appendChild(aba);

  const faixa = document.createElement('div');
  faixa.className = 'aviso-venc'; faixa.hidden = true;
  const ancora = document.getElementById('aniversarios');
  if (ancora) ancora.before(faixa);

  const hojeMeioDia = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
  const diasPara = iso => Math.round((new Date(iso + 'T12:00:00') - hojeMeioDia()) / 86400000);
  const quando = n => n < 0 ? 'vencido' : n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : 'vence em ' + n + ' dias';

  let dono = null, ultima = 0, buscando = false;
  async function verificar() {
    const logado = typeof usuario !== 'undefined' && usuario && typeof acessoOk !== 'undefined' && acessoOk && sb;
    if (!logado) { dono = null; aba.textContent = 'Documentos'; faixa.hidden = true; return; }
    /* Busca no banco ao entrar e depois a cada 10 minutos */
    if (buscando || (dono === usuario.id && Date.now() - ultima < 600000)) return;
    buscando = true;
    try {
      const { data, error } = await sb.from('documentos_van').select('tipo, descricao, vencimento, avisar_dias');
      dono = usuario.id; ultima = Date.now();
      if (error) { console.warn('Documentos da van:', error.message); return; }
      const pend = data.map(d => ({ d, n: diasPara(d.vencimento) }))
        .filter(x => x.n <= (x.d.avisar_dias || 30))
        .sort((a, b) => a.n - b.n);
      aba.textContent = 'Documentos' + (pend.length ? ` (${pend.length})` : '');
      faixa.hidden = !pend.length;
      if (!pend.length) return;
      const vencidos = pend.filter(x => x.n < 0).length, vencendo = pend.length - vencidos;
      const titulo = [vencidos ? vencidos + ' vencido(s)' : '', vencendo ? vencendo + ' vencendo' : ''].filter(Boolean).join(' e ');
      const itens = pend.slice(0, 3).map(({ d, n }) => esc(d.tipo + (d.descricao ? ' · ' + d.descricao : '')) + ' (' + quando(n) + ')').join('; ');
      faixa.innerHTML = `⚠ <b>Documentos da van: ${titulo}.</b> ${itens}${pend.length > 3 ? '…' : ''} · <a href="documentos.html">Ver documentos</a>`;
    } finally { buscando = false; }
  }
  setInterval(verificar, 3000);
  verificar();
})();