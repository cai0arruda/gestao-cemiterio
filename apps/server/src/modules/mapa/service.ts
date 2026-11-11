import { and, eq, isNotNull, sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { pontoNoPoligono, type AneisPoligono, type ConfigMapa, type PinSepultura, type Setor } from '@cemiterio/shared';
import type { DB } from '../../db/index.js';
import { configuracoes, sepulturas, setores, socios } from '../../db/schema.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { conflito, naoEncontrado, requisicaoInvalida } from '../../shared/erros.js';
import { agoraIso } from '../../shared/tempo.js';
import { obterLinhaSepultura } from '../sepulturas/service.js';

type Tx = Pick<DB, 'select' | 'insert' | 'update' | 'delete'>;

// ---------------- Setores ----------------

function lerSetores(db: Tx) {
  return db
    .select()
    .from(setores)
    .all()
    .map((s) => ({ ...s, aneis: JSON.parse(s.poligono) as AneisPoligono }));
}

/** Setor em que o ponto cai (o primeiro que contém, se houver sobreposição). */
function setorDoPonto(lista: ReturnType<typeof lerSetores>, lat: number | null, lng: number | null): number | null {
  if (lat === null || lng === null) return null;
  return lista.find((s) => pontoNoPoligono(lat, lng, s.aneis))?.id ?? null;
}

/** Recalcula o setor de todas as sepulturas (depois de criar/alterar/excluir um setor). */
export function recalcularSetores(tx: Tx) {
  const lista = lerSetores(tx);
  for (const s of tx.select().from(sepulturas).all()) {
    const novo = setorDoPonto(lista, s.latitude, s.longitude);
    if (novo !== s.setorId) tx.update(sepulturas).set({ setorId: novo }).where(eq(sepulturas.id, s.id)).run();
  }
}

export function listarSetores(db: DB): Setor[] {
  const contagem = new Map(
    db
      .select({ setorId: sepulturas.setorId, n: sql<number>`count(*)` })
      .from(sepulturas)
      .where(isNotNull(sepulturas.setorId))
      .groupBy(sepulturas.setorId)
      .all()
      .map((c) => [c.setorId, c.n]),
  );
  return lerSetores(db)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((s) => ({ id: s.id, nome: s.nome, cor: s.cor, poligono: s.aneis, qtd_sepulturas: contagem.get(s.id) ?? 0 }));
}

export function salvarSetor(
  db: DB,
  id: number | null,
  d: { nome: string; cor: string; poligono: AneisPoligono },
  usuarioId: number,
) {
  // Fecha o anel se o desenho não terminou no ponto inicial.
  const aneis = d.poligono.map((anel) => {
    const [p, u] = [anel[0]!, anel.at(-1)!];
    return p[0] === u[0] && p[1] === u[1] ? anel : [...anel, p];
  });
  db.transaction((tx) => {
    const mesmoNome = tx.select({ id: setores.id }).from(setores).where(eq(setores.nome, d.nome)).get();
    if (mesmoNome && mesmoNome.id !== id) throw conflito(`Já existe um setor chamado "${d.nome}".`);
    if (id) {
      if (!tx.select({ id: setores.id }).from(setores).where(eq(setores.id, id)).get()) throw naoEncontrado('Setor');
      tx.update(setores).set({ nome: d.nome, cor: d.cor, poligono: JSON.stringify(aneis) }).where(eq(setores.id, id)).run();
    } else {
      id = tx.insert(setores).values({ nome: d.nome, cor: d.cor, poligono: JSON.stringify(aneis) }).returning().get().id;
    }
    recalcularSetores(tx);
    registrarAuditoria(tx, { usuarioId, acao: 'salvar_setor', entidade: 'setor', entidadeId: id, detalhes: { nome: d.nome } });
  });
}

export function excluirSetor(db: DB, id: number, usuarioId: number) {
  db.transaction((tx) => {
    const s = tx.select().from(setores).where(eq(setores.id, id)).get();
    if (!s) throw naoEncontrado('Setor');
    tx.delete(setores).where(eq(setores.id, id)).run();
    recalcularSetores(tx);
    registrarAuditoria(tx, { usuarioId, acao: 'excluir_setor', entidade: 'setor', entidadeId: id, detalhes: { nome: s.nome } });
  });
}

// ---------------- Localização das sepulturas ----------------

export function definirLocalizacao(db: DB, id: number, latitude: number | null, longitude: number | null, usuarioId: number) {
  if ((latitude === null) !== (longitude === null)) throw requisicaoInvalida('Informe latitude e longitude juntas.');
  db.transaction((tx) => {
    const s = obterLinhaSepultura(tx, id);
    const setorId = setorDoPonto(lerSetores(tx), latitude, longitude);
    tx.update(sepulturas).set({ latitude, longitude, setorId, atualizadoEm: agoraIso() }).where(eq(sepulturas.id, id)).run();
    registrarAuditoria(tx, {
      usuarioId,
      acao: latitude === null ? 'remover_localizacao' : 'definir_localizacao',
      entidade: 'sepultura',
      entidadeId: id,
      detalhes: { codigo: s.codigo, de: s.latitude !== null ? [s.latitude, s.longitude] : null, para: latitude !== null ? [latitude, longitude] : null },
    });
  });
}

/** Todas as sepulturas com posição no mapa, com o necessário para o pin e o balão. */
export function listarPins(db: DB): PinSepultura[] {
  return db
    .select({
      id: sepulturas.id,
      codigo: sepulturas.codigo,
      latitude: sepulturas.latitude,
      longitude: sepulturas.longitude,
      situacao: sepulturas.situacao,
      tipo: sepulturas.tipo,
      referencia: sepulturas.referencia,
      socio_id: sepulturas.socioId,
      socio_nome: socios.nomeCompleto,
      setor_nome: setores.nome,
      capacidade: sepulturas.capacidade,
      // Nomes qualificados à mão (ver comentário em socios/service.ts).
      titular_pendente: sql<number>`(SELECT count(*) FROM cobrancas c WHERE c.socio_id = sepulturas.socio_id AND c.situacao = 'aberta' AND c.vencimento < date('now', 'localtime'))`,
      ocupacao: sql<number>`(SELECT count(*) FROM sepultamentos x WHERE x.sepultura_id = sepulturas.id AND x.exumado_em IS NULL)`,
      foto_id: sql<number | null>`(SELECT max(f.id) FROM sepultura_fotos f WHERE f.sepultura_id = sepulturas.id)`,
      // Quem ainda está no local: sepultados e ossadas guardadas na própria sepultura.
      sepultados: sql<string | null>`(SELECT group_concat(x.nome_sepultado, '|') FROM sepultamentos x WHERE x.sepultura_id = sepulturas.id AND (x.exumado_em IS NULL OR x.exumacao_destino = 'mesma_sepultura'))`,
    })
    .from(sepulturas)
    .leftJoin(socios, eq(socios.id, sepulturas.socioId))
    .leftJoin(setores, eq(setores.id, sepulturas.setorId))
    .where(and(isNotNull(sepulturas.latitude), isNotNull(sepulturas.longitude)))
    .all()
    .map((p) => ({
      ...p,
      latitude: p.latitude!,
      longitude: p.longitude!,
      titular_pendente: p.titular_pendente > 0,
      sepultados: p.sepultados ? p.sepultados.split('|') : [],
    }));
}

// ---------------- Posição padrão e imagem aérea ----------------

const CHAVE_POSICAO = 'mapa_posicao';
const CHAVE_IMAGEM = 'mapa_imagem_aerea';
export const arquivoImagemAerea = (dataDir: string) => path.join(dataDir, 'mapa', 'imagem-aerea.jpg');

function lerChave<T>(db: Tx, chave: string): T | null {
  const v = db.select().from(configuracoes).where(eq(configuracoes.chave, chave)).get();
  return v ? (JSON.parse(v.valor) as T) : null;
}
function gravarChave(db: Tx, chave: string, valor: unknown) {
  if (valor === null) {
    db.delete(configuracoes).where(eq(configuracoes.chave, chave)).run();
    return;
  }
  const texto = JSON.stringify(valor);
  db.insert(configuracoes).values({ chave, valor: texto }).onConflictDoUpdate({ target: configuracoes.chave, set: { valor: texto } }).run();
}

/** Tamanho (pixels) da imagem aérea, guardado em memória por versão do arquivo. */
let tamanhoCache: { versao: string; largura: number; altura: number } | null = null;

export async function lerConfigMapa(db: DB, dataDir: string): Promise<ConfigMapa> {
  const imagem = lerChave<{ limites: [[number, number], [number, number]]; opacidade: number }>(db, CHAVE_IMAGEM);
  const arquivo = arquivoImagemAerea(dataDir);
  let imagem_aerea: ConfigMapa['imagem_aerea'] = null;
  if (imagem && fs.existsSync(arquivo)) {
    const versao = String(Math.round(fs.statSync(arquivo).mtimeMs));
    if (tamanhoCache?.versao !== versao) {
      const m = await sharp(arquivo).metadata();
      tamanhoCache = { versao, largura: m.width ?? 1, altura: m.height ?? 1 };
    }
    imagem_aerea = { ...imagem, versao, largura: tamanhoCache.largura, altura: tamanhoCache.altura };
  }
  return { posicao: lerChave(db, CHAVE_POSICAO), imagem_aerea };
}

export function definirPosicao(db: DB, p: { latitude: number; longitude: number; zoom: number }, usuarioId: number) {
  gravarChave(db, CHAVE_POSICAO, p);
  registrarAuditoria(db, { usuarioId, acao: 'definir_posicao_mapa', entidade: 'sistema', detalhes: p });
}

/** Grava a foto aérea (drone ou outra) e a posição inicial dela no mapa. */
export async function salvarImagemAerea(
  db: DB,
  dataDir: string,
  arquivo: Buffer,
  limites: [[number, number], [number, number]],
  usuarioId: number,
) {
  let jpg: Buffer;
  try {
    jpg = await sharp(arquivo, { failOn: 'error', limitInputPixels: 400_000_000 })
      .rotate()
      .resize({ width: 8000, height: 8000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw requisicaoInvalida('O arquivo enviado não é uma imagem válida.');
  }
  const destino = arquivoImagemAerea(dataDir);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, jpg);
  gravarChave(db, CHAVE_IMAGEM, { limites, opacidade: 1 });
  registrarAuditoria(db, { usuarioId, acao: 'enviar_imagem_aerea', entidade: 'sistema', detalhes: { bytes: jpg.length } });
}

export function ajustarImagemAerea(db: DB, dataDir: string, d: { limites: [[number, number], [number, number]]; opacidade: number }, usuarioId: number) {
  if (!fs.existsSync(arquivoImagemAerea(dataDir))) throw naoEncontrado('Imagem aérea');
  const [[s, o], [n, l]] = d.limites;
  if (s >= n || o >= l) throw requisicaoInvalida('Os cantos da imagem estão invertidos.');
  gravarChave(db, CHAVE_IMAGEM, d);
  registrarAuditoria(db, { usuarioId, acao: 'ajustar_imagem_aerea', entidade: 'sistema', detalhes: d });
}

export function removerImagemAerea(db: DB, dataDir: string, usuarioId: number) {
  fs.rmSync(arquivoImagemAerea(dataDir), { force: true });
  gravarChave(db, CHAVE_IMAGEM, null);
  registrarAuditoria(db, { usuarioId, acao: 'remover_imagem_aerea', entidade: 'sistema' });
}
