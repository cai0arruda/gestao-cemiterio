export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly codigo?: string,
    public readonly campos?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Chamado quando a sessão expira (registrado pelo AuthProvider). */
let aoPerderSessao: (() => void) | null = null;
export const registrarPerdaDeSessao = (fn: () => void) => {
  aoPerderSessao = fn;
};

async function requisicao<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const ehForm = corpo instanceof FormData;
  const r = await fetch(url, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo === undefined || ehForm ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : ehForm ? corpo : JSON.stringify(corpo),
  });
  const json = r.headers.get('content-type')?.includes('application/json') ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/api/auth/login')) aoPerderSessao?.();
    throw new ErroApi(r.status, json?.erro ?? `Erro ${r.status}`, json?.codigo, json?.campos);
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => requisicao<T>('GET', url),
  post: <T>(url: string, corpo?: unknown) => requisicao<T>('POST', url, corpo ?? {}),
  put: <T>(url: string, corpo: unknown) => requisicao<T>('PUT', url, corpo),
  patch: <T>(url: string, corpo: unknown) => requisicao<T>('PATCH', url, corpo),
  delete: <T>(url: string) => requisicao<T>('DELETE', url),
};

export const mensagemDeErro = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');
