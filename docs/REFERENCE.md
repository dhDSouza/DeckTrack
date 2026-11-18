# Referência funcional e técnica

Para instalar, executar e gerar os dados, siga o [README principal](../README.md).

## API

Cadastro e login são públicos. As demais rotas de dados exigem `Authorization: Bearer <token>`, obtido no login. O token expira em um dia. Use os UUIDs retornados pela API. Cada usuário acessa apenas seus decks, coleção, localizações, histórico e versões.

| Método               | Rota                                 | Finalidade                                                          |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| POST                 | `/auth/register`                     | Cadastro com username, email e password                             |
| POST                 | `/auth/login`                        | Autenticação com email e password; retorna user e token             |
| GET                  | `/users/me`                          | Perfil autenticado                                                  |
| GET / POST           | `/cards`                             | Busca paginada ou cadastro de carta extra no catálogo compartilhado |
| GET                  | `/cards/filters`                     | Tipos, palavras-chave e edições para filtros                        |
| GET                  | `/collection`                        | Coleção e quantidades possuídas                                     |
| PUT                  | `/collection/:cardId`                | Define a quantidade física com `quantity`                           |
| GET / POST           | `/decks`                             | Lista ou cria decks                                                 |
| GET / PATCH / DELETE | `/decks/:id`                         | Consulta, edição ou exclusão do deck                                |
| PUT                  | `/decks/:id/cards/:cardId`           | Define `quantity`, com `registerOwned` opcional                     |
| PUT                  | `/decks/:id/cards/:cardId/commander` | Marca ou desmarca com `isCommander`                                 |
| POST                 | `/decks/:id/import/preview`          | Confere lista em `text`, sem gravar                                 |
| POST                 | `/decks/:id/import`                  | Importa lista validada em uma transação                             |
| GET                  | `/tracking`                          | Localizações, pool e pendências                                     |
| GET                  | `/cards/:cardId/locations`           | Localizações da carta do usuário                                    |
| POST                 | `/tracking/move/preview`             | Confere transferência ou substituição                               |
| POST                 | `/tracking/move`                     | Confirma operação conferida                                         |
| GET                  | `/history`                           | Histórico paginado, com filtros deckId e cardId                     |
| GET                  | `/history/:id`                       | Detalhes e snapshots do evento                                      |
| GET / POST           | `/decks/:id/versions`                | Lista ou salva versão com tag e note                                |
| GET                  | `/decks/:id/versions/:versionId`     | Snapshot e comparação com o estado atual                            |

`GET /cards?q=Sol&page=1&pageSize=60` retorna `{items,total,page,pageSize}`. A página começa em 1; o tamanho varia de 1 a 100. Os filtros aceitos e a validação dos corpos estão em `src/controllers/schemas.ts` e `src/services/CardFilters.ts`.

PUT define a quantidade absoluta; zero remove a associação. Formatos: commander, pauper, standard e free. Não há validação completa de legalidade, identidade de cor ou sideboard.

## Importação e coleção

Uma linha representa quantidade e nome em inglês, como `30 Island`. A prévia informa nomes inválidos ou ambíguos. A confirmação substitui a composição do deck em uma transação; uma lista inválida não produz alterações parciais.

`registerOwned` é opcional e fica desativado por padrão. Quando ativado, registra cópias adicionais na coleção, mantendo a maior quantidade já contabilizada para aquela carta naquele deck:

- Importar 30 Island no deck A registra 30 cópias; repetir registra zero.
- Aumentar para 32 registra mais duas; registrar duas no deck B acrescenta outras duas.
- Reduzir quantidades, remover cartas ou excluir decks não reduz a coleção.
- Corrigir manualmente o estoque não é desfeito por uma reimportação igual.

Use a opção para cópias a acrescentar ao estoque. Para cartas já cadastradas e reutilizadas em um deck, deixe desmarcada. Cópias recebidas por movimentação são contabilizadas no destino para evitar registro duplicado posterior.

## Rastreamento e movimentações

