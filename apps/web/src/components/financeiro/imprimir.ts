/**
 * Imprime uma página num iframe invisível. Com o atalho do Chrome em --kiosk-printing,
 * sai direto na impressora térmica, sem janela de impressão.
 */
export function imprimirPagina(caminho: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.src = `${caminho}${caminho.includes('?') ? '&' : '?'}auto=1`;
  const remover = () => frame.remove();
  window.addEventListener('message', function ouvir(e) {
    if (e.source === frame.contentWindow && e.data === 'recibo-impresso') {
      window.removeEventListener('message', ouvir);
      setTimeout(remover, 1000);
    }
  });
  setTimeout(remover, 120_000);
  document.body.appendChild(frame);
}

export const imprimirRecibo = (recebimentoId: number) => imprimirPagina(`/imprimir/recibo/${recebimentoId}`);
export const imprimirCaixa = (data: string) => imprimirPagina(`/imprimir/caixa/${data}`);
