import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  FileInput,
  Grid,
  Group,
  Kbd,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconCheck, IconDeviceFloppy } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Socio } from '@cemiterio/shared';
import { api, ErroApi, mensagemDeErro } from '../api/client';
import { CampoMascara } from '../components/CampoMascara';
import { CamposEndereco } from '../components/CamposEndereco';
import { enviarDocumento } from '../components/DocumentosSocio';
import { confirmarSemDuplicados } from '../components/duplicados';
import { mascaraData, mascaraTelefone } from '../util/mascaras';
import { validarDataBr, valoresParaInput, valoresVazios, type ValoresSocio } from '../util/socioForm';

interface Feito {
  socio: Socio;
  comFoto: boolean;
}

/**
 * Tela para digitar as fichas em papel em sequência: tudo pelo teclado,
 * Enter salva e já abre a próxima ficha mantendo cidade/UF.
 */
export function CadastroRapido() {
  const qc = useQueryClient();
  const nomeRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [feitos, setFeitos] = useState<Feito[]>([]);

  const proxima = useQuery({
    queryKey: ['proxima-matricula'],
    queryFn: () => api.get<{ matricula: string }>('/api/socios/proxima-matricula'),
  });

  const form = useForm<ValoresSocio>({
    initialValues: valoresVazios(),
    validate: {
      nome_completo: (v) => (v.trim().length < 3 ? 'Informe o nome completo' : null),
      data_nascimento: (v) => validarDataBr(v),
      data_associacao: (v) => validarDataBr(v),
    },
  });

  const salvar = form.onSubmit(async (v) => {
    const corpo = valoresParaInput(v);
    try {
      const seguir = await confirmarSemDuplicados({
        nome_completo: v.nome_completo,
        data_nascimento: corpo.data_nascimento as string | null,
      });
      if (!seguir) return;
      const { socio } = await api.post<{ socio: Socio }>('/api/socios', corpo);

      let comFoto = false;
      if (foto) {
        try {
          await enviarDocumento(socio.id, foto);
          comFoto = true;
        } catch (e) {
          notifications.show({ color: 'orange', title: 'Sócio salvo, mas a foto falhou', message: mensagemDeErro(e) });
        }
      }

      setFeitos((l) => [{ socio, comFoto }, ...l]);
      notifications.show({ color: 'teal', icon: <IconCheck size={16} />, message: `${socio.matricula} — ${socio.nome_completo} cadastrado.` });
      qc.invalidateQueries({ queryKey: ['socios'] });
      await qc.invalidateQueries({ queryKey: ['proxima-matricula'] });

      // Mantém cidade/UF (normalmente as fichas são da mesma região).
      form.setValues(valoresVazios({ cidade: v.cidade, uf: v.uf }));
      form.resetDirty();
      setFoto(null);
      nomeRef.current?.focus();
    } catch (e) {
      if (e instanceof ErroApi && e.campos) form.setErrors(e.campos);
      else if (e instanceof ErroApi && e.codigo === 'cpf_duplicado') form.setFieldError('cpf', e.message);
      else if (e instanceof ErroApi && e.codigo === 'matricula_duplicada') form.setFieldError('matricula', e.message);
      notifications.show({ color: 'red', title: 'Não foi possível salvar', message: mensagemDeErro(e) });
    }
  });

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Title order={2}>Cadastro rápido</Title>
        {feitos.length > 0 && <Badge size="lg" variant="light">{feitos.length} nesta sessão</Badge>}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Para digitar as fichas em papel em sequência. Use <Kbd>Tab</Kbd> para passar de campo e <Kbd>Enter</Kbd> para
        salvar e começar a próxima. Só o nome é obrigatório; o que faltar pode ser completado depois.
      </Text>

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder>
            <form onSubmit={salvar}>
              <Stack gap="sm">
                <Grid gap="sm">
                  <Grid.Col span={{ base: 4, sm: 2 }}>
                    <TextInput
                      label="Matrícula"
                      size="sm"
                      placeholder={proxima.data?.matricula}
                      {...form.getInputProps('matricula')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, sm: 10 }}>
                    <TextInput label="Nome completo" size="sm" withAsterisk autoFocus ref={nomeRef} {...form.getInputProps('nome_completo')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <CampoMascara label="Nascimento" size="sm" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data_nascimento')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <CampoMascara label="Telefone" size="sm" placeholder="(00) 00000-0000" mascara={mascaraTelefone} {...form.getInputProps('telefone')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <CampoMascara label="Telefone 2" size="sm" mascara={mascaraTelefone} {...form.getInputProps('telefone2')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <CampoMascara label="Associado em" size="sm" placeholder="DD/MM/AAAA" mascara={mascaraData} {...form.getInputProps('data_associacao')} />
                  </Grid.Col>
                </Grid>
                <CamposEndereco form={form} compacto />
                <Grid gap="sm" align="flex-end">
                  <Grid.Col span={{ base: 12, sm: 7 }}>
                    <TextInput label="Observações" size="sm" {...form.getInputProps('observacoes')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 5 }}>
                    <FileInput
                      label="Foto da ficha (opcional)"
                      size="sm"
                      accept="image/*"
                      clearable
                      placeholder="Selecionar imagem"
                      leftSection={<IconCamera size={16} />}
                      value={foto}
                      onChange={setFoto}
                    />
                  </Grid.Col>
                </Grid>
                <Group justify="flex-end">
                  <Button type="submit" loading={form.submitting} leftSection={<IconDeviceFloppy size={18} />}>
                    Salvar e próximo
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card withBorder>
            <Text fw={600} mb="sm">Cadastrados agora</Text>
            {feitos.length === 0 ? (
              <Text size="sm" c="dimmed">Os sócios salvos nesta tela aparecem aqui.</Text>
            ) : (
              <Stack gap={6}>
                {feitos.map(({ socio, comFoto }) => (
                  <Group key={socio.id} justify="space-between" wrap="nowrap">
                    <Anchor component={Link} to={`/socios/${socio.id}`} size="sm" lineClamp={1}>
                      {socio.matricula} — {socio.nome_completo}
                    </Anchor>
                    {!comFoto && <Badge size="xs" color="gray" variant="outline">sem foto</Badge>}
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
          <Alert mt="md" color="blue" variant="light" title="Dica">
            Dá para fotografar várias fichas pelo celular primeiro e anexar depois, abrindo cada sócio.
          </Alert>
        </Grid.Col>
      </Grid>
    </>
  );
}
