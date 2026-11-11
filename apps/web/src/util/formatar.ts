/** 'YYYY-MM-DD' -> 'DD/MM/YYYY' */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

/** 'DD/MM/YYYY' -> 'YYYY-MM-DD' (ou null se incompleta/inválida) */
export function dataIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(`${a}-${mes}-${d}T12:00:00`);
  if (Number.isNaN(data.getTime()) || data.getDate() !== Number(d) || data.getMonth() + 1 !== Number(mes)) return null;
  return `${a}-${mes}-${d}`;
}

export function dataHoraBr(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function idade(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = new Date(`${iso}T12:00:00`);
  const hoje = new Date();
  let anos = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) anos--;
  return anos;
}

export function cpfBr(cpf: string | null | undefined): string {
  if (!cpf || cpf.length !== 11) return cpf ?? '';
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function telefoneBr(t: string | null | undefined): string {
  if (!t) return '';
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export function cepBr(c: string | null | undefined): string {
  if (!c || c.length !== 8) return c ?? '';
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

export function tamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
