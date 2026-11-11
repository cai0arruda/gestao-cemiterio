# Sistema de Gestão do Cemitério — Arquitetura

> Versão 1.0 · 06/11/2026 · **Arquitetura fechada** — pronta para iniciar a Fase 1

## 0. Decisões confirmadas

| Tema | Resposta | Impacto na arquitetura |
|---|---|---|
| Hospedagem | Online | Servidor na nuvem (VPS); a secretaria acessa por um "app" instalado no Windows — §1, §11 |
| PC da secretaria | Windows | Impressão pelo driver Epson do Windows — §7 |
| Impressora | Epson TM-T20X, USB, 80 mm | Recibo em HTML de 80 mm com impressão silenciosa — §7 |
| Numeração das sepulturas | Não existe | O sistema gera um código; mapa + foto viram a referência — §4, §5 |
| Anuidade | Por sócio, valor igual para todos, com reajustes, sem multa | Tabela de valores por ano — §4 |
| Falecimento | Quando o sócio é sepultado, deixa de pagar | Registro de sepultamentos vira parte do sistema — §4.1 |
| Sepultamento do sócio | Só se estiver em dia | Sistema bloqueia o registro se houver anuidade vencida — §4.1 |
| Direito de sepultamento | Cada associação dá direito a **um** sepultamento. Se for usado por um familiar, o sócio perde o direito e precisa pagar a taxa de associação de novo | Campo `direito_sepultamento` no sócio — §4.1 |
| Sucessão | Familiar pode assumir pagando a taxa de associação | Transferência de titularidade + cobrança `taxa_associacao` — §4.2 |
| Vencimento | Todo ano no Dia de Finados (02/11) | Vencimento fixo em 02/11 — §4 |
| Período da anuidade | **Pós-paga**: a anuidade paga no Finados de 2026 cobre o ano que passou (2026) | Recibo e portal dizem "quitado até 2026" — §4 |
| Direito usado por familiar | A associação do sócio **se encerra**; ele precisa renovar (nova taxa) | Situação `associacao_encerrada`, sem novas anuidades — §4.1 |
| Requisitos para ter direito | Taxa de associação paga **e** sepultura comprada | Verificação no sepultamento + cobrança `compra_sepultura` — §4.1 |
| Inadimplência longa | Nunca desliga; continua sócio devendo | Anuidades vencidas acumulam; sem desligamento automático |
| Sócio novo no meio do ano | Paga a anuidade do ano inteira | Ao se associar, gera a anuidade do ano corrente — §4 |
| Renovação após uso por familiar | Basta pagar a taxa | Não exige nova compra de sepultura — §4.1 |
| Ambiente inicial | **Local, para testes** (sem domínio nem VPS por enquanto) | Mesmo código roda local e online; diferenças em §11.1 |
| Valores | Controlados pelo **painel de administração** | Tela "Valores e reajustes" — §4 |
| Domínio | `cemiteriocampovicente.com.br` (a registrar) | Livre no Registro.br em 06/11/2026 — §11 |
| Cadastro atual | Fichas escritas à mão | Cadastro rápido + foto da ficha — §9 |
| Escala | ≤ 200 sócios, ≤ 300 sepulturas, 1–2 usuários | SQLite e o menor servidor disponível sobram |
| Portal do sócio | Aprovado | Página pública pelo QR code do recibo — §8 |
| Wi-Fi no cemitério | Possível | Não é necessário: online, o celular usa 4G — §6 |

## 1. Visão geral

```
                         Internet (HTTPS)
┌──────────────────────── Servidor VPS (Linux) ─────────────────────────┐
│  Caddy (HTTPS automático) ──► Node.js (Fastify)                       │
│                                 ├── API + frontend React              │
│                                 ├── SQLite  (data/cemiterio.db)       │
│                                 └── Fotos   (data/uploads/)           │
│  Litestream ──► backup contínuo para armazenamento externo (B2/R2)    │
└───────────────────────────────────────────────────────────────────────┘
        ▲                         ▲                          ▲
        │                         │                          │
 PC da secretaria (Windows)   Celular da equipe        Celular do sócio
 "App" (atalho Chrome)        cadastro em campo        lê o QR do recibo →
   └─ USB ─► Epson TM-T20X    (foto + GPS)              página pública de situação
```

