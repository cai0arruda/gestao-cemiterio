/** Gera um .csv que abre direto no Excel em português (separador ";" e acentos corretos). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null | undefined)[][]) {
  const celula = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const texto = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Valor em reais para planilha: 1234,50 */
export const reaisCsv = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');
