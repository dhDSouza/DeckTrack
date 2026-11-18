# Segurança

## Auditoria das dependências

Em 18/11/2026, `npm audit --omit=dev --audit-level=high` apontou quatro alertas de severidade alta na cadeia `typeorm@1.1.3 → tinyglobby@0.2.17 → fdir@6.5.0 / picomatch@4.0.7`.

O problema de origem é [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), relacionado a negação de serviço por expressões glob especialmente construídas. Na data da revisão, o aviso não listava versão corrigida. Os quatro alertas incluem os pacotes que dependem da mesma biblioteca; não representam quatro falhas independentes identificadas no código do DeckTrack.

O npm sugeriu `npm audit fix --force`, com troca para `typeorm@0.3.31`, classificada como alteração incompatível. Essa troca não foi aplicada: requer revisão de compatibilidade, testes de integração e avaliação de schema. A exposição efetiva desse caminho na aplicação não foi demonstrada pela auditoria; isso também não comprova ausência de risco.

Reavalie as versões disponíveis e essa dependência antes de implantar uma instância pública. Build e testes aprovados não substituem essa avaliação.

## Configuração

- Não publique `.env`, credenciais, tokens ou cópias do banco.
- Gere um `JWT_SECRET` próprio e use credenciais diferentes dos exemplos locais.
- O Compose fornecido publica o PostgreSQL apenas em `127.0.0.1`.
- O fluxo de produção ainda exige schema preparado e infraestrutura configurada, conforme o README.

## Relato de vulnerabilidades

Não inclua segredos ou dados pessoais em issues públicas. Se o repositório oferecer o recurso de relato privado de vulnerabilidades do GitHub, use esse canal. Este projeto ainda não declara um canal privado próprio nem um prazo de atendimento.
