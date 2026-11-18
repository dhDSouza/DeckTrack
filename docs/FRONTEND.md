# Interface arcana

A reformulação mantém HTML, CSS e JavaScript sem framework, servidos pelo Express. Autenticação, rotas e regras de negócio permanecem no backend existente.

## Organização

- `public/css/base.css`: tokens de cores, tipografia Cinzel/Inter, espaçamento, foco, símbolos de identidade e preferências de movimento.
- `public/css/layout.css`: cabeçalho, busca, navegação, sidebar recolhível e perfil.
- `public/css/dashboard.css`: visão geral do acervo, indicadores, atividades e distribuição de cores.
- Os módulos anteriores continuam responsáveis por formulários, filtros, imagens, decks, estatísticas e rastreamento. `public/styles.css` centraliza os imports.
- `public/arcane-ui.js`: apresentação dos resumos, cards de decks, dashboard, preferências locais e composição da tela de deck. Reutiliza `DeckStats`, `CardImageUI`, os modais e a API existentes.
- `public/app.js`: estado compartilhado, autenticação, comunicação HTTP e navegação.

## Dados e limites

Os totais usam `/decks`, `/collection` e `/tracking`. Cartas e quantidades por deck são derivadas das localizações, sem buscar cada deck separadamente. As imagens usam as fontes já integradas ao Scryfall; não há novo cache de arquivos de imagem.

A atividade recente é obtida de `/history?pageSize=100`. Os decks são ordenados pela atividade disponível nesse recorte; ausência de registro é apresentada como ausência de atividade recente, sem fabricar datas. O resumo físico de cada deck compara suas quantidades com as quantidades possuídas. Se os mesmos exemplares forem declarados em vários decks, as pendências globais de rastreamento continuam sendo a referência para o estoque compartilhado.

A conclusão física não valida legalidade nem tamanho do formato. Um deck vazio não é contado como completo. Cores do acervo contam cada cópia uma vez, incluindo terrenos, com grupos próprios para multicolor e ausência de metadados.

A pesquisa do cabeçalho consulta o catálogo. A pesquisa da lista compacta filtra nome, mana e tipo localmente; os filtros avançados continuam atuando na grade/lista por categorias. Passar o ponteiro ou focar uma carta na lista compacta atualiza a prévia; clicar abre os detalhes.

Preferências de menu compacto e redução de animações são locais ao navegador. O histórico ocupa o atalho de atividades: não existe serviço de notificações. Playtest, compartilhamento, exportação de decks e configurações de conta não foram adicionados porque não possuem integração existente. Os formatos continuam Commander, Pauper, Standard e Livre.

## Validação

```sh
npm run format:check
npm run lint
npm test
```

O build de `npm test` também verifica os tipos TypeScript. O ESLint verifica os scripts de `public/`, respeitando os globais compartilhados da aplicação sem framework. A documentação principal descreve como gerar os JSONs necessários aos testes.
