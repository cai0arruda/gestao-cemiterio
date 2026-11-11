# Gestão do Cemitério Campo Vicente

Sistema de gestão de sócios, sepulturas e anuidades. Veja a arquitetura completa em
[ARQUITETURA.md](ARQUITETURA.md).

**Situação atual: todas as fases do plano (1 a 6) concluídas**
- Fase 1: login, usuários, cadastro de sócios (completo e rápido), fotos das fichas em papel,
  detecção de cadastros repetidos, histórico de alterações e backup.
- Fase 2: valores e reajustes, anuidades (vencimento em Finados), taxa de associação, atendimento
  rápido no balcão, recibo de 80 mm com QR code, estorno, lançamento de anuidades antigas.
  Também dá para gerar anuidades avulsas de um sócio (adiantar ou pagar vários anos de uma vez).
- Fase 3: portal do sócio — o QR code do recibo abre uma página pública (sem login) que confere o
  recibo e mostra se o sócio está em dia, sem dados pessoais.
- Fase 4: sepulturas (código automático, fotos, venda, transferência), registro de sepultamentos
  com as regras do direito de sepultamento, busca de "onde está sepultado fulano" e sucessão
  (familiar assume as sepulturas de um sócio falecido). Exumação: o registro do sepultamento fica no histórico
  e o lugar é liberado (com opção de transferir os restos para outra sepultura, como o ossuário).
- Fase 5: mapa sobre a foto de drone do cemitério, pin de cada sepultura (cor por situação ou por pagamento),
  busca no mapa, setores desenhados, imagem aérea própria (drone); cada sepultura é marcada clicando nela sobre a foto de drone.
- Fase 6: relatórios — visão geral, inadimplência e lembrete de Finados com mensagem pronta no
  WhatsApp, fechamento de caixa (tela, A4 e impressora térmica), arrecadação por período,
  aniversariantes e sepultamentos, com exportação para planilha (CSV).

### QR code enquanto o sistema roda local

O QR code aponta para o endereço definido em `PUBLIC_URL` no arquivo `.env`. Para os celulares da
mesma rede Wi-Fi conseguirem abrir, use o IP do computador, por exemplo
`PUBLIC_URL=http://192.168.0.10:3000`. Quando o sistema for para a internet, troque pelo domínio
(`https://cemiteriocampovicente.com.br`). Recibos impressos antes da troca continuam apontando para o
endereço antigo; se precisar, reimprima como 2ª via.

## Requisitos

- [Node.js 24 LTS](https://nodejs.org/) (no Windows, use o instalador `.msi` e mantenha as opções padrão)

## Primeira instalação

Abra um terminal (no Windows: PowerShell) na pasta do projeto:

```bash
npm install
```

Opcional: copie `.env.example` para `.env` para mudar a porta, a pasta de dados etc.

## Usar no dia a dia (modo produção)

```bash
npm run build
```

```bash
npm start
```

Abra **http://localhost:3000**. No primeiro acesso, o sistema pede para criar o administrador.
Outros computadores ou celulares da mesma rede acessam pelo IP do PC, por exemplo
`http://192.168.0.10:3000`. O Windows pode perguntar se libera o Node no firewall: libere
**somente para redes privadas**.

> Depois de atualizar o código, rode `npm run build` de novo antes do `npm start`.

## Atalho na Área de Trabalho (Windows) e impressão direta na térmica

Depois do `npm run build`, rode uma vez no PowerShell, na pasta do projeto:

```bash
powershell -ExecutionPolicy Bypass -File deploy\windows\criar-atalho.ps1
```

Isso cria o atalho **Gestão do Cemitério**. Ele liga o servidor (se estiver desligado) e abre o
sistema numa janela própria do Chrome com **impressão silenciosa**: o recibo sai direto na
impressora padrão, sem a janela de impressão. Para o sistema já abrir quando o Windows iniciar,
acrescente `-IniciarComWindows` ao comando.

### Configurando a Epson TM-T20X (uma vez)

1. Instale o driver **Epson Advanced Printer Driver (APD)** da TM-T20X (site da Epson).
2. Em *Configurações do Windows → Impressoras*, defina a **TM-T20X como impressora padrão**.
3. Nas *Preferências de impressão* da TM-T20X:
   - Papel: **Roll Paper 80 x 297 mm**;
   - **Reduzir margem inferior / corte no fim do documento** (*Paper Reduction: Bottom margin*): ligado;
   - Corte automático do papel: ligado.
4. No sistema, em *Administração → Configurações*, confira a largura do papel (80 mm) e os dados do
   cemitério que aparecem no recibo.
5. Registre um pagamento de teste e confira o recibo (dá para estornar depois).

> O recibo traz a frase **NÃO É DOCUMENTO FISCAL**: é só um comprovante para o sócio.

## Mapa

- **Setores:** *Desenhar novo setor* → clique nos cantos e feche no primeiro ponto. As sepulturas
  dentro do desenho passam a pertencer ao setor automaticamente.
- **Foto de drone:** é o único fundo do mapa (não há satélite nem ruas). Envie em *Enviar imagem
  aérea (drone)*; o mapa sempre abre enquadrado nela. Ao trocar a foto, a nova ocupa o mesmo lugar
  da antiga, para as sepulturas já marcadas continuarem no lugar. Use a foto "de cima", em boa resolução.

### HTTPS na rede local (opcional)

Quando o sistema estiver online (com domínio), o HTTPS já vem pronto. Para usar HTTPS antes disso, na rede local:

1. Instale o [mkcert](https://github.com/FiloSottile/mkcert) no PC (no Windows: `winget install FiloSottile.mkcert`).
2. Na pasta do projeto, gere o certificado com o IP do PC:

   ```bash
   mkcert -install
   ```

   ```bash
   mkcert -cert-file data/certs/cert.pem -key-file data/certs/key.pem 192.168.0.10 localhost
   ```

3. No `.env`, descomente `HTTPS_CERT` e `HTTPS_KEY` e troque o `PUBLIC_URL` para `https://192.168.0.10:3000`.
4. No celular, instale o certificado raiz do mkcert (arquivo `rootCA.pem`, que fica na pasta mostrada
   por `mkcert -CAROOT`) em *Configurações → Segurança → Instalar certificado*. Sem esse passo o celular
   mostra um aviso de site inseguro.

## Desenvolvimento

```bash
npm run dev
```

Frontend em http://localhost:5173 (recarrega sozinho ao editar). A API roda na porta 3000.

```bash
npm test
```

```bash
npm run typecheck
```

## Onde ficam os dados

Tudo fica na pasta `data/` (não vai para o git):

| Caminho | Conteúdo |
|---|---|
| `data/cemiterio.db` | banco de dados SQLite |
| `data/uploads/` | fotos das fichas (e, no futuro, das sepulturas) |
| `data/backups/` | um backup automático por dia (os últimos 30) + os backups manuais |

**Importante:** os backups automáticos ficam no mesmo computador. Uma vez por semana, entre em
*Administração → Backup*, clique em **Fazer backup agora e baixar** e guarde o arquivo num pendrive
ou na nuvem. Cada `.zip` traz um `LEIA-ME.txt` explicando como restaurar.

## Esqueceu a senha do administrador?

Outro administrador pode redefinir em *Administração → Usuários*. Se não houver outro, crie um
usuário administrador novo pelo terminal (com o sistema parado):

```bash
npx tsx apps/server/scripts/novo-admin.ts
```

## Estrutura

```
apps/server   API (Fastify + SQLite/Drizzle)
apps/web      Interface (React + Mantine)
packages/shared  Regras e validações usadas pelos dois lados
```