### Online × app local — por que online
| | Online (escolhido) | App local no PC |
|---|---|---|
| QR code do sócio funcionar no celular dele | ✅ Natural | ❌ Precisaria expor o PC da secretaria na internet |
| Cadastro em campo pelo celular | ✅ Pelo 4G, de qualquer lugar | ⚠️ Só no Wi-Fi da secretaria |
| Se o PC queimar ou for roubado | ✅ Nada se perde | ❌ Depende do backup |
| Acessar de casa | ✅ | ❌ |
| Impressão térmica | ⚠️ Pelo navegador (resolvido no §7) | ✅ Direta |
| Custo | ~US$ 5/mês de servidor + domínio | Zero |
| Sem internet | ❌ Não funciona | ✅ Funciona |

O QR code do sócio decide a questão: ele só funciona se o sistema estiver na internet.

### Mas com cara de software
Na secretaria, o sistema fica instalado como um **atalho na área de trabalho** que abre o Chrome
em modo aplicativo: janela própria, sem barra de endereço, com ícone do cemitério. Para quem usa,
parece um programa instalado. O mesmo atalho já ativa a impressão silenciosa (§7). O frontend
também é **PWA**, então pode ser "instalado" no celular.

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Runtime | Node.js 24 LTS | Suporte longo |
| Linguagem | TypeScript | Menos erros nas regras financeiras e no modelo de dados |
| Servidor HTTP | Fastify | Leve, com validação de schema embutida |
| Banco | SQLite via `better-sqlite3` (modo WAL) | Arquivo único; com esse volume, não há motivo para um banco maior |
| ORM / migrações | Drizzle ORM + drizzle-kit | Tipado, migrações versionadas |
| Validação | Zod | Mesmos schemas no front e no back |
| Frontend | React + Vite + TanStack Query, PWA | SPA servida pelo próprio Fastify |
| UI | Mantine | Formulários, tabelas e datas em pt-BR |
| Mapa | Leaflet (camada de imagem trocável) | Gratuito; aceita Esri, Google ou foto de drone |
| Imagens | `sharp` | Comprime fotos e gera miniaturas |
| QR code | `qrcode` | Gera SVG para o recibo |
| Autenticação | Sessão em cookie seguro + argon2 + limite de tentativas | Agora o sistema fica exposto na internet |
| Infra | Docker Compose + Caddy em VPS Linux | HTTPS automático, deploy simples |
| Backup | Litestream + snapshot diário | Réplica contínua fora do servidor |
| Testes | Vitest | Regras de anuidade, falecimento e recibo |

## 3. Estrutura de pastas

```
gestao-cemiterio/
├── apps/
│   ├── server/src/
│   │   ├── main.ts
│   │   ├── config.ts                 # variáveis de ambiente
│   │   ├── db/ (schema.ts, migrations/, seed.ts)
│   │   ├── modules/
│   │   │   ├── auth/                 # login, usuários, perfis
│   │   │   ├── socios/
│   │   │   ├── sepulturas/           # fotos, coordenadas, setores
│   │   │   ├── sepultamentos/        # registro de quem está sepultado e regra de falecimento
│   │   │   ├── financeiro/           # valores por ano, anuidades, pagamentos
│   │   │   ├── recibos/              # numeração, layout 80 mm, QR
│   │   │   ├── portal/               # páginas públicas de verificação (sem login)
│   │   │   └── relatorios/
│   │   │   (cada módulo: routes.ts · service.ts — consultas Drizzle no service)
│   │   └── shared/                   # auditoria, dinheiro, datas, erros
│   └── web/src/
│       ├── pages/                    # Sócios, Sepulturas, Mapa, Financeiro, Relatórios, Config
│       ├── pages/publico/            # página do QR (layout simples, mobile)
│       ├── print/                    # Recibo80mm.tsx + CSS de impressão
│       └── api/
├── packages/shared/                  # schemas Zod e tipos
├── deploy/
│   ├── docker-compose.yml            # app + caddy + litestream
│   ├── Caddyfile
│   └── atalho-windows/               # script que cria o atalho e configura a impressão
├── data/                             # NÃO versionado (fica no volume do servidor)
└── ARQUITETURA.md
```

