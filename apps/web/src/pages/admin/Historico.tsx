import { Anchor, Card, Code, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { RegistroAuditoria } from '@cemiterio/shared';
import { api } from '../../api/client';
import { dataHoraBr } from '../../util/formatar';

const ACOES: Record<string, string> = {
  configuracao_inicial: 'Configuração inicial',
  login: 'Entrou no sistema',
  trocar_senha: 'Trocou a senha',
  criar: 'Criou',
  atualizar: 'Alterou',
  excluir: 'Excluiu',
  anexar_documento: 'Anexou foto',
  excluir_documento: 'Excluiu foto',
  ajuste_manual_situacao: 'Ajustou situação',
  backup_manual: 'Fez backup',
  baixar_backup: 'Baixou backup',
  definir_valor: 'Cadastrou valor',
  reajustar_valor: 'Reajustou valor',
  gerar_anuidades: 'Gerou anuidades',
  gerar_taxa_associacao: 'Gerou taxa de associação',
  cancelar_cobranca: 'Cancelou cobrança',
  registrar_pagamento: 'Registrou pagamento',
  estornar_pagamento: 'Estornou pagamento',
  lancar_anuidades_antigas: 'Lançou anuidades antigas',
  reimprimir_recibo: 'Reimprimiu recibo',
  alterar_configuracoes: 'Alterou configurações',
  novo_link_portal: 'Gerou novo link do portal do',
  iniciar_venda: 'Iniciou a venda da',
  transferir_titularidade: 'Transferiu a titularidade da',
  anexar_foto: 'Anexou foto da',
  excluir_foto: 'Excluiu foto da',
  registrar_sepultamento: 'Registrou sepultamento —',
  excluir_sepultamento: 'Excluiu registro de sepultamento da',
  sucessao_iniciada: 'Iniciou sucessão do',
  sucessao_concluida: 'Concluiu sucessão do',
  sucessao_cancelada: 'Cancelou sucessão do',
  definir_localizacao: 'Posicionou no mapa a',
  remover_localizacao: 'Tirou do mapa a',
  salvar_setor: 'Salvou setor',
  excluir_setor: 'Excluiu setor',
  definir_posicao_mapa: 'Definiu a posição inicial do mapa',
  enviar_imagem_aerea: 'Enviou imagem aérea',
  ajustar_imagem_aerea: 'Ajustou imagem aérea',
  remover_imagem_aerea: 'Removeu imagem aérea',
  aviso_cobranca: 'Enviou cobrança ao',
  gerar_anuidades_socio: 'Gerou anuidades do',
  excluir_cobranca: 'Excluiu anuidade do',
  registrar_exumacao: 'Registrou exumação na',
  receber_restos: 'Recebeu restos transferidos na',
  desfazer_exumacao: 'Desfez exumação na',
  aviso_lembrete: 'Enviou lembrete ao',
};
const ENTIDADES: Record<string, string> = { socio: 'sócio', usuario: 'usuário', sistema: '', valor: '', sepultura: 'sepultura', setor: '' };

export function Historico() {
  const { data } = useQuery({
    queryKey: ['auditoria'],
    queryFn: () => api.get<{ registros: RegistroAuditoria[] }>('/api/auditoria?limite=500'),
  });
  return (
    <>
      <Title order={2} mb="xs">Histórico de alterações</Title>
      <Text size="sm" c="dimmed" mb="md">Últimas 500 ações registradas no sistema.</Text>
      <Card withBorder p={0} className="card-tabela">
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing={6} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={140}>Quando</Table.Th>
                <Table.Th w={160}>Quem</Table.Th>
                <Table.Th>O quê</Table.Th>
                <Table.Th>Detalhes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.registros.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>{dataHoraBr(r.criado_em)}</Table.Td>
                  <Table.Td>{r.usuario_nome ?? '—'}</Table.Td>
                  <Table.Td>
                    {ACOES[r.acao] ?? r.acao} {ENTIDADES[r.entidade] ?? r.entidade}
                    {(r.entidade === 'socio' || r.entidade === 'sepultura') && r.entidade_id && r.acao !== 'excluir' && (
                      <> <Anchor component={Link} to={`/${r.entidade === 'socio' ? 'socios' : 'sepulturas'}/${r.entidade_id}`} size="sm">#{r.entidade_id}</Anchor></>
                    )}
                  </Table.Td>
                  <Table.Td>{r.detalhes && <Code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.detalhes}</Code>}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </>
  );
}
