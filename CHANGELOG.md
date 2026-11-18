# Histórico de versões

## 1.1.0 — 2026-11-18

Reformulação do frontend com identidade arcana, mantendo compatibilidade com a API e as funcionalidades da versão anterior.

### Novidades

- Design system com paleta violeta/dourada, tipografia Cinzel/Inter e símbolo vetorial original.
- Cabeçalho com pesquisa de cartas, atividades e preferências locais de aparência.
- Sidebar recolhível, atalhos para pool e estatísticas e decks organizados por formato.
- Dashboard com dados reais de decks, coleção, pool, faltas, cores do acervo e atividades recentes.
- Cards dos decks com arte representativa, identidade de cores e progresso físico.
- Tela do deck com prévia do comandante, lista compacta agrupada e pesquisável, curva de mana e resumo físico.
- Pré-visualização das cartas por ponteiro ou teclado, preservando detalhes em modal, grade e lista detalhada.
- Ajustes visuais em coleção, pool, autenticação, filtros e formulários, com layout responsivo e redução de animações.
- ESLint para o JavaScript do frontend e testes dos resumos de decks e estados vazios.

### Validação

Formatação, lint, compilação e verificação de tipos aprovados, com 61 testes automatizados. Navegação e fluxos principais conferidos no Edge com conta temporária, incluindo edição de quantidade e larguras de 1920, 1366, 768 e 390 pixels.

### Compatibilidade e limites

Sem alteração dos contratos da API, das regras de autenticação ou do schema do banco. A atividade recente usa um recorte de até 100 eventos; ausência de dados não gera datas fictícias. Preferências visuais ficam apenas no navegador. Playtest, compartilhamento e exportação não foram incluídos sem integração existente. Os alertas e requisitos para hospedagem pública documentados em `SECURITY.md` e `THIRD_PARTY_NOTICES.md` continuam aplicáveis.

## 1.0.0 — 2026-11-18

Primeira versão do DeckTrack, com interface em português para organizar decks e rastrear uma coleção física de Magic: The Gathering.

### Funcionalidades

- Cadastro e autenticação com JWT, com decks e coleção privados por usuário.
- Catálogo local gerado do MTGJSON, filtros avançados e imagens carregadas do Scryfall.
- Importação de listas com quantidades, conferência e registro opcional de cópias na coleção.
- Decks em grade ou lista detalhada, detalhes das cartas em modal, capas e múltiplos comandantes.
- Rastreamento de cartas entre pool e decks, transferências e substituições com conferência prévia.
- Histórico auditado de alterações e versões imutáveis dos decks.
- Estatísticas por categoria, cores e curva de mana, com power level manual e sugestão experimental.
- Documentação interativa da API em `/api-docs/` e documento OpenAPI em `/api-docs/openapi.json`.
- Prettier configurado e convenções de contribuição com Gitflow e commits semânticos.

### Instalação e validação

Requer Node.js 24 e PostgreSQL. Siga o README para configurar o ambiente e gerar `data/catalog.json` e `data/card-images.json`; esses arquivos não são distribuídos pelo Git. A validação automatizada compreende verificação de formatação, compilação e 58 testes.

### Limitações conhecidas

- Há alertas na cadeia de dependências do TypeORM documentados em `SECURITY.md`.
- Uma implantação pública exige preparação do schema de produção e revisão do cadastro obrigatório conforme a política da Wizards.
- A sugestão de power level é experimental e não substitui a avaliação do jogador; a aplicação não valida todas as regras de construção dos formatos.
- A licença MIT cobre o código original. Os direitos sobre cartas, imagens e marcas permanecem com seus titulares, conforme `THIRD_PARTY_NOTICES.md`.