## 4. Modelo de dados

```
usuarios ──< auditoria
tabela_valores (tipo + ano → valor)

socios ──< sepulturas >── setores
  │            ├──< sepultura_fotos
  │            └──< sepultamentos >── (opcional) socios
  ├──< socio_documentos (foto da ficha em papel)
  └──< cobrancas (anuidade | taxa_associacao) ──< pagamentos ──1 recibos
```

### socios
| Campo | Obs |
|---|---|
| id, matricula (única) | matrícula substitui a carteirinha |
| nome_completo, data_nascimento | obrigatórios |
| cpf (único, opcional) | evita duplicidade |
| telefone, telefone2, email | |
| cep, logradouro, numero, complemento, bairro, cidade, uf | CEP autopreenche (ViaCEP) |
| situacao | `ativo`, `associacao_encerrada` (direito usado por familiar, aguardando renovação), `falecido` |
| direito_sepultamento | `disponivel` / `utilizado` — volta a `disponivel` quando a taxa de associação é paga de novo |
| data_associacao | data em que pagou a (última) taxa de associação |
| data_falecimento | preenchida pelo registro de sepultamento |
| token_publico | código aleatório e longo usado no QR (não dá para adivinhar) |
| observacoes, criado_em, atualizado_em | |

### sepulturas
| Campo | Obs |
|---|---|
| id, codigo (único) | **gerado pelo sistema**: `S-0001`, `S-0002`… |
| socio_id (nulo = sem titular) | um sócio pode ter 0, 1 ou várias |
| setor_id (opcional) | definido automaticamente pelo pin dentro do polígono |
| referencia | texto livre: "perto do cruzeiro" |
| tipo, capacidade | cova, jazigo, gaveta… |
| situacao | `disponivel`, `vendida`, `ocupada`, `reservada` |
| data_aquisicao, latitude, longitude, observacoes | |

### setores
| id | nome | cor | poligono (GeoJSON desenhado no mapa) |

### sepultura_fotos / socio_documentos
Arquivo no disco, só o caminho no banco; o `sharp` reduz para ~1600 px e gera miniatura.

### sepultamentos
| Campo | Obs |
|---|---|
| id, sepultura_id | |
| nome_sepultado | |
| socio_id (opcional) | preenchido quando o sepultado **é** um sócio |
| socio_direito_id | sócio cujo direito de sepultamento foi usado (ele mesmo ou o titular, no caso de um familiar) |
| parentesco | parentesco do sepultado com o sócio (quando é familiar) |
| data_nascimento, data_falecimento, data_sepultamento | |
| certidao_obito, observacoes | |

#### 4.1 Regras de sepultamento
Toda vez que alguém é sepultado, o sistema pergunta **qual sócio está usando o direito de
sepultamento**. Antes de gravar, ele verifica:
- se o sócio está **em dia** (nenhuma anuidade vencida em aberto). Se não estiver, o registro é
  bloqueado e aparece o botão "Registrar pagamento agora";
- se o `direito_sepultamento` dele está `disponivel`. Se já foi usado, o registro é bloqueado e
  aparece a opção de cobrar a taxa de associação;
- se ele **tem sepultura comprada** (é titular de pelo menos uma sepultura). Se não tiver, aparece
  a opção de vender uma sepultura disponível.

Ou seja, o direito exige três coisas: **taxa de associação paga, sepultura comprada e anuidades
vencidas quitadas.** A ficha do sócio mostra esse checklist.

