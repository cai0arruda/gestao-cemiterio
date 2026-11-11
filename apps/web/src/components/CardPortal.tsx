import { ActionIcon, Button, Card, CopyButton, Group, Image, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconCheck, IconCopy, IconExternalLink, IconRefresh } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { LinkPortal, Socio } from '@cemiterio/shared';
import { api, mensagemDeErro } from '../api/client';
import { useAuth } from '../auth';
import { useConfiguracoes } from '../hooks';

/** Link e QR code do portal do sócio — para mostrar no balcão ou mandar pelo WhatsApp. */
export function CardPortal({ socio }: { socio: Socio }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const chave = ['link-portal', socio.id];
  const { data } = useQuery({ queryKey: chave, queryFn: () => api.get<LinkPortal>(`/api/socios/${socio.id}/link-portal`) });
  const [qr, setQr] = useState<string | null>(null);
  const config = useConfiguracoes();

  useEffect(() => {
    if (data) QRCode.toDataURL(data.url, { margin: 1, width: 360 }).then(setQr);
  }, [data]);

  if (!data) return null;

  const telefone = (socio.telefone ?? '').replace(/\D/g, '');
  const mensagem = `Olá! Este é o seu link de sócio do ${config.data?.configuracoes.cemiterio_nome ?? 'cemitério'}: ${data.url}\nPor ele você confere se está em dia e os recibos.`;
  const whatsapp = telefone.length >= 10 ? `https://wa.me/55${telefone}?text=${encodeURIComponent(mensagem)}` : null;

  const gerarNovo = () =>
    modals.openConfirmModal({
      title: 'Gerar novo link?',
      children: (
        <Text size="sm">
          O link atual e os QR codes dos recibos já impressos deixam de funcionar. Use se o sócio perdeu o recibo ou o
          link foi parar com outra pessoa.
        </Text>
      ),
      labels: { confirm: 'Gerar novo link', cancel: 'Cancelar' },
      confirmProps: { color: 'orange' },
      onConfirm: async () => {
        try {
          qc.setQueryData(chave, await api.post<LinkPortal>(`/api/socios/${socio.id}/link-portal/novo`));
          qc.invalidateQueries({ queryKey: ['historico-socio', socio.id] });
          notifications.show({ color: 'teal', message: 'Novo link gerado.' });
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemDeErro(e) });
        }
      },
    });

  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>Portal do sócio</Text>
        {usuario?.perfil === 'admin' && (
          <Tooltip label="Gerar novo link (invalida o atual)">
            <ActionIcon variant="subtle" color="gray" onClick={gerarNovo}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        É o mesmo QR code do recibo. O sócio vê se está em dia, sem dados pessoais.
      </Text>
      {qr && <Image src={qr} w={150} h={150} mx="auto" alt="QR code do portal" />}
      <Group gap="xs" justify="center" mt="xs">
        <CopyButton value={data.url}>
          {({ copied, copy }) => (
            <Button size="xs" variant="light" onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
          )}
        </CopyButton>
        <Button size="xs" variant="default" component="a" href={data.url} target="_blank" leftSection={<IconExternalLink size={14} />}>
          Abrir
        </Button>
        {whatsapp && (
          <Button size="xs" color="green" component="a" href={whatsapp} target="_blank" leftSection={<IconBrandWhatsapp size={14} />}>
            WhatsApp
          </Button>
        )}
      </Group>
    </Card>
  );
}
