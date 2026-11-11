import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCross } from '@tabler/icons-react';
import { useState } from 'react';
import type { Usuario } from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';

function Moldura({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <Center mih="100vh" bg="gray.1" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w="100%" maw={420}>
        <Stack align="center" gap={4} mb="lg">
          <ThemeIcon size={52} radius="md" color="teal.8">
            <IconCross size={30} />
          </ThemeIcon>
          <Title order={3} ta="center">{titulo}</Title>
          <Text size="sm" c="dimmed" ta="center">{subtitulo}</Text>
        </Stack>
        {children}
      </Paper>
    </Center>
  );
}

export function Login() {
  const { definirUsuario } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm({ initialValues: { login: '', senha: '' } });

  const entrar = form.onSubmit(async (v) => {
    setErro(null);
    try {
      const r = await api.post<{ usuario: Usuario }>('/api/auth/login', v);
      definirUsuario(r.usuario);
    } catch (e) {
      setErro(mensagemDeErro(e));
      if (e instanceof ErroApi && e.status === 401) form.setFieldValue('senha', '');
    }
  });

  return (
    <Moldura titulo="Cemitério Campo Vicente" subtitulo="Sistema de gestão — faça login para continuar">
      <form onSubmit={entrar}>
        <Stack>
          {erro && <Alert color="red" icon={<IconAlertCircle size={18} />}>{erro}</Alert>}
          <TextInput label="Usuário" autoComplete="username" autoFocus required {...form.getInputProps('login')} />
          <PasswordInput label="Senha" autoComplete="current-password" required {...form.getInputProps('senha')} />
          <Button type="submit" loading={form.submitting} fullWidth mt="xs">Entrar</Button>
        </Stack>
      </form>
    </Moldura>
  );
}

export function ConfiguracaoInicial() {
  const { definirUsuario } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm({
    initialValues: { nome: '', login: '', senha: '', confirmar: '' },
    validate: {
      nome: (v) => (v.trim().length < 2 ? 'Informe seu nome' : null),
      login: (v) => (/^[a-z0-9._-]{3,50}$/i.test(v.trim()) ? null : 'De 3 a 50 caracteres, sem espaços nem acentos'),
      senha: (v) => (v.length < 8 ? 'A senha deve ter pelo menos 8 caracteres' : null),
      confirmar: (v, t) => (v !== t.senha ? 'As senhas não conferem' : null),
    },
  });

  const salvar = form.onSubmit(async ({ confirmar: _c, ...v }) => {
    setErro(null);
    try {
      const r = await api.post<{ usuario: Usuario }>('/api/setup', v);
      definirUsuario(r.usuario);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  });

  return (
    <Moldura titulo="Bem-vindo!" subtitulo="Primeiro acesso: crie a conta do administrador do sistema.">
      <form onSubmit={salvar}>
        <Stack>
          {erro && <Alert color="red">{erro}</Alert>}
          <TextInput label="Seu nome" autoFocus {...form.getInputProps('nome')} />
          <TextInput label="Usuário (para entrar)" placeholder="ex.: joao" {...form.getInputProps('login')} />
          <PasswordInput label="Senha" description="Mínimo de 8 caracteres" {...form.getInputProps('senha')} />
          <PasswordInput label="Repita a senha" {...form.getInputProps('confirmar')} />
          <Button type="submit" loading={form.submitting} fullWidth mt="xs">Criar administrador e entrar</Button>
        </Stack>
      </form>
    </Moldura>
  );
}