**Caso A — o sepultado é o próprio sócio** (numa única transação):
1. O sócio passa para `falecido`, com `data_falecimento`, e o direito vira `utilizado`.
2. Ele sai da geração das próximas anuidades. Como precisava estar em dia, não sobra dívida;
   alguma anuidade futura já gerada é cancelada com o motivo "falecimento".
3. A sepultura passa para `ocupada`.
4. O sistema oferece a **sucessão**: "Algum familiar vai assumir?" (§4.2).

**Caso B — o sepultado é um familiar do sócio**:
1. O direito do sócio vira `utilizado` e a associação se encerra: situação
   `associacao_encerrada`.
2. Enquanto estiver encerrada, **não são geradas novas anuidades** e o sócio não tem direito a
   sepultamento. Isso aparece em destaque na ficha e no portal: "Associação encerrada — renove
   para recuperar o direito".
3. **Renovação**: ao pagar uma nova taxa de associação, ele volta a `ativo` com o direito
   `disponivel`. **Basta a taxa**: não precisa comprar outra sepultura, e a que já era dele
   continua no nome dele. A anuidade do ano da renovação é gerada normalmente.

Tudo fica na auditoria. Só o admin pode forçar um sepultamento que fure as regras, e precisa
informar uma justificativa.

#### 4.2 Sucessão / transferência de titularidade
1. Cadastrar o familiar como novo sócio, ou escolher um sócio existente.
2. Gerar a cobrança de **taxa de associação**.
3. Quando a taxa é paga, as sepulturas do sócio falecido passam para o novo titular (o histórico
   de titulares fica registrado em `sepultura_titulares`).
4. Daí em diante, o novo sócio paga as anuidades normalmente.

### sepultura_titulares (histórico)
| sepultura_id | socio_id | inicio | fim | motivo (`compra`, `sucessao`, `transferencia`) |

### tabela_valores (reajustes)
| tipo (`anuidade`, `taxa_associacao`, `compra_sepultura`) | ano | valor_centavos | definido_em | definido_por |

Nada de valor fica fixo no código. O admin gerencia tudo em **Administração → Valores e
reajustes**: vê o valor vigente de cada tipo, cadastra o do próximo ano (reajuste) e consulta o
histórico de quem alterou e quando. Se não houver valor cadastrado para o ano, o sistema não gera
a cobrança e avisa o admin.

O valor de `compra_sepultura` é o preço padrão do ano; o atendente pode alterá-lo na venda (por
exemplo, um jazigo maior), e a alteração fica na auditoria.

Reajustar é cadastrar o valor do novo ano. As cobranças guardam o valor do momento em que foram
geradas, então um reajuste nunca altera o que já foi cobrado ou pago.

### cobrancas (antes "anuidades")
Existem três tipos de cobrança, por isso a tabela é genérica:

| Campo | Obs |
|---|---|
| id, socio_id, tipo | `anuidade`, `taxa_associacao` ou `compra_sepultura` |
| sepultura_id | só para `compra_sepultura`; quando paga, a sepultura passa para o sócio como `vendida` |
| ano | para anuidade: **único (socio_id, ano)**, uma por sócio, não importa quantas sepulturas |
| valor_centavos | copiado de `tabela_valores` na geração |
| vencimento | anuidade: **02/11 (Finados) do ano**; taxa: na hora |
| situacao | `aberta`, `paga`, `cancelada` |
| motivo_cancelamento | ex.: "falecimento" |

**Em dia** = nenhuma cobrança com vencimento já passado em aberto.

**Anuidade pós-paga**: a "Anuidade 2026" cobre o ano de 2026 e vence em 02/11/2026. Quem paga
em Finados está quitando o ano que passou. Por isso, recibo e portal dizem **"Anuidades quitadas
até 2026"**, e não "válido até".

**Sócio novo**: ao pagar a taxa de associação, o sistema gera na hora a **anuidade do ano
corrente, com valor integral**, vencendo em 02/11 daquele ano. Quem se associa depois de 02/11
recebe a anuidade daquele ano já vencida; se isso não for desejado, o atendente pode cancelá-la
com justificativa.

