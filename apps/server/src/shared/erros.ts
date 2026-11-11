/** Erro de regra de negócio com mensagem pronta para mostrar ao usuário. */
export class ErroApp extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly codigo?: string,
  ) {
    super(message);
  }
}

export const naoEncontrado = (o = 'Registro') => new ErroApp(404, `${o} não encontrado.`, 'nao_encontrado');
export const conflito = (msg: string, codigo = 'conflito') => new ErroApp(409, msg, codigo);
export const proibido = (msg = 'Você não tem permissão para esta ação.') => new ErroApp(403, msg, 'proibido');
export const naoAutenticado = () => new ErroApp(401, 'Faça login para continuar.', 'nao_autenticado');
export const requisicaoInvalida = (msg: string) => new ErroApp(400, msg, 'invalido');
