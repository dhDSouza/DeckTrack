# DeckTrack

Organize sua coleção física de Magic: The Gathering e acompanhe onde cada carta está: na pool ou nos seus decks. Interface responsiva em português, com importação de listas, histórico de alterações e versões dos decks.

Projeto independente da comunidade, sem vínculo ou endosso da Wizards of the Coast, do MTGJSON ou do Scryfall.

## Funcionalidades

- Catálogo com filtros por nome, tipo, cor, identidade de cor, texto, mana e edição.
- Importação de listas no formato `quantidade nome`, com conferência antes de salvar.
- Coleção com quantidades editáveis e registro de cópias durante a montagem do deck.
- Decks em grade ou lista, categorias, capas e múltiplos comandantes.
- Localização de cartas, transferências entre decks e substituições a partir da pool.
- Histórico das alterações e versões identificadas por tags, como `v1.0`.
- Estatísticas por categoria, cores e curva de mana, com power level manual e sugestão experimental.
- Imagens diretamente do Scryfall, sem armazenar arquivos de imagem no banco.

## Tecnologias e requisitos

Node.js **24.x**, npm, TypeScript, Express, TypeORM e PostgreSQL. O frontend usa HTML, JavaScript e CSS, servido pelo próprio Express, sem compilação separada.

Para o banco local, recomenda-se Docker com Docker Compose. A configuração fornecida usa PostgreSQL 17 com pgvector. A geração dos dados e a exibição de imagens exigem internet.

## Instalação local

Na raiz do projeto:

```sh
npm ci
```

Copie `.env.example` para `.env`. No PowerShell:

```powershell
Copy-Item .env.example .env
```

Gere um segredo e coloque o resultado em `JWT_SECRET` no `.env`:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Confira as variáveis do banco. Os valores de exemplo servem apenas para desenvolvimento local. Em seguida:

```sh
docker compose --env-file .env -f src/docker-compose.yaml up -d
npm run catalog:update
npm run images:update
npm run dev
```

Abra [localhost:3000](http://localhost:3000) e crie sua conta. Aguarde o banco ficar saudável antes de iniciar o servidor. Na primeira inicialização, o catálogo é importado para o PostgreSQL.

No PowerShell com execução de scripts bloqueada, use `npm.cmd` no lugar de `npm`.

### Catálogo e imagens

`data/catalog.json` e `data/card-images.json` são gerados localmente e não entram no Git. Execute os comandos nessa ordem antes do primeiro uso e dos testes. Os downloads completos podem ser grandes e levar alguns minutos.

Para atualizar, repita `catalog:update` e `images:update` e reinicie a aplicação. O primeiro usa MTGJSON; o segundo gera um índice de URLs a partir dos dados em massa do Scryfall. Nenhum deles baixa arquivos de imagem. Detalhes em [data/README.md](data/README.md).

## Comandos

| Comando                  | Finalidade                                             |
| ------------------------ | ------------------------------------------------------ |
| `npm run dev`            | Servidor com reinicialização durante o desenvolvimento |
| `npm run build`          | Compila TypeScript em `dist/`                          |
| `npm start`              | Executa `dist/server.js` após a compilação             |
| `npm test`               | Compila e executa testes automatizados                 |
| `npm run lint`           | Verifica o JavaScript do frontend com ESLint           |
| `npm run catalog:update` | Gera ou atualiza o catálogo local                      |
| `npm run images:update`  | Gera ou atualiza o índice de imagens                   |

Os testes padrão precisam dos dois JSONs gerados, mas não de PostgreSQL nem de conexão externa durante a execução. Os testes `tests/*.integration.cjs` são opcionais e exigem banco configurado; o teste de imagens também exige rede. Consulte a [referência técnica](docs/REFERENCE.md#verificação) antes de executá-los.

A auditoria das dependências identificou uma pendência na cadeia do TypeORM. Consulte [SECURITY.md](SECURITY.md) para o resultado e os limites da verificação antes de uma implantação pública.

## Documentação interativa da API

Com o servidor iniciado, abra [Swagger UI](http://localhost:3000/api-docs/) em `/api-docs/`. O documento OpenAPI 3.1 está disponível em `/api-docs/openapi.json`; ambos usam a porta configurada na aplicação.

Execute `POST /auth/login`, copie o campo `token` e clique em **Authorize**, informando apenas o JWT, sem o prefixo `Bearer`. As operações protegidas passam a enviar o token automaticamente. A documentação é pública; os endpoints da aplicação mantêm a autenticação existente. O token não é persistido pelo Swagger após recarregar a página.

**Try it out executa operações reais**, incluindo alterações e exclusões. Use contas de teste e substitua os UUIDs ilustrativos pelos identificadores retornados pela API. Para movimentações, execute primeiro a prévia e use o `previewToken` recebido na confirmação.

Os corpos e filtros são derivados dos validadores Zod em `src/controllers/schemas.ts`. Rotas, respostas e regras adicionais ficam em `src/openapi.ts`. Ao alterar a API, atualize essa documentação; os testes conferem a cobertura das rotas e as referências dos schemas.

## Estrutura

O layout, as fontes dos indicadores e os limites da nova interface estão descritos em [docs/FRONTEND.md](docs/FRONTEND.md).

```text
public/             Interface e módulos JavaScript
public/styles.css   Entrada central dos estilos
public/css/         Estilos separados por responsabilidade
src/                API, entidades, serviços e configuração
src/migrations/     Alterações incrementais de schema em SQL
scripts/            Geração do catálogo e do índice de imagens
data/               Documentação das fontes e arquivos locais gerados
tests/              Testes automatizados e de integração
docs/REFERENCE.md   API, regras de funcionamento e detalhes técnicos
```

## Limitações e execução compilada

O formato do deck não implica validação completa das regras de Magic. Impressões físicas, artes e edições possuídas não são rastreadas individualmente. A sugestão de power level é uma heurística experimental, ajustável pelo usuário; não detecta todas as sinergias ou combos.

Para executar compilado, use `npm run build` e `npm start`. Mantenha `public/` e os JSONs de `data/` junto de `dist/` na raiz da aplicação.

Em desenvolvimento, o TypeORM sincroniza o schema automaticamente. Com `NODE_ENV=production`, essa sincronização fica desligada. Os SQLs de `src/migrations/` são incrementais e **não constituem uma instalação inicial completa nem são executados automaticamente**. Uma implantação pública ainda exige preparar o schema inicial, aplicar as alterações necessárias e configurar infraestrutura, HTTPS e segredos próprios. Este repositório documenta a instalação local.

## Licença e direitos de terceiros

Para padrões de formatação, commits e branches, consulte [CONTRIBUTING.md](CONTRIBUTING.md).

O código original do DeckTrack é disponibilizado sob a [licença MIT](LICENSE). Essa licença não concede direitos sobre nomes de cartas, regras, ilustrações, símbolos, marcas ou outros materiais de terceiros.

DeckTrack é conteúdo de fã não oficial, disponibilizado conforme a [Política de Conteúdo de Fãs da Wizards](https://company.wizards.com/pt-BR/legal/fancontentpolicy), sem aprovação ou apoio da empresa. Parte do material exibido pertence à Wizards of the Coast. © Wizards of the Coast LLC. Magic: The Gathering e suas marcas pertencem aos respectivos titulares.

Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para os créditos, fontes e limites de uso. Manter o código aberto e exibir créditos não substitui as permissões exigidas pelos titulares. A licença MIT do código não autoriza vender ou relicenciar o conteúdo das cartas.
