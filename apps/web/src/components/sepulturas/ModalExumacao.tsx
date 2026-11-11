import { Alert, Button, Modal, Radio, Select, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DESTINOS_EXUMACAO, ROTULO_DESTINO_EXUMACAO, ROTULO_TIPO_SEPULTURA, type Sepultado, type SepulturaResumo } from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../../api/client';
import { hojeIso } from '../../hooks';
import { dataBr, dataIso } from '../../util/formatar';
import { mascaraData } from '../../util/mascaras';
import { validarDataBr } from '../../util/socioForm';
import { CampoMascara } from '../CampoMascara';

/** Registra a exumação: o registro fica no histórico e o lugar na sepultura é liberado. */
export function ModalExumacao({ registro, fechar }: { registro: Sepultado; fechar: () => void }) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { data: dataBr(hojeIso()), destino: 'mesma_sepultura' as string, sepultura_destino_id: null as string | null, observacao: '' },
    validate: {
      data: (v) => (v ? validarDataBr(v) : 'Informe a data'),
      sepultura_destino_id: (v, t) => (t.destino === 'outra_sepultura' && !v ? 'Escolha a sepultura' : null),
    },
  });
  const paraOutra = form.values.destino === 'outra_sepultura';
  const sepulturas = useQuery({
    queryKey: ['sepulturas', '', 'todas'],
    queryFn: () => api.get<{ sepulturas: SepulturaResumo[] }>('/api/sepulturas'),
    enabled: paraOutra,
  });
  const opcoes = (sepulturas.data?.sepulturas ?? [])
    .filter((s) => s.id !== registro.sepultura_id)
    // Ossuários primeiro, que é o destino mais comum.
    .sort((a, b) => Number(b.tipo === 'ossuario') - Number(a.tipo === 'ossuario') || a.codigo.localeCompare(b.codigo))
    .map((s) => ({
      value: String(s.id),
      label: `${s.codigo} — ${ROTULO_TIPO_SEPULTURA[s.tipo]} (${s.ocupacao} de ${s.capacidade})${s.socio_nome ? ` · ${s.socio_nome}` : ''}`,
      disabled: s.ocupacao >= s.capacidade,
    }));

  const salvar = form.onSubmit(async (v) => {
    try {
      await api.post(`/api/sepultamentos/${registro.id}/exumar`, {
        data_exumacao: dataIso(v.data),
        destino: v.destino,
        sepultura_destino_id: paraOutra ? Number(v.sepultura_destino_id) : null,
        observacao: v.observacao,
      });
      notifications.show({ color: 'teal', message: `Exumação de ${registro.nome_sepultado} registrada. O lugar foi liberado.` });
      qc.invalidateQueries();
      fechar();
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      notifications.show({ color: 'red', title: 'Não registrada', message: mensagemDeErro(e), autoClose: 10_000 });
    }
  });

  return (
    <Modal opened onClose={fechar} title={`Exumação — ${registro.nome_sepultado}`}>
      <form onSubmit={salvar}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            O registro do sepultamento continua guardado no histórico e o lugar na sepultura {registro.sepultura_codigo} é
            liberado para um novo sepultamento.
          </Text>
          <CampoMascara label="Data da exumação" withAsterisk mascara={mascaraData} {...form.getInputProps('data')} />
          <Radio.Group label="Para onde foram os restos" {...form.getInputProps('destino')}>
            <Stack gap={6} mt={6}>
              {DESTINOS_EXUMACAO.map((d) => (
                <Radio key={d} value={d} label={ROTULO_DESTINO_EXUMACAO[d]} />
              ))}
            </Stack>
          </Radio.Group>
          {paraOutra && (
            <Select
              label="Sepultura de destino"
              searchable
              placeholder="Digite o código"
              data={opcoes}
              nothingFoundMessage="Nenhuma sepultura encontrada"
              {...form.getInputProps('sepultura_destino_id')}
            />
          )}
          {form.values.destino === 'mesma_sepultura' && (
            <Alert variant="light" p="xs">
              O nome continua aparecendo nesta sepultura (como “ossada no local”) e na busca de quem está sepultado.
            </Alert>
          )}
          {paraOutra && (
            <Alert variant="light" p="xs">
              O nome também passa a constar na sepultura de destino, com a indicação de onde veio.
            </Alert>
          )}
          <Textarea label="Observação" placeholder="Ex.: a pedido da família; autorização nº…" autosize minRows={2} {...form.getInputProps('observacao')} />
          <Button type="submit" loading={form.submitting}>Registrar exumação</Button>
        </Stack>
      </form>
    </Modal>
  );
}
