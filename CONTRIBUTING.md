# Contribuindo com o DeckTrack

## Preparação

Siga o README para instalar Node.js 24, configurar o banco e gerar os JSONs locais. Nunca versione `.env`, dados pessoais, arquivos do banco ou snapshots completos do catálogo.

## Padrão de código

Execute `npm run format` antes de criar commits e `npm run format:check` para conferir. O Prettier usa quatro espaços, aspas duplas, ponto e vírgula, ausência de vírgula final e linhas de até 120 colunas quando possível. Regras e exceções estão em `.prettierrc.json` e `.prettierignore`.

Mantenha nomes descritivos, uma instrução por linha e espaços entre etapas lógicas. A formatação não substitui a revisão de legibilidade. Atualize `src/openapi.ts` ao alterar o contrato da API e mantenha os estilos separados por responsabilidade em `public/css/`.

## Branches e integração

O projeto utiliza Gitflow com `dev` como branch de integração:

- `main`: versões estáveis publicadas.
- `dev`: integração da próxima versão.
- `feature/<nome>`: funcionalidades criadas a partir de `dev`, com pull request para `dev`.
- `chore/<nome>`: manutenção e ferramentas, com integração em `dev`.
- `release/<versao>`: estabilização a partir de `dev`; após a validação, integração em `main` e `dev`.
- `hotfix/<nome>`: correções urgentes a partir de `main`; integração em `main` e `dev`.

Prefira merges que preservem os commits da funcionalidade. Não faça push direto de funcionalidades para `main`. Tags de release só devem ser criadas após a revisão e validação da versão. As tags de decks dentro da aplicação são independentes das tags Git.

## Commits semânticos

Use Conventional Commits no formato `tipo(escopo): descrição`, com escopo opcional. Exemplos:

```text
feat(decks): support multiple commanders
fix(collection): preserve owned quantities during transfers
docs(api): explain movement confirmation
test(tracking): cover concurrent pool withdrawals
chore(format): configure prettier
```

Use `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `build`, `ci` ou `chore` conforme o efeito da alteração. Indique mudanças incompatíveis com `!` e explique-as no corpo do commit. Divida alterações por finalidade, sem misturar correções independentes.

## Validação e pull requests

Antes de abrir um PR, execute:

```sh
npm run format:check
npm run lint
npm test
```

Os testes precisam de `data/catalog.json` e `data/card-images.json`, gerados conforme o README. Para alterações de persistência, execute também os testes de integração relevantes em um banco de desenvolvimento.

No PR, explique o problema, o comportamento final, a validação realizada e eventuais limitações. Consulte `SECURITY.md` e `THIRD_PARTY_NOTICES.md` antes de alterar dependências, publicar conteúdo de terceiros ou preparar uma implantação pública.
