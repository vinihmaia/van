/* =================== VAN PV · login em forma de bilhete de embarque ===================
   Monta o bilhete em volta do formulário que já existe no index.html
   (os campos e botões continuam os mesmos, só mudam de lugar e de visual).
   - Quadro de partidas no topo, com letrinhas que giram (a hora muda sozinha).
   - Bilhete com data, turma, número, picote e canhoto.
   - Senha certa: o canhoto rasga e aparece o carimbo "Embarque autorizado".
   - Senha errada: o bilhete treme e o aviso diz "Embarque recusado".
   Se este arquivo der erro, o login antigo continua funcionando. */
(function () {
  const telas = ['tela-login', 'tela-nova-senha'].map(id => document.getElementById(id)).filter(Boolean);
  if (!telas.length) return;
  const parado = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const VAN = '<svg viewBox="0 0 60 60" aria-hidden="true"><use href="#pv-placa"/></svg>';
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const agora = new Date();
  const serie = String(Math.floor(Math.random() * 9000) + 1000) + '-' + String(agora.getFullYear()).slice(2);

  /* ---------- 1. Bilhete em volta do formulário ---------- */
  function montarCanhoto(form, aviso) {
    const botao = form.querySelector('button[type=submit]'); if (!botao) return null;
    const picote = el('div', 'bl-picote', '<span></span>');
    const canhoto = el('div', 'bl-canhoto');
    const linha = el('div', 'bl-canhoto-linha');
    const barras = el('div', 'bl-barras', [2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1].map(w => `<i style="width:${w}px"></i>`).join(''));
    const rodape = el('div', 'bl-rodape');
    botao.before(picote);
    picote.after(canhoto);
    /* o que vinha depois do botão (links) vai para o rodapé do canhoto */
    let prox = canhoto.nextElementSibling;
    while (prox) { const seguinte = prox.nextElementSibling; rodape.appendChild(prox); prox = seguinte; }
    linha.append(botao, barras);
    canhoto.append(linha, rodape);
    if (aviso) rodape.appendChild(el('span', '', aviso));
    return rodape;
  }
  function montarBilhete(card) {
    card.classList.add('bilhete');
    const d = new Date();
    const data = String(d.getDate()).padStart(2, '0') + ' ' + MESES[d.getMonth()];
    const turma = d.getHours() * 60 + d.getMinutes() < 690 ? 'Manhã' : 'Tarde';
    const topo = el('div', 'bl-topo',
      `<div class="bl-logo"><span class="bl-selo">${VAN}</span><span class="bl-nome"><b>Van PV</b><small>Tia Patrícia e Tio Vitor</small></span></div>` +
      `<div class="bl-num"><div class="bl-rot">Cartão de embarque</div><div class="bl-rot">Nº <span class="bl-mono">${serie}</span></div></div>`);
    const rota = el('div', 'bl-rota',
      `<div><div class="bl-rot">Origem</div><div class="bl-cod bl-mono">JDR</div><div class="bl-cidade">Jandira</div></div>` +
      `<div class="bl-trilho">${VAN}</div>` +
      `<div style="text-align:right"><div class="bl-rot">Destino</div><div class="bl-cod bl-mono">CDD</div><div class="bl-cidade">Cidade de Deus</div></div>`);
    const info = el('div', 'bl-info',
      `<div><span class="bl-rot">Data</span><b class="bl-mono">${data}</b></div>` +
      `<div><span class="bl-rot">Turma</span><b>${turma}</b></div>` +
      `<div><span class="bl-rot">Assento</span><b>Equipe</b></div>`);
    card.prepend(topo, rota, info);
    card.appendChild(el('div', 'bl-carimbo', 'EMBARQUE<br><span style="font-size:24px;line-height:1">✓</span><br>AUTORIZADO'));
    const avisoEl = card.querySelector(':scope > .aviso');
    const aviso = avisoEl ? avisoEl.textContent.replace(/\.$/, '') : '';
    let ultimoRodape = null;
    card.querySelectorAll('form').forEach(f => { ultimoRodape = montarCanhoto(f, aviso) || ultimoRodape; });
    /* "Voltar ao painel" (tela de nova senha) fica fora do formulário: leva para o canhoto */
    card.querySelectorAll(':scope > p').forEach(p => { if (p.querySelector('a.link') && ultimoRodape) ultimoRodape.prepend(p); });
  }
  telas.forEach(sec => { const card = sec.querySelector('.lcard'); if (card) montarBilhete(card); });

  /* Rótulos com cara de passagem */
  const rotulos = { 'login-email': 'Passageiro · e-mail', 'login-senha': 'Código de acesso · senha', 'rec-email': 'Passageiro · e-mail', 'ns-senha': 'Novo código · senha', 'ns-senha2': 'Repita o novo código' };
  Object.entries(rotulos).forEach(([id, txt]) => {
    const inp = document.getElementById(id), lab = inp && inp.closest('label');
    if (lab && lab.firstChild && lab.firstChild.nodeType === 3) lab.firstChild.nodeValue = txt;
  });

  /* ---------- 2. Botão "Ver" nas senhas ---------- */
  const olhos = [];
  ['login-senha', 'ns-senha', 'ns-senha2'].forEach(id => {
    const inp = document.getElementById(id); if (!inp || !inp.parentElement) return;
    const b = el('button', 'olho', 'Ver');
    b.type = 'button'; b.setAttribute('aria-label', 'Mostrar a senha');
    b.addEventListener('click', e => {
      e.preventDefault();
      const mostrar = inp.type === 'password';
      inp.type = mostrar ? 'text' : 'password';
      b.textContent = mostrar ? 'Ocultar' : 'Ver';
      b.setAttribute('aria-label', mostrar ? 'Esconder a senha' : 'Mostrar a senha');
      inp.focus();
    });
    inp.classList.add('com-olho');
    inp.parentElement.appendChild(b);
    olhos.push({ inp, b });
  });
  const esconderSenhas = () => olhos.forEach(({ inp, b }) => { inp.type = 'password'; b.textContent = 'Ver'; b.setAttribute('aria-label', 'Mostrar a senha'); });

  /* ---------- 3. Quadro de partidas ---------- */
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const quadros = telas.map(sec => {
    const q = el('div', 'quadro'); q.setAttribute('aria-hidden', 'true');
    sec.insertBefore(q, sec.firstChild);
    return [0, 1, 2].map(() => {
      const linha = el('div', 'linha'); q.appendChild(linha);
      return Array.from({ length: 14 }, (_, i) => { const p = el('span', 'pl' + (i < 7 ? ' rot' : '')); linha.appendChild(p); return p; });
    });
  });
  function textos() {
    const d = new Date();
    const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return ['PARTIDA  ' + hora, 'DESTINO PAINEL', 'PORTÃO  ABERTO'];
  }
  function virar(pl, final, atraso) {
    if (parado) { pl.textContent = final.trim(); return; }
    let voltas = 3 + Math.floor(Math.random() * 5);
    setTimeout(function passo() {
      pl.classList.remove('gira'); void pl.offsetWidth; pl.classList.add('gira');
      if (voltas-- <= 0) { pl.textContent = final.trim(); return; }
      pl.textContent = LETRAS[Math.floor(Math.random() * LETRAS.length)];
      setTimeout(passo, 70);
    }, atraso);
  }
  function escrever(primeira) {
    const t = textos();
    quadros.forEach(linhas => linhas.forEach((plaquinhas, r) => plaquinhas.forEach((pl, i) => {
      const c = t[r][i] || ' ';
      if (pl.dataset.c === c) return; /* só gira o que mudou */
      pl.dataset.c = c;
      virar(pl, c, primeira ? 250 + r * 120 + i * 45 : i * 30);
    })));
  }
  escrever(true);
  setInterval(() => escrever(false), 15000);

  /* ---------- 4. Senha errada: aviso de "embarque recusado" e bilhete tremendo ---------- */
  if (typeof window.erroLogin === 'function') {
    const original = window.erroLogin;
    window.erroLogin = m => original(m ? 'Embarque recusado: ' + m.charAt(0).toLowerCase() + m.slice(1) : m);
  }
  ['erro-login', 'erro-rec', 'erro-ns'].forEach(id => {
    const e = document.getElementById(id); if (!e) return;
    new MutationObserver(() => {
      if (!e.textContent || parado) return;
      const c = e.closest('.bilhete'); if (!c) return;
      c.classList.remove('tremer'); void c.offsetWidth; c.classList.add('tremer');
    }).observe(e, { childList: true, characterData: true, subtree: true });
  });

  /* ---------- 5. Senha certa: canhoto rasga e aparece o carimbo ---------- */
  let embarcando = false, tEmb = null;
  document.querySelectorAll('#form-login, #form-nova-senha').forEach(f => f.addEventListener('submit', () => {
    esconderSenhas();
    if (f.id === 'form-login') { embarcando = true; clearTimeout(tEmb); tEmb = setTimeout(() => { embarcando = false; }, 15000); }
  }, true));
  if (!parado && typeof sb !== 'undefined' && sb && sb.auth) {
    sb.auth.onAuthStateChange(evento => {
      if (evento !== 'SIGNED_IN' || !embarcando) return;
      embarcando = false;
      const card = document.querySelector('#tela-login .bilhete'); if (!card) return;
      const copia = card.cloneNode(true);
      copia.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      copia.querySelectorAll('input').forEach(i => { i.value = ''; }); /* a cópia nunca guarda a senha */
      const saida = el('div', 'bl-saida'); saida.setAttribute('aria-hidden', 'true');
      saida.appendChild(copia);
      document.body.appendChild(saida);
      setTimeout(() => saida.remove(), 1800);
    });
  }
})();