`assignedQuantity` soma as quantidades em todos os decks. `poolQuantity` é o máximo entre zero e `ownedQuantity - assignedQuantity`; `missingQuantity` é o máximo entre zero e `assignedQuantity - ownedQuantity`. Os decks representam localizações declaradas, sem identificar cada exemplar físico.

A prévia de movimentação recebe:

```json
{
    "cardId": "uuid-da-carta",
    "quantity": 1,
    "fromDeckId": null,
    "toDeckId": "uuid-do-destino",
    "replaceCardId": null,
    "operationId": "uuid-unico-da-operacao",
    "note": "Troca de terreno"
}
```

`null` representa pool. Para substituir uma carta, informe `replaceCardId`; a mesma quantidade sai do destino e volta para a pool. O estoque total permanece igual. Na confirmação, envie também `previewToken` e reconheça os avisos com `acknowledgeWarnings: true` quando necessário.

Se a operação alterar o tamanho de um Commander para um total diferente de 100, é exigido reconhecimento do aviso. Uma prévia desatualizada retorna HTTP 409. Reenviar uma operação com o mesmo identificador e conteúdo não repete a movimentação. Estoque, composição e auditoria são gravados em uma transação.

## Comandantes, histórico e versões

Na visualização em grade, as cartas mostram somente a imagem, a quantidade e a indicação de comandante. Clicar na carta abre um modal com metadados, regras, disponibilidade e ações para editar quantidade, marcar comandante, definir capa e localizar ou mover a carta. A lista detalhada mantém essas informações junto de cada carta. No modal, clicar na imagem permite ampliá-la e consultar outras faces.

Várias cartas podem ser marcadas como comandante em decks Commander, inclusive parceiros e Background. A aplicação verifica associação e proprietário, mas não a elegibilidade legal. Marcar comandante não muda a quantidade ou a capa.

O histórico registra mudanças efetivas, com diferenças e snapshots antes/depois. Eventos não têm rotas de edição ou exclusão. Tags de versões são imutáveis e não restauram automaticamente uma composição antiga. Excluir um deck preserva seus eventos e versões; a comparação retorna `current: null`. O histórico não reconstrói ações anteriores à implementação da auditoria.

## Estatísticas e power level

Os cálculos usam quantidades físicas, não apenas nomes diferentes. Categorias contam cada carta uma vez, com comandantes prioritários. A curva de mana exclui terrenos da primeira face, preserva valores zero e fracionários e agrupa custos a partir de sete em `7+`. Dados ausentes não viram custo zero. Cores e identidade de cor são indicadores distintos.

`PATCH /decks/:id` aceita `powerLevel` inteiro de 1 a 10 ou null. A nota salva é auditada e incluída nas versões. A sugestão automática exige Commander com 100 cópias e cobertura suficiente de metadados. É uma heurística experimental baseada em curva, terrenos e padrões de texto, com baixa confiança; não avalia todos os combos, sinergias ou turnos de vitória. Aplicar a sugestão edita o campo; salvar exige ação explícita.

## Estilos

`public/styles.css` centraliza os módulos de `public/css/`: base, layout, components, forms, auth, responsive, imports, filters, images, decks, tracking e statistics. Mantenha os ajustes específicos junto de cada funcionalidade e importe novos módulos pelo arquivo principal.

## Verificação

`npm test` compila e executa os testes sem banco ou rede, usando os dois JSONs gerados localmente. Cobre autenticação, validação, catálogo, filtros, imagens, importação, coleção, comandantes, rastreamento, auditoria e estatísticas.

Para verificações opcionais com o PostgreSQL configurado, execute `npm run build` e depois um dos comandos:

```sh
node tests/card-filters.integration.cjs
node tests/card-images.integration.cjs
node tests/deck-commanders.integration.cjs
node tests/tracking.integration.cjs
node tests/deck-stats.integration.cjs
```

Esses testes criam contas temporárias e as removem ao terminar. O teste de filtros também atualiza os metadados do catálogo. O teste de imagens acessa o CDN e requer rede. Use um banco de desenvolvimento.
