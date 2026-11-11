import { normalizarTexto } from '@cemiterio/shared';

const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

export function tokensNome(nome: string): string[] {
  return normalizarTexto(nome)
    .split(' ')
    .filter((t) => t && !CONECTIVOS.has(t));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j]! + 1, atual[j - 1]! + 1, anterior[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length]!;
}

/** 1 = idênticos, 0 = totalmente diferentes. */
export function similaridade(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}
