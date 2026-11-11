import '@fontsource-variable/inter';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './estilos.css';
import { Button, Center, Loader, MantineProvider, Stack, Text, createTheme, type MantineColorsTuple } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Backup } from './pages/admin/Backup';
import { Historico } from './pages/admin/Historico';
import { Configuracoes } from './pages/admin/Configuracoes';
import { Usuarios } from './pages/admin/Usuarios';
import { Valores } from './pages/admin/Valores';
import { Atendimento } from './pages/Atendimento';
import { CaixaImpressao } from './pages/CaixaImpressao';
import { Campo } from './pages/Campo';
import { Relatorios } from './pages/Relatorios';
import { Financeiro } from './pages/Financeiro';
import { Mapa } from './pages/Mapa';
import { PortalSocio } from './pages/PortalSocio';
import { ReciboImpressao } from './pages/ReciboImpressao';
import { CadastroRapido } from './pages/CadastroRapido';
import { ConfiguracaoInicial, Login } from './pages/Entrada';
import { SepulturaPagina } from './pages/SepulturaPagina';
import { SepulturasLista } from './pages/SepulturasLista';
import { SocioPagina } from './pages/SocioPagina';
import { SociosLista } from './pages/SociosLista';

/*
 * Paleta do sistema. Os nomes "teal" e "gray" foram mantidos porque são usados em todas as
 * telas (color="teal", c="dimmed" etc.); só os tons mudaram:
 * - teal: verde-cipreste, mais sóbrio que o verde-água padrão;
 * - gray: tons de pedra levemente quentes, em vez do cinza azulado.
 */
const cipreste: MantineColorsTuple = [
  '#eef4f0', '#dde9e1', '#bcd4c5', '#97bda7', '#73a589',
  '#568d70', '#41775c', '#33654d', '#29563f', '#1e4231',
];
const pedra: MantineColorsTuple = [
  '#f7f6f3', '#efeee9', '#e4e1da', '#d4d0c7', '#b5b0a5',
  '#8e887d', '#6b665c', '#4f4b44', '#393631', '#24221e',
];

const tema = createTheme({
  primaryColor: 'teal',
  primaryShade: 8,
  colors: { teal: cipreste, gray: pedra },
  black: '#1f1e1b',
  defaultRadius: 'md',
  fontFamily: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '1.75rem', lineHeight: '1.25' },
      h2: { fontSize: '1.5rem', lineHeight: '1.3' },
      h3: { fontSize: '1.1875rem', lineHeight: '1.35' },
      h4: { fontSize: '1.0625rem', lineHeight: '1.4' },
    },
  },
  components: {
    Table: { defaultProps: { tabularNums: true } },
    Paper: { defaultProps: { radius: 'md' } },
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Rotas() {
  const { usuario, carregando, precisaConfigurar, erroConexao, tentarDeNovo } = useAuth();
  if (carregando) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (erroConexao) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Text fw={600}>Não foi possível conectar ao servidor.</Text>
          <Text size="sm" c="dimmed">Verifique se o sistema está ligado neste computador.</Text>
          <Button onClick={tentarDeNovo}>Tentar de novo</Button>
        </Stack>
      </Center>
    );
  }
  if (precisaConfigurar) return <ConfiguracaoInicial />;
  if (!usuario) return <Login />;
  const admin = usuario.perfil === 'admin';
  return (
    <Routes>
      <Route path="/imprimir/recibo/:id" element={<ReciboImpressao />} />
      <Route path="/imprimir/caixa/:data" element={<CaixaImpressao />} />
      <Route element={<Layout />}>
        <Route path="/atendimento" element={<Atendimento />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/socios" element={<SociosLista />} />
        <Route path="/socios/:id" element={<SocioPagina />} />
        <Route path="/cadastro-rapido" element={<CadastroRapido />} />
        <Route path="/sepulturas" element={<SepulturasLista />} />
        <Route path="/sepulturas/:id" element={<SepulturaPagina />} />
        <Route path="/mapa" element={<Mapa />} />
        <Route path="/campo" element={<Campo />} />
        {admin && <Route path="/admin/valores" element={<Valores />} />}
        {admin && <Route path="/admin/configuracoes" element={<Configuracoes />} />}
        {admin && <Route path="/admin/usuarios" element={<Usuarios />} />}
        {admin && <Route path="/admin/backup" element={<Backup />} />}
        {admin && <Route path="/admin/historico" element={<Historico />} />}
        <Route path="*" element={<Navigate to="/atendimento" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={tema}>
      <QueryClientProvider client={queryClient}>
        <ModalsProvider labels={{ confirm: 'Confirmar', cancel: 'Cancelar' }}>
          <Notifications position="top-right" />
          <BrowserRouter>
            <Routes>
              {/* Página pública do QR code: não passa pelo login. */}
              <Route path="/s/:token" element={<PortalSocio />} />
              <Route
                path="*"
                element={
                  <AuthProvider>
                    <Rotas />
                  </AuthProvider>
                }
              />
            </Routes>
          </BrowserRouter>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