**Inadimplência**: o sócio nunca é desligado automaticamente; as anuidades vencidas se acumulam
e aparecem no painel de pendências e no portal ("Pendente: 2025, 2026"). O registro de pagamento
permite **quitar vários anos de uma vez**, gerando um único recibo que lista os anos pagos.

**Calendário anual em torno de Finados:**
- **Início de outubro**: o admin aperta "Gerar anuidades de AAAA" (vencimento 02/11 para todos os
  sócios ativos), e o sistema mostra a lista de quem ainda não pagou para lembrar pelo WhatsApp.
- **Dia de Finados**: dia de pico no balcão. Uma tela de **"Atendimento rápido"** faz busca →
  pagar → imprimir em poucos cliques, só com o teclado.
- **03/11 em diante**: quem não pagou aparece como **pendente** no sistema e no portal.

> **Como ficou na implementação (Fase 2):** um *recebimento* é um atendimento no balcão e corresponde
> a um recibo numerado (`2026/000001`); ele pode quitar várias cobranças, e cada cobrança quitada é
> uma linha em `pagamentos`. Lançamentos de anuidades antigas são recebimentos com `historico = true`
> e sem número de recibo. Sócio novo cadastrado com "cobrar taxa" começa na situação `pendente`
> (aguardando taxa de associação) e vira `ativo` quando a taxa é paga.

### pagamentos (apenas registro)
| Campo | Obs |
|---|---|
| id, cobranca_id | |
| valor_pago_centavos, desconto_centavos | sem multa |
| data_pagamento, forma | forma é só informativa (dinheiro, PIX…) |
| recebido_por → usuarios | |
| estornado_em, estornado_por, motivo_estorno | nunca é apagado, só estornado |

### recibos
| id | numero sequencial (2026/000123) | pagamento_id | emitido_em | vias_impressas |

### usuarios / auditoria / configuracoes
- **usuarios**: nome, login, senha_hash, perfil (`admin`, `atendente`), ativo.
- **auditoria**: quem fez o quê e quando.
- **configuracoes**: dados do cemitério (nome, CNPJ, endereço), centro do mapa, provedor da imagem.

## 5. Mapa

### Qual imagem usar
| Opção | Situação |
|---|---|
| **Esri World Imagery** | Gratuito, sem chave, uso livre com atribuição. **Ponto de partida.** |
| **Google (satélite)** | Pode usar, **mas só pela API oficial do Google Maps** (chave + conta de faturamento). Com 1–2 usuários, o uso fica dentro da cota gratuita. Copiar os blocos ou prints do Google para outro mapa viola os termos de uso deles. |
| **Foto de drone** | Muito mais nítida, mostra cada sepultura. Melhor resultado, se for possível conseguir. |

A camada de imagem fica atrás de uma configuração (`provedor_mapa`). Na prática, primeiro
comparamos Esri e Google **no endereço do cemitério**. Se a imagem do Google for bem melhor ali,
ativamos a API oficial. Se conseguirem o drone, ele vira a camada principal.

### Funcionalidades
- Clicar ou arrastar para posicionar o pin da sepultura.
- Mapa geral com pins coloridos por situação (livre, vendida, ocupada) e por adimplência do titular.
- Busca por sócio ou sepultado → o mapa centraliza no pin.
- Desenho de setores (`leaflet-geoman`).

## 6. Cadastro em campo (celular)

Com o sistema online, o celular funciona pelo **4G**: não precisa de Wi-Fi nem de modo offline.
1. Em pé ao lado da sepultura, abrir "Nova sepultura".
2. Tirar a foto pela câmera do próprio formulário.
3. O GPS posiciona o pin (precisão de 3–5 m) e o ajuste fino é feito com o dedo.
4. Vincular ao sócio na hora ou depois.

GPS e câmera exigem HTTPS, que o Caddy já fornece.

## 7. Recibo na Epson TM-T20X (sistema online + Windows)

Como o servidor está na nuvem, ele não enxerga a impressora USB. Quem imprime é o **navegador
do PC da secretaria**, usando o driver da Epson no Windows.

