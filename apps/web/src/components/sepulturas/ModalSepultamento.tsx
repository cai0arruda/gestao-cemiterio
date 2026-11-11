import { Alert, Button, Checkbox, Grid, Modal, SegmentedControl, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { SepulturaResumo, VerificacaoDireito } from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../../api/client';
import { useAuth } from '../../auth';
import { hojeIso } from '../../hooks';
import { dataBr, dataIso } from '../../util/formatar';
import { mascaraData } from '../../util/mascaras';
import { validarDataBr } from '../../util/socioForm';
import { CampoMascara } from '../CampoMascara';
import { SeletorSocio } from '../SeletorSocio';
import { ChecklistDireito } from './ChecklistDireito';

/**
 * Registro de sepultamento. Pode vir da sepultura (sepultura fixa, sócio = titular) ou do sócio
 * (sócio fixo, escolhe entre as sepulturas dele).
 */
export function ModalSepultamento({
  fechar,
  sepulturaFixa,
  socioInicial,
  sepulturasDoSocio,
  aoRegistrar,
}: {
  fechar: () => void;
  sepulturaFixa?: { id: number; codigo: string };
  socioInicial?: { id: number; nome: string } | null;
  sepulturasDoSocio?: SepulturaResumo[];
  aoRegistrar: (r: { sugerir_sucessao: boolean; socio_id: number | null }) => void;
}) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const admin = usuario?.perfil === 'admin';
  const form = useForm({
    initialValues: {
      modo: 'agora',
      sepultura_id: sepulturaFixa ? String(sepulturaFixa.id) : (sepulturasDoSocio?.[0] ? String(sepulturasDoSocio[0].id) : ''),
      socio_direito_id: socioInicial?.id ?? (null as number | null),
      socio_nome: socioInicial?.nome ?? '',
      sepultado_e_socio: false,
      nome_sepultado: '',
      parentesco: '',
      data_nascimento: '',
      data_falecimento: '',
      data_sepultamento: dataBr(hojeIso()),
      certidao_obito: '',
      observacoes: '',
      justificativa_excecao: '',
    },
    validate: {
      sepultura_id: (v) => (v ? null : 'Escolha a sepultura'),
      socio_direito_id: (v, t) => (t.modo === 'agora' && !v ? 'Escolha o sócio' : null),
      nome_sepultado: (v) => (v.trim().length < 3 ? 'Informe o nome' : null),
      data_nascimento: (v) => validarDataBr(v),
      data_falecimento: (v) => validarDataBr(v),
      data_sepultamento: (v) => (v ? validarDataBr(v) : 'Informe a data'),
    },
  });
  const v = form.values;
  const agora = v.modo === 'agora';

  // Ao marcar "é o próprio sócio", preenche o nome.
  useEffect(() => {
    if (v.sepultado_e_socio && v.socio_nome) form.setFieldValue('nome_sepultado', v.socio_nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.sepultado_e_socio, v.socio_nome]);

  const verificacao = useQuery({
    queryKey: ['direito', v.socio_direito_id, v.sepultura_id],
    queryFn: () => api.get<VerificacaoDireito>(`/api/socios/${v.socio_direito_id}/direito?sepultura_id=${v.sepultura_id}`),
    enabled: agora && !!v.socio_direito_id && !!v.sepultura_id,
  });
  const falha = agora && verificacao.data && !verificacao.data.pode;

  const salvar = form.onSubmit(async (x) => {
    if (falha && (!admin || x.justificativa_excecao.trim().length < 5)) {
      form.setFieldError('justificativa_excecao', admin ? 'Explique por que está registrando mesmo assim' : undefined);
      return;
    }
    try {
      const r = await api.post<{ id: number; sugerir_sucessao: boolean }>('/api/sepultamentos', {
        sepultura_id: Number(x.sepultura_id),
        socio_direito_id: x.socio_direito_id,
        sepultado_e_socio: agora && x.sepultado_e_socio,
        nome_sepultado: x.nome_sepultado,
        parentesco: x.parentesco,
        data_nascimento: x.data_nascimento ? dataIso(x.data_nascimento) : null,
        data_falecimento: x.data_falecimento ? dataIso(x.data_falecimento) : null,
        data_sepultamento: dataIso(x.data_sepultamento),
        certidao_obito: x.certidao_obito,
        observacoes: x.observacoes,
        historico: !agora,
        justificativa_excecao: falha ? x.justificativa_excecao : null,
      });
      notifications.show({ color: 'teal', message: 'Sepultamento registrado.' });
      qc.invalidateQueries();
      aoRegistrar({ sugerir_sucessao: r.sugerir_sucessao, socio_id: x.socio_direito_id });
      fechar();
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      notifications.show({ color: 'red', title: 'Não registrado', message: mensagemDeErro(e), autoClose: 10_000 });
    }
  });

  return (
    <Modal opened onClose={fechar} size="lg" title={`Registrar sepultamento${sepulturaFixa ? ` — ${sepulturaFixa.codigo}` : ''}`}>
      <form onSubmit={salvar}>
        <Stack gap="sm">
          <SegmentedControl
            data={[
              { value: 'agora', label: 'Sepultamento novo' },
              { value: 'antigo', label: 'Lançamento antigo (ficha)' },
            ]}
            {...form.getInputProps('modo')}
          />
          {!agora && (
            <Text size="xs" c="dimmed">
              Para registrar quem já está sepultado (digitação das fichas): não confere as regras e não muda a situação de
              nenhum sócio.
            </Text>
          )}

          {sepulturasDoSocio && (
            <Select
              label="Sepultura"
              data={sepulturasDoSocio.map((s) => ({ value: String(s.id), label: `${s.codigo} (${s.ocupacao} de ${s.capacidade})` }))}
              allowDeselect={false}
              {...form.getInputProps('sepultura_id')}
            />
          )}

          <SeletorSocio
            label={agora ? 'Sócio que está usando o direito' : 'Sócio relacionado (opcional)'}
            withAsterisk={agora}
            value={v.socio_direito_id}
            nomeInicial={socioInicial?.nome}
            disabled={!!sepulturasDoSocio}
            onChange={(id, s) => {
              form.setFieldValue('socio_direito_id', id);
              form.setFieldValue('socio_nome', s?.nome_completo ?? '');
            }}
            error={form.errors.socio_direito_id}
          />

          {agora && (
            <Checkbox label="Quem foi sepultado é o próprio sócio" {...form.getInputProps('sepultado_e_socio', { type: 'checkbox' })} />
          )}

          {agora && verificacao.data && (
            <Alert color={verificacao.data.pode ? 'teal' : 'red'} variant="light" title={verificacao.data.pode ? 'Tudo certo para registrar' : 'Não atende às regras'}>
              <ChecklistDireito v={verificacao.data} />
            </Alert>
          )}

          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: v.sepultado_e_socio ? 12 : 8 }}>
              <TextInput label="Nome de quem foi sepultado" withAsterisk {...form.getInputProps('nome_sepultado')} />
            </Grid.Col>
            {!v.sepultado_e_socio && (
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput label="Parentesco com o sócio" placeholder="ex.: esposa, filho" {...form.getInputProps('parentesco')} />
              </Grid.Col>
            )}
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <CampoMascara label="Nascimento" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data_nascimento')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <CampoMascara label="Falecimento" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data_falecimento')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <CampoMascara label="Sepultamento" withAsterisk mascara={mascaraData} {...form.getInputProps('data_sepultamento')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4 }}>
              <TextInput label="Nº certidão de óbito" {...form.getInputProps('certidao_obito')} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label="Observações" {...form.getInputProps('observacoes')} />
            </Grid.Col>
          </Grid>

          {falha && admin && (
            <Textarea
              label="Justificativa para registrar mesmo assim (exceção)"
              description="Fica gravada no registro e no histórico."
              {...form.getInputProps('justificativa_excecao')}
            />
          )}
          {falha && !admin && (
            <Alert color="red" variant="light">Só um administrador pode registrar um sepultamento fora das regras.</Alert>
          )}

          <Button type="submit" loading={form.submitting} color={falha ? 'orange' : undefined} disabled={!!falha && !admin}>
            {falha ? 'Registrar como exceção' : 'Registrar sepultamento'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
