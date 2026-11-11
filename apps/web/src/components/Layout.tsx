import { AppShell, Avatar, Burger, Group, Menu, NavLink, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAdjustmentsDollar,
  IconCash,
  IconChartBar,
  IconReportAnalytics,
  IconGrave2,
  IconMap,
  IconSettings,
  IconCross,
  IconDatabaseExport,
  IconHistory,
  IconKey,
  IconLogout,
  IconUserPlus,
  IconUsers,
  IconUserShield,
} from '@tabler/icons-react';
import { NavLink as RouterLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth';
import { TrocarSenha } from './TrocarSenha';

const itens = [
  { to: '/atendimento', rotulo: 'Atendimento', icone: IconCash },
  { to: '/socios', rotulo: 'Sócios', icone: IconUsers },
  { to: '/cadastro-rapido', rotulo: 'Cadastro rápido', icone: IconUserPlus },
  { to: '/sepulturas', rotulo: 'Sepulturas', icone: IconGrave2 },
  { to: '/mapa', rotulo: 'Mapa', icone: IconMap },
  { to: '/financeiro', rotulo: 'Financeiro', icone: IconChartBar },
  { to: '/relatorios', rotulo: 'Relatórios', icone: IconReportAnalytics },
];
const itensAdmin = [
  { to: '/admin/valores', rotulo: 'Valores e reajustes', icone: IconAdjustmentsDollar },
  { to: '/admin/configuracoes', rotulo: 'Configurações', icone: IconSettings },
  { to: '/admin/usuarios', rotulo: 'Usuários', icone: IconUserShield },
  { to: '/admin/backup', rotulo: 'Backup', icone: IconDatabaseExport },
  { to: '/admin/historico', rotulo: 'Histórico de alterações', icone: IconHistory },
];

export function Layout() {
  const { usuario, sair } = useAuth();
  const [menuAberto, menu] = useDisclosure();
  const [senhaAberta, senha] = useDisclosure();
  const { pathname } = useLocation();

  const link = (i: (typeof itens)[number]) => (
    <NavLink
      key={i.to}
      component={RouterLink}
      to={i.to}
      label={i.rotulo}
      leftSection={<i.icone size={18} />}
      active={pathname === i.to || ((i.to === '/socios' || i.to === '/sepulturas') && pathname.startsWith(i.to))}
      onClick={menu.close}
    />
  );

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !menuAberto } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={menuAberto} onClick={menu.toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon color="teal.8" radius="md">
              <IconCross size={18} />
            </ThemeIcon>
            <Text fw={700}>Cemitério Campo Vicente</Text>
          </Group>
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar size="sm" color="teal" name={usuario?.nome} />
                  <Text size="sm" visibleFrom="xs">{usuario?.nome}</Text>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{usuario?.perfil === 'admin' ? 'Administrador' : 'Atendente'}</Menu.Label>
              <Menu.Item leftSection={<IconKey size={16} />} onClick={senha.open}>Trocar senha</Menu.Item>
              <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={() => void sair()}>Sair</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {itens.map(link)}
        {usuario?.perfil === 'admin' && (
          <>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" mt="md" mb={4} px="sm">Administração</Text>
            {itensAdmin.map(link)}
          </>
        )}
      </AppShell.Navbar>

      <AppShell.Main bg="gray.0">
        {/* A chave reinicia a animação de entrada a cada troca de tela. */}
        <div key={pathname} className="entrada-tela">
          <Outlet />
        </div>
      </AppShell.Main>
      <TrocarSenha aberto={senhaAberta} fechar={senha.close} />
    </AppShell>
  );
}