1. **Instalar o driver Epson APD** para a TM-T20X no Windows, configurado com papel de 80 mm e
   corte automático, e defini-la como **impressora padrão** desse perfil.
2. **Layout do recibo em HTML/CSS** com 72 mm de área útil (`@page { size: 80mm auto; margin: 0 }`),
   fonte monoespaçada e QR code em SVG.
3. **Atalho "Gestão Cemitério"** na área de trabalho, que abre o Chrome com:
   ```
   chrome.exe --app=https://<dominio> --kiosk-printing --user-data-dir=C:\GestaoCemiterio\perfil
   ```
   - `--app`: janela própria, com cara de programa.
   - `--kiosk-printing`: clicou em "Imprimir", sai direto na térmica, **sem a janela de impressão**.
   - `--user-data-dir`: perfil separado, para que a impressão silenciosa valha só para o sistema.
4. Fluxo: **Registrar pagamento → recibo gerado → imprime sozinho** (ou pelo botão "Reimprimir 2ª via").

**Plano B**, caso a qualidade ou o corte fiquem ruins pelo driver: um pequeno agente local
(Node, rodando como serviço no Windows) que recebe o recibo do sistema e envia comandos ESC/POS
direto pela USB. Só vale a pena se o plano principal não atender.

Conteúdo do recibo:
```
     CEMITÉRIO CAMPO VICENTE
     CNPJ · endereço · telefone
------------------------------------------
 RECIBO DE PAGAMENTO Nº 2026/000123
 Sócio: MARIA DA SILVA     Matrícula: 0457
 Sepultura(s): S-0112 (Setor A)
 Referente: Anuidade 2026
 Valor: R$ 120,00          Forma: PIX
 Data: 06/11/2026 09:14    Atend.: João
------------------------------------------
 Situação: EM DIA · quitado até 2026
 Próximo vencimento: 02/11/2027
 Benefícios da associação garantidos
          [QR CODE]
   Aponte a câmera para ver a situação
       NÃO É DOCUMENTO FISCAL
```

## 8. Portal do sócio (QR code)

O QR do recibo abre `https://<dominio>/s/<token_publico>`, uma página **pública, sem login**,
pensada para celular:

- ✅ **Recibo válido** ou ❌ **recibo inválido/estornado** (quando o link traz o número do recibo).
- Nome abreviado ("MARIA S."), matrícula, situação: **Em dia** / **Pendente** (anos em aberto).
- Benefício da associação: **Benefícios da associação garantidos** / **Benefício já utilizado** (texto escolhido para não usar a palavra "sepultamento" com os sócios).
- Lista das últimas anuidades pagas.
- Sepulturas do sócio: código, setor e um botão **"Como chegar"**, que abre o mapa com o pin.

Para proteger os dados (LGPD):
- O token é longo e aleatório: ninguém descobre o link de outro sócio trocando números.
- A página não mostra CPF, endereço, telefone nem data de nascimento.
- Há limite de acessos por IP.
- O admin pode **gerar um novo token** se o sócio perder o recibo ou o link vazar (o antigo para
  de funcionar).

Isso substitui a carteirinha: o sócio guarda o recibo, ou só uma foto do QR no celular.

## 9. Digitalização das fichas em papel

- **Cadastro rápido**: um formulário enxuto, que dá para preencher só com o teclado e emenda no
  próximo sócio.
- **Foto da ficha original** anexada ao sócio.
- **Lançamento de anuidades antigas** já pagas, sem imprimir recibo, para que cada sócio entre já
  com a situação correta.
- Alerta de **possível duplicado** (nome parecido + mesma data de nascimento).

## 10. Segurança e backup (agora na internet)

