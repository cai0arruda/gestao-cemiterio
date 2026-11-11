import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cookieDe, criarAmbiente } from './helpers.js';

let amb: Awaited<ReturnType<typeof criarAmbiente>>;
beforeEach(async () => (amb = await criarAmbiente()));
afterEach(() => amb.limpar());

describe('configuração inicial e login', () => {
  it('exige configuração quando não há usuários e só permite configurar uma vez', async () => {
    const st = await amb.app.inject({ url: '/api/setup/status' });
    expect(st.json()).toEqual({ precisaConfigurar: true });
    await amb.configurarAdmin();
    const st2 = await amb.app.inject({ url: '/api/setup/status' });
    expect(st2.json()).toEqual({ precisaConfigurar: false });
    const repetir = await amb.app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { nome: 'Outro', login: 'outro', senha: 'outra-senha-123' },
    });
    expect(repetir.statusCode).toBe(409);
  });

  it('bloqueia rotas sem login', async () => {
    const r = await amb.app.inject({ url: '/api/socios' });
    expect(r.statusCode).toBe(401);
  });

  it('faz login, consulta /me e logout', async () => {
    await amb.configurarAdmin();
    const login = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'ADMIN', senha: 'senha-de-teste-123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieDe(login);
    const me = await amb.app.inject({ url: '/api/auth/me', headers: { cookie } });
    expect(me.json().usuario.login).toBe('admin');
    await amb.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const depois = await amb.app.inject({ url: '/api/auth/me', headers: { cookie } });
    expect(depois.statusCode).toBe(401);
  });

  it('bloqueia o usuário após 5 senhas erradas', async () => {
    await amb.configurarAdmin();
    const tentar = (senha: string) =>
      amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', senha } });
    for (let i = 0; i < 5; i++) expect((await tentar('errada')).statusCode).toBe(401);
    const certa = await tentar('senha-de-teste-123');
    expect(certa.statusCode).toBe(423);
  });

  it('atendente não acessa rotas de administração', async () => {
    const cookieAdmin = await amb.configurarAdmin();
    const criar = await amb.app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { cookie: cookieAdmin },
      payload: { nome: 'Atendente', login: 'atendente', senha: 'senha-atendente-1', perfil: 'atendente' },
    });
    expect(criar.statusCode).toBe(201);
    const login = await amb.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'atendente', senha: 'senha-atendente-1' },
    });
    const cookie = cookieDe(login);
    expect((await amb.app.inject({ url: '/api/usuarios', headers: { cookie } })).statusCode).toBe(403);
    expect((await amb.app.inject({ url: '/api/backups', headers: { cookie } })).statusCode).toBe(403);
    expect((await amb.app.inject({ url: '/api/socios', headers: { cookie } })).statusCode).toBe(200);
  });

  it('não deixa remover o último administrador', async () => {
    const cookie = await amb.configurarAdmin();
    const r = await amb.app.inject({ method: 'PATCH', url: '/api/usuarios/1', headers: { cookie }, payload: { perfil: 'atendente' } });
    expect(r.statusCode).toBe(400);
  });

  it('não deixa o administrador desativar a si mesmo nem mudar o próprio perfil', async () => {
    const cookie = await amb.configurarAdmin();
    await amb.app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { cookie },
      payload: { nome: 'Outro Admin', login: 'outro', senha: 'senha-outro-123', perfil: 'admin' },
    });
    const desativar = await amb.app.inject({ method: 'PATCH', url: '/api/usuarios/1', headers: { cookie }, payload: { ativo: false } });
    expect(desativar.statusCode).toBe(400);
    const rebaixar = await amb.app.inject({ method: 'PATCH', url: '/api/usuarios/1', headers: { cookie }, payload: { perfil: 'atendente' } });
    expect(rebaixar.statusCode).toBe(400);
    // Mudar o próprio nome continua permitido.
    const nome = await amb.app.inject({ method: 'PATCH', url: '/api/usuarios/1', headers: { cookie }, payload: { nome: 'Admin Novo' } });
    expect(nome.statusCode).toBe(200);
  });
});

describe('exclusão de usuários', () => {
  const criar = (cookie: string, login: string, perfil = 'atendente') =>
    amb.app.inject({
      method: 'POST',
      url: '/api/usuarios',
      headers: { cookie },
      payload: { nome: `Usuário ${login}`, login, senha: 'senha-de-teste-123', perfil },
    });

  it('exclui usuário que ainda não fez nada, mesmo que já tenha entrado', async () => {
    const cookie = await amb.configurarAdmin();
    const id = (await criar(cookie, 'engano')).json().usuario.id;
    await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'engano', senha: 'senha-de-teste-123' } });
    const r = await amb.app.inject({ method: 'DELETE', url: `/api/usuarios/${id}`, headers: { cookie } });
    expect(r.statusCode).toBe(204);
    const lista = (await amb.app.inject({ url: '/api/usuarios', headers: { cookie } })).json().usuarios;
    expect(lista.map((u: { login: string }) => u.login)).toEqual(['admin']);
  });

  it('não exclui a si mesmo', async () => {
    const cookie = await amb.configurarAdmin();
    const r = await amb.app.inject({ method: 'DELETE', url: '/api/usuarios/1', headers: { cookie } });
    expect(r.statusCode).toBe(400);
  });

  it('não exclui quem já tem registros no sistema', async () => {
    const cookie = await amb.configurarAdmin();
    const id = (await criar(cookie, 'atendente')).json().usuario.id;
    const login = await amb.app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'atendente', senha: 'senha-de-teste-123' } });
    const cookieAtendente = cookieDe(login);
    const socio = await amb.app.inject({
      method: 'POST',
      url: '/api/socios',
      headers: { cookie: cookieAtendente },
      payload: { nome_completo: 'Fulano de Tal' },
    });
    expect(socio.statusCode).toBe(201);
    const r = await amb.app.inject({ method: 'DELETE', url: `/api/usuarios/${id}`, headers: { cookie } });
    expect(r.statusCode).toBe(409);
    expect(r.json().codigo).toBe('usuario_com_registros');
  });
});
