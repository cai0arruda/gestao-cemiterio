export const agoraIso = () => new Date().toISOString();
export const minutosAtras = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
export const minutosAFrente = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

/** Data de hoje no fuso do computador (YYYY-MM-DD). */
export function hojeLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
