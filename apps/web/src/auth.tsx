import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import type { Usuario } from '@cemiterio/shared';
import { api, ErroApi, registrarPerdaDeSessao } from './api/client';

interface AuthCtx {
  usuario: Usuario | null;
  carregando: boolean;
  /** Servidor fora do ar ou erro inesperado ao carregar a sessão. */
  erroConexao: boolean;
  tentarDeNovo: () => void;
  precisaConfigurar: boolean;
  definirUsuario: (u: Usuario | null) => void;
  sair: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const setup = useQuery({
    queryKey: ['setup'],
    queryFn: () => api.get<{ precisaConfigurar: boolean }>('/api/setup/status'),
    staleTime: Infinity,
  });

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ usuario: Usuario }>('/api/auth/me')).usuario;
      } catch (e) {
        if (e instanceof ErroApi && e.status === 401) return null;
        throw e;
      }
    },
    enabled: setup.data?.precisaConfigurar === false,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const definirUsuario = useCallback(
    (u: Usuario | null) => {
      qc.setQueryData(['me'], u);
      if (u) qc.setQueryData(['setup'], { precisaConfigurar: false });
    },
    [qc],
  );

  useEffect(() => {
    registrarPerdaDeSessao(() => {
      qc.setQueryData(['me'], null);
    });
  }, [qc]);

  const sair = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    // Recarrega o sistema do zero na tela de login: limpa tudo o que estava em memória
    // (dados de sócios, financeiro etc.) e não deixa nada da sessão anterior na tela.
    // (Antes usava qc.clear(), que deixava a tela presa ao usuário antigo.)
    window.location.replace('/');
  }, []);

  const precisaConfigurar = setup.data?.precisaConfigurar ?? false;
  const carregando = setup.isLoading || (!precisaConfigurar && me.isLoading);

  return (
    <Ctx.Provider
      value={{
        usuario: me.data ?? null,
        carregando,
        erroConexao: setup.isError || me.isError,
        tentarDeNovo: () => void qc.invalidateQueries(),
        precisaConfigurar,
        definirUsuario,
        sair,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
