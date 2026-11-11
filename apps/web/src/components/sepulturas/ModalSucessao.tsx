import { Alert, Button, Grid, Modal, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ErroApi, mensagemDeErro } from '../../api/client';
import { dataIso } from '../../util/formatar';
import { mascaraCpf, mascaraData, mascaraTelefone } from '../../util/mascaras';
import { validarDataBr } from '../../util/socioForm';
import { CampoMascara } from '../CampoMascara';
import { confirmarSemDuplicados } from '../duplicados';
import { SeletorSocio } from '../SeletorSocio';

/** Familiar que assume as sepulturas do sócio falecido. */
export function ModalSucessao({ socio, fechar }: { socio: { id: number; nome: string }; fechar: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({
    initialValues: { modo: 'novo', destino: null as number | null, nome: '', nascimento: '', telefone: '', cpf: '' },
    validate: {
      destino: (v, t) => (t.modo === 'existente' && !v ? 'Escolha o sócio' : null),
      nome: (v, t) => (t.modo === 'novo' && v.trim().length < 3 ? 'Informe o nome completo' : null),
      nascimento: (v) => validarDataBr(v),
    },
  });
  const salvar = form.onSubmit(async (v) => {
    try {
      let corpo: object;
      if (v.modo === 'existente') {
        corpo = { socio_destino_id: v.destino };
      } else {
        const nascimento = v.nascimento ? dataIso(v.nascimento) : null;
        if (!(await confirmarSemDuplicados({ nome_completo: v.nome, data_nascimento: nascimento }))) return;
        corpo = {
          novo_socio: { nome_completo: v.nome, data_nascimento: nascimento, telefone: v.telefone.replace(/\D/g, ''), cpf: v.cpf },
        };
      }
      const r = await api.post<{ concluida: boolean; socio_destino_id: number }>(`/api/socios/${socio.id}/sucessao`, corpo);
      qc.invalidateQueries();
      notifications.show({
        color: 'teal',
        autoClose: 10_000,
        message: r.concluida
          ? 'Sepulturas transferidas.'
          : 'Taxa de associação gerada para o familiar. As sepulturas passam para ele assim que a taxa for paga.',
      });
      fechar();
      navigate(`/socios/${r.socio_destino_id}`);
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      notifications.show({ color: 'red', message: mensagemDeErro(e) });
    }
  });
  const novo = form.values.modo === 'novo';
  return (
    <Modal opened onClose={fechar} title={`Sucessão — ${socio.nome}`} size="lg">
      <form onSubmit={salvar}>
        <Stack gap="sm">
          <Text size="sm">
            Um familiar assume as sepulturas. Se ele ainda não é sócio (ou está sem associação), paga a taxa de associação e
            as sepulturas passam para ele quando a taxa for paga.
          </Text>
          <SegmentedControl
            data={[
              { value: 'novo', label: 'Cadastrar familiar' },
              { value: 'existente', label: 'Familiar já é sócio' },
            ]}
            {...form.getInputProps('modo')}
          />
          {novo ? (
            <Grid gap="sm">
              <Grid.Col span={12}>
                <TextInput label="Nome completo" withAsterisk autoFocus {...form.getInputProps('nome')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <CampoMascara label="Nascimento" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('nascimento')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <CampoMascara label="Telefone" mascara={mascaraTelefone} {...form.getInputProps('telefone')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <CampoMascara label="CPF" mascara={mascaraCpf} {...form.getInputProps('cpf')} />
              </Grid.Col>
            </Grid>
          ) : (
            <SeletorSocio
              label="Familiar"
              value={form.values.destino}
              onChange={(id) => form.setFieldValue('destino', id)}
              error={form.errors.destino}
            />
          )}
          <Alert variant="light" p="xs">
            {novo ? 'O restante do cadastro pode ser completado depois, na ficha do novo sócio.' : 'Se ele já for sócio ativo, a transferência é imediata.'}
          </Alert>
          <Button type="submit" loading={form.submitting}>Confirmar sucessão</Button>
        </Stack>
      </form>
    </Modal>
  );
}
