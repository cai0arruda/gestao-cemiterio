import {
  Alert,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Image,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconCheck, IconCurrentLocation, IconMapPin } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ROTULO_TIPO_SEPULTURA, TIPOS_SEPULTURA, type SepulturaDetalhe, type SepulturaResumo } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../api/client';
import { gpsDisponivel, useGps } from '../components/mapa/gps';
import { MapaPosicionar } from '../components/mapa/MapaPosicionar';
import { SeletorSocio } from '../components/SeletorSocio';

/**
 * Cadastro em campo (celular): em pé ao lado da sepultura, tira a foto, usa o GPS
 * (ou toca no mapa) e salva. Também serve para posicionar sepulturas já cadastradas.
 */
export function Campo() {
  const qc = useQueryClient();
  const [modo, setModo] = useState<'nova' | 'existente'>('nova');
  const { leitura, erro } = useGps(true);
  const [posicao, setPosicao] = useState<[number, number] | null>(null);
  const [seguirGps, setSeguirGps] = useState(true);
  const [foto, setFoto] = useState<File | null>(null);
  const [tipo, setTipo] = useState<string>('tumulo');
  const [capacidade, setCapacidade] = useState<number | string>(1);
  const [referencia, setReferencia] = useState('');
  const [titular, setTitular] = useState<number | null>(null);
  const [existenteId, setExistenteId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [feitas, setFeitas] = useState<{ id: number; codigo: string }[]>([]);

  // Enquanto o usuário não arrastar o pin, ele acompanha o GPS.
  useEffect(() => {
    if (seguirGps && leitura) setPosicao([leitura.latitude, leitura.longitude]);
  }, [leitura, seguirGps]);

  const urlFoto = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(() => () => { if (urlFoto) URL.revokeObjectURL(urlFoto); }, [urlFoto]);

  const sepulturas = useQuery({
    queryKey: ['sepulturas', '', 'todas'],
    queryFn: () => api.get<{ sepulturas: SepulturaResumo[] }>('/api/sepulturas'),
    enabled: modo === 'existente',
  });

  const limpar = () => {
    setFoto(null);
    setReferencia('');
    setTitular(null);
    setExistenteId(null);
    setSeguirGps(true);
    setPosicao(leitura ? [leitura.latitude, leitura.longitude] : null);
  };

  async function enviarFoto(id: number) {
    if (!foto) return;
    const fd = new FormData();
    fd.append('arquivo', foto);
    await api.post(`/api/sepulturas/${id}/fotos`, fd);
  }

  async function salvar() {
    if (!posicao) return;
    setSalvando(true);
    try {
      let id: number;
      let codigo: string;
      if (modo === 'nova') {
        const r = await api.post<{ sepultura: SepulturaDetalhe }>('/api/sepulturas', {
          tipo,
          capacidade: Number(capacidade),
          referencia,
          socio_id: titular,
          data_aquisicao: null,
        });
        id = r.sepultura.id;
        codigo = r.sepultura.codigo;
      } else {
        id = Number(existenteId);
        codigo = sepulturas.data?.sepulturas.find((s) => s.id === id)?.codigo ?? '';
      }
      await api.put(`/api/sepulturas/${id}/localizacao`, { latitude: posicao[0], longitude: posicao[1] });
      try {
        await enviarFoto(id);
      } catch (e) {
        notifications.show({ color: 'orange', title: 'Posição salva, mas a foto falhou', message: mensagemDeErro(e) });
      }
      notifications.show({ color: 'teal', icon: <IconCheck size={16} />, message: `${codigo} salva.` });
      setFeitas((f) => [{ id, codigo }, ...f]);
      qc.invalidateQueries({ queryKey: ['mapa'] });
      qc.invalidateQueries({ queryKey: ['sepulturas'] });
      limpar();
    } catch (e) {
      notifications.show({ color: 'red', title: 'Não foi possível salvar', message: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  const podeSalvar = !!posicao && (modo === 'nova' || !!existenteId);

  return (
    <Stack maw={560} mx="auto" gap="sm">
      <Group justify="space-between">
        <Title order={2}>Cadastro em campo</Title>
        {feitas.length > 0 && <Badge size="lg" variant="light">{feitas.length} hoje</Badge>}
      </Group>
      <SegmentedControl
        fullWidth
        value={modo}
        onChange={(v) => setModo(v as 'nova' | 'existente')}
        data={[
          { value: 'nova', label: 'Nova sepultura' },
          { value: 'existente', label: 'Posicionar existente' },
        ]}
      />

      {!gpsDisponivel() && (
        <Alert color="orange" variant="light" p="xs">
          O GPS do celular só funciona com conexão segura (HTTPS). Enquanto isso, toque no mapa para marcar a posição.
        </Alert>
      )}
      {gpsDisponivel() && erro && <Alert color="orange" variant="light" p="xs">{erro}</Alert>}

      <Card withBorder p={0} className="card-tabela">
        <MapaPosicionar
          posicao={posicao}
          editavel
          aoMudar={(lat, lng) => {
            setSeguirGps(false);
            setPosicao([lat, lng]);
          }}
          gps={leitura}
          altura="42dvh"
        />
        <Group p="xs" justify="space-between">
          <Text size="xs" c={leitura ? (leitura.precisao > 10 ? 'orange' : 'teal') : 'dimmed'}>
            {leitura ? `GPS: precisão de ${Math.round(leitura.precisao)} m` : gpsDisponivel() && !erro ? 'Procurando o GPS…' : 'GPS indisponível'}
          </Text>
          {!seguirGps && leitura && (
            <Button size="compact-xs" variant="subtle" leftSection={<IconCurrentLocation size={12} />} onClick={() => setSeguirGps(true)}>
              voltar ao GPS
            </Button>
          )}
        </Group>
      </Card>

      {modo === 'nova' ? (
        <Card withBorder>
          <Stack gap="xs">
            <Group grow>
              <Select
                label="Tipo"
                data={TIPOS_SEPULTURA.map((t) => ({ value: t, label: ROTULO_TIPO_SEPULTURA[t] }))}
                value={tipo}
                onChange={(v) => v && setTipo(v)}
                allowDeselect={false}
              />
              <NumberInput label="Lugares" min={1} max={50} value={capacidade} onChange={setCapacidade} />
            </Group>
            <TextInput label="Referência" placeholder="Ex.: perto do cruzeiro" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />
            <SeletorSocio label="Titular (se já tiver dono)" value={titular} onChange={(id) => setTitular(id)} />
          </Stack>
        </Card>
      ) : (
        <Card withBorder>
          <Select
            label="Sepultura"
            searchable
            placeholder="Digite o código ou o titular"
            data={(sepulturas.data?.sepulturas ?? []).map((s) => ({
              value: String(s.id),
              label: `${s.codigo}${s.socio_nome ? ` — ${s.socio_nome}` : ''}${s.tem_localizacao ? ' (já no mapa)' : ''}`,
            }))}
            value={existenteId}
            onChange={setExistenteId}
          />
        </Card>
      )}

      <Card withBorder>
        <Group justify="space-between">
          <FileButton onChange={setFoto} accept="image/*" capture="environment">
            {(p) => (
              <Button variant="light" leftSection={<IconCamera size={18} />} {...p}>
                {foto ? 'Tirar outra foto' : 'Tirar foto'}
              </Button>
            )}
          </FileButton>
          {urlFoto && <Image src={urlFoto} h={64} w={64} fit="cover" radius="sm" />}
        </Group>
      </Card>

      <Button size="lg" leftSection={<IconMapPin size={20} />} onClick={salvar} loading={salvando} disabled={!podeSalvar}>
        {modo === 'nova' ? 'Cadastrar sepultura aqui' : 'Salvar posição'}
      </Button>

      {feitas.length > 0 && (
        <Text size="xs" c="dimmed">
          Salvas agora:{' '}
          {feitas.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ', '}
              <Link to={`/sepulturas/${f.id}`}>{f.codigo}</Link>
            </span>
          ))}
        </Text>
      )}
    </Stack>
  );
}
