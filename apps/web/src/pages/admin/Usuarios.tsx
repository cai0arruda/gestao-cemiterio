import { Badge, Button, Card, Divider, Group, Modal, PasswordInput, Select, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Usuario } from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../../api/client';
import { useAuth } from '../../auth';

const PERFIS = [
  { value: 'atendente', label: 'Atendente — cadastros e pagamentos' },
  { value: 'admin', label: 'Administrador — acesso total' },
];

export function Usuarios() {
  const { usuario: eu } = useAuth();
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null);
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<{ usuarios: Usuario[] }>('/api/usuarios') });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Usuários</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditando('novo')}>Novo usuário</Button>
      </Group>
      <Card withBorder p={0} className="card-tabela">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Usuário</Table.Th>
              <Table.Th>Perfil</Table.Th>
              <Table.Th>Situação</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.usuarios.map((u) => (
              <Table.Tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => setEditando(u)}>
                <Table.Td>{u.nome} {u.id === eu?.id && <Text span c="dimmed" size="xs">(você)</Text>}</Table.Td>
                <Table.Td ff="monospace">{u.login}</Table.Td>
                <Table.Td>{u.perfil === 'admin' ? <Badge variant="light">Administrador</Badge> : <Badge variant="light" color="gray">Atendente</Badge>}</Table.Td>
                <Table.Td>{u.ativo ? <Badge color="teal" variant="dot">Ativo</Badge> : <Badge color="red" variant="dot">Desativado</Badge>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      {editando === 'novo' && <ModalNovo fechar={() => setEditando(null)} />}
      {editando && editando !== 'novo' && (
        <ModalEditar usuario={editando} souEu={editando.id === eu?.id} fechar={() => setEditando(null)} />
      )}
    </>
  );
}

function ModalNovo({ fechar }: { fechar: () => void }) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { nome: '', login: '', senha: '', perfil: 'atendente' },
    validate: {
      nome: (v) => (v.trim().length < 2 ? 'Informe o nome' : null),
      login: (v) => (/^[a-z0-9._-]{3,50}$/i.test(v.trim()) ? null : 'De 3 a 50 caracteres, sem espaços nem acentos'),
      senha: (v) => (v.length < 8 ? 'Mínimo de 8 caracteres' : null),
    },
  });
  const salvar = form.onSubmit(async (v) => {
    try {
      await api.post('/api/usuarios', v);
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      notifications.show({ color: 'teal', message: 'Usuário criado. Passe a senha para a pessoa pessoalmente.' });
      fechar();
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      else form.setFieldError('login', mensagemDeErro(e));
    }
  });
  return (
    <Modal opened onClose={fechar} title="Novo usuário">
      <form onSubmit={salvar}>
        <Stack>
          <TextInput label="Nome" autoFocus {...form.getInputProps('nome')} />
          <TextInput label="Usuário (para entrar)" {...form.getInputProps('login')} />
          <PasswordInput label="Senha inicial" description="Mínimo de 8 caracteres" {...form.getInputProps('senha')} />
          <Select label="Perfil" data={PERFIS} allowDeselect={false} {...form.getInputProps('perfil')} />
          <Button type="submit" loading={form.submitting}>Criar usuário</Button>
        </Stack>
      </form>
    </Modal>
  );
}

function ModalEditar({ usuario, souEu, fechar }: { usuario: Usuario; souEu: boolean; fechar: () => void }) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { nome: usuario.nome, perfil: usuario.perfil as string, ativo: usuario.ativo, nova_senha: '' },
    validate: { nova_senha: (v) => (v && v.length < 8 ? 'Mínimo de 8 caracteres' : null) },
  });
  const salvar = form.onSubmit(async ({ nova_senha, ...v }) => {
    try {
      await api.patch(`/api/usuarios/${usuario.id}`, { ...v, ...(nova_senha ? { nova_senha } : {}) });
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      notifications.show({ color: 'teal', message: 'Usuário atualizado.' });
      fechar();
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  const excluir = () =>
    modals.openConfirmModal({
      title: `Excluir o usuário ${usuario.login}?`,
      children: (
        <Text size="sm">
          {usuario.nome} não vai mais conseguir entrar e o usuário some da lista. Só é possível excluir quem ainda não
          fez nada no sistema; se já fez, use "Usuário ativo" para desativar.
        </Text>
      ),
      labels: { confirm: 'Excluir usuário', cancel: 'Voltar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api.delete(`/api/usuarios/${usuario.id}`);
          qc.invalidateQueries({ queryKey: ['usuarios'] });
          notifications.show({ color: 'teal', message: `Usuário ${usuario.login} excluído.` });
          fechar();
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e), autoClose: 10000 });
        }
      },
    });
  return (
    <Modal opened onClose={fechar} title={`Editar ${usuario.login}`}>
      <form onSubmit={salvar}>
        <Stack>
          <TextInput label="Nome" {...form.getInputProps('nome')} />
          <Select
            label="Perfil"
            data={PERFIS}
            allowDeselect={false}
            disabled={souEu}
            description={souEu ? 'Você não pode mudar o seu próprio perfil.' : undefined}
            {...form.getInputProps('perfil')}
          />
          <Switch
            label="Usuário ativo (pode entrar no sistema)"
            disabled={souEu}
            description={souEu ? 'Você não pode desativar o seu próprio usuário.' : undefined}
            {...form.getInputProps('ativo', { type: 'checkbox' })}
          />
          <PasswordInput label="Redefinir senha" description="Deixe em branco para manter a atual" {...form.getInputProps('nova_senha')} />
          <Button type="submit" loading={form.submitting}>Salvar</Button>
          {!souEu && (
            <>
              <Divider />
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={excluir}>
                Excluir usuário
              </Button>
            </>
          )}
        </Stack>
      </form>
    </Modal>
  );
}
