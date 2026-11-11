import { z } from 'zod';

export class ErroValidacao extends Error {
  constructor(public readonly campos: Record<string, string>) {
    super(Object.values(campos)[0] ?? 'Dados inválidos.');
  }
}

/** Valida com Zod e lança ErroValidacao com as mensagens por campo. */
export function validar<S extends z.ZodType>(schema: S, dados: unknown): z.output<S> {
  const r = schema.safeParse(dados ?? {});
  if (r.success) return r.data;
  const campos: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const chave = issue.path.join('.') || '_';
    campos[chave] ??= issue.message;
  }
  throw new ErroValidacao(campos);
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
