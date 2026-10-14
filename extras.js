/* =================== VAN PV · carregador das partes extras ===================
   Carrega, na ordem, os arquivos das funções novas do painel.
   Para acrescentar uma função nova no futuro, basta pôr o nome do arquivo na lista:
   o index.html não precisa mais mudar. Se um arquivo da lista faltar, só ele não aparece. */
['comunicado.js', 'pix.js'].forEach(arquivo => {
  const s = document.createElement('script');
  s.src = arquivo;
  s.async = false; /* mantém a ordem da lista */
  document.body.appendChild(s);
});