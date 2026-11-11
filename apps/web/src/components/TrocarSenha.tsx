import { Button, Modal, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api, mensagemDeErro } from '../api/client';

export function TrocarSenha({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const form = useForm({
    initialValues: { senha_atual: '', nova_senha: '', confirmar: '' },
    validate: {
      nova_senha: (v) => (v.length < 8 ? 'Mínimo de 8 caracteres' : null),
      confirmar: (v, t) => (v !== t.nova_senha ? 'As senhas não conferem' : null),
    },
  });
  const salvar = form.onSubmit(async ({ senha_atual, nova_senha }) => {
    try {
      await api.post('/api/auth/trocar-senha', { senha_atual, nova_senha });
      notifications.show({ color: 'teal', message: 'Senha alterada.' });
      form.reset();
      fechar();
    } catch (e) {
      form.setFieldError('senha_atual', mensagemDeErro(e));
    }
  });
  return (
    <Modal opened={aberto} onClose={fechar} title="Trocar minha senha">
      <form onSubmit={salvar}>
        <Stack>
          <PasswordInput label="Senha atual" autoFocus {...form.getInputProps('senha_atual')} />
          <PasswordInput label="Nova senha" {...form.getInputProps('nova_senha')} />
          <PasswordInput label="Repita a nova senha" {...form.getInputProps('confirmar')} />
          <Button type="submit" loading={form.submitting}>Salvar</Button>
        </Stack>
      </form>
    </Modal>
  );
}