- HTTPS obrigatório (Caddy + Let's Encrypt).
- Senhas com argon2; bloqueio temporário após várias tentativas erradas; sessão expira por inatividade.
- Perfis: **atendente** registra cadastros e pagamentos; **admin** estorna, cancela, reajusta valores
  e gerencia usuários.
- Auditoria de todas as alterações.
- **Backup**:
  - Litestream replica o SQLite continuamente para um armazenamento externo (Backblaze B2 ou
    Cloudflare R2, que custam centavos com esse volume).
  - Snapshot diário do banco e das fotos, mantido por 30 dias.
  - Botão "Baixar backup completo" (.zip) para guardar também um pendrive na secretaria.
- Atualizações automáticas de segurança no servidor; firewall liberando só as portas 80/443 e SSH
  por chave.

## 11. Hospedagem e custos (aproximados)

| Item | Sugestão | Custo aprox. |
|---|---|---|
| Servidor | VPS de 1 vCPU / 1–2 GB (Hetzner, DigitalOcean, Hostinger, Contabo…) | US$ 4–6/mês |
| Domínio | `cemiteriocampovicente.com.br` (registro.br; livre em 06/11/2026). Registrar de preferência no **CNPJ da associação**, não no CPF de alguém | ~R$ 40/ano |
| Backup externo | Backblaze B2 ou Cloudflare R2 | ~R$ 0–5/mês |
| Google Maps API (se usar) | Dentro da cota gratuita com esse volume | R$ 0 |

### 11.1 Fase de testes local (atual)
Enquanto não há domínio nem VPS, o sistema roda direto no computador:

| Item | Local (agora) | Online (depois) |
|---|---|---|
| Execução | `npm run dev` / `npm start`, sem Docker | Docker Compose + Caddy |
| Endereço | `http://localhost:3000` (ou o IP do PC na rede, ex. `http://192.168.0.10:3000`) | `https://cemiteriocampovicente.com.br` |
| Banco e fotos | pasta `data/` do projeto | volume no servidor |
| Impressão | Igual: atalho Chrome com `--kiosk-printing` apontando para localhost | Igual |
| QR code do recibo | Usa `PUBLIC_URL` do `.env`; abre no celular **conectado ao mesmo Wi-Fi** | Abre de qualquer lugar |
| Cadastro em campo (GPS/câmera) | Exige HTTPS: certificado local com `mkcert`, ou fica para depois | HTTPS do Caddy |
| Backup | Snapshot diário em `data/backups/` + botão de exportar | + Litestream externo |

Migrar para o online é copiar a pasta `data/` para o servidor e trocar o `PUBLIC_URL`. Os QR
codes impressos durante os testes apontam para o endereço local, então **recibos reais só devem
ser impressos depois que o domínio estiver no ar** (ou reimpressos como 2ª via).

Não serve hospedagem "serverless" (Vercel, Netlify): o SQLite precisa de um disco persistente.
Deploy: `git pull && docker compose up -d --build` (dá para automatizar depois com GitHub Actions).

## 12. Fases

| Fase | Entrega |
|---|---|
| 1 ✅ | Base do projeto, login, cadastro de sócios (cadastro rápido + foto da ficha), backup local — rodando local (concluída em 06/11/2026) |
| 2 ✅ | Painel "Valores e reajustes", cobranças (anuidade + taxa de associação), pagamentos/estornos, atendimento rápido, recibo de 80 mm, atalho Windows com impressão silenciosa |
| 3 ✅ | Portal do sócio pelo QR code |
| 4 ✅ | Sepulturas (código, fotos), sepultamentos, regras do direito de sepultamento, sucessão |
| 5 ✅ | Mapa (Esri; Google fica opcional, depende de chave da API), pins, setores, imagem de drone, cadastro em campo pelo celular |
| 6 ✅ | Relatórios, inadimplência, caixa diário, cobrança via WhatsApp (`wa.me`) |

Com as fases 1–3, a carteirinha já pode ser aposentada.

## 13. Perguntas em aberto

Nenhuma pergunta bloqueante. Pendências práticas (não são de arquitetura):

- Domínio e VPS: **adiados**; testes rodando localmente (§11.1).
- Valores: cadastrados pelo próprio admin no painel.
- Foto de drone: em andamento (necessária só na Fase 5).
