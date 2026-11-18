# Catálogo de cartas

Os arquivos `catalog.json` e `card-images.json` são gerados localmente e ignorados pelo Git. Após clonar o projeto, execute `npm run catalog:update` e depois `npm run images:update`. Não é necessário baixar arquivos de imagem. Os dados continuam sujeitos aos [direitos e condições dos respectivos titulares](../THIRD_PARTY_NOTICES.md); a licença MIT do DeckTrack não se aplica ao conteúdo das cartas.

`catalog.json` é um snapshot de [AtomicCards e SetList, do MTGJSON](https://mtgjson.com/downloads/all-files/), com nomes e regras em inglês, identificadores e metadados para filtros. MTGJSON é um projeto comunitário independente, não uma API oficial da Wizards of the Coast.

O arquivo inclui a origem, a data da fonte e a data de geração. Cartas com múltiplas faces e reimpressões são agrupadas pelo Scryfall Oracle ID quando disponível; na ausência dele, o identificador deriva do nome completo. Preserva tipos/subtipos, cores e identidade de cor, texto de regras, custo/valor de mana, palavras-chave, legalidades e códigos das edições. Cada face tem nome, linha de tipo, texto e mana próprios. Para filtros, cores e tipos são unidos entre faces, o texto contém todas elas e o valor de mana é o da primeira face.

SetList fornece códigos, nomes e datas de lançamento das edições. Não contém imagens, preços, traduções ou detalhes de impressão (foil, artes alternativas, número de colecionador ou raridade por edição). A coleção contabiliza cópias da carta, sem distinguir suas impressões; filtrar uma edição indica que a carta foi publicada nela, não que você possui essa impressão.

Para atualizar, execute `npm run catalog:update` e reinicie a aplicação. O download acontece somente nesse comando; o servidor lê apenas o snapshot local. O script valida os dados e substitui o arquivo após completar o download e a conversão. Mantenha `data/` junto de `dist/` e `public/` na distribuição.

Na inicialização, o servidor importa o catálogo em uma transação, em lotes de 500. O conflito por `externalId` mantém os UUIDs do banco e as referências dos decks e da coleção. Atualizações não excluem cartas antigas ou manuais. Cartas manuais sem identificador correspondente não são fundidas automaticamente com as importadas.

Fontes: https://mtgjson.com/api/v5/AtomicCards.json.gz e https://mtgjson.com/api/v5/SetList.json

`card-images.json` é um índice separado de URLs diretos do Scryfall, sem arquivos de imagem. Inclui apenas os tamanhos usados na interface, as faces, nomes e créditos dos artistas. Para atualizar, execute `npm run images:update` após atualizar o catálogo e reinicie a aplicação. O comando usa a listagem em https://api.scryfall.com/bulk-data e o bulk Oracle Cards, aceitando JSONL compactado ou JSON. O navegador baixa as imagens diretamente do CDN; o índice não é importado para o banco. A impressão representativa não indica a versão física possuída.

Licença do MTGJSON: https://mtgjson.com/license/ — veja [LICENSE-MTGJSON.txt](LICENSE-MTGJSON.txt).

Magic: The Gathering é marca da Wizards of the Coast. DeckTrack não é afiliado nem endossado pela Wizards of the Coast.
