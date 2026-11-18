import { z } from "zod";

import * as input from "./controllers/schemas";

type Schema = Record<string, any>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema) => ({ type: "array", items });
const uuid = { type: "string", format: "uuid" };
const integer = { type: "integer", minimum: 0 };
const text = { type: "string" };
const object = (properties: Schema): Schema => ({ type: "object", properties });

function requestSchema(schema: z.ZodType): Schema {
    const { $schema, ...json } = z.toJSONSchema(schema, { io: "input" });

    return json;
}

const schemas: Schema = {
    RegisterInput: requestSchema(input.register),
    LoginInput: requestSchema(input.login),
    CardInput: requestSchema(input.card),
    DeckInput: requestSchema(input.deck),
    DeckUpdateInput: requestSchema(input.deckUpdate),
    QuantityInput: requestSchema(input.quantity),
    DeckCardInput: requestSchema(input.deckCardQuantity),
    CommanderInput: requestSchema(input.commander),
    ListInput: requestSchema(input.deckList),
    MovementInput: requestSchema(input.movement),
    VersionInput: requestSchema(input.versionTag),
    Error: {
        ...object({ message: text, errors: array(object({ path: array({}), message: text, code: text })) }),
        required: ["message"]
    },
    User: object({ id: uuid, username: text, email: { type: "string", format: "email" } }),
    Login: object({ user: ref("User"), token: { type: "string", description: "JWT com validade de um dia." } }),
    Card: object({
        id: uuid,
        name: text,
        externalId: { type: ["string", "null"] },
        metadata: { type: ["object", "null"], additionalProperties: true },
        imagery: {
            type: ["object", "null"],
            additionalProperties: true,
            description: "URLs e créditos das faces, quando disponíveis."
        }
    }),
    CardPage: object({ items: array(ref("Card")), total: integer, page: integer, pageSize: integer }),
    FilterOptions: object({
        sets: array(object({ code: text, name: text, releaseDate: text })),
        types: array(text),
        keywords: array(text)
    }),
    CollectionEntry: object({ cardId: uuid, userId: uuid, quantity: integer, card: ref("Card") }),
    QuantityResult: object({ cardId: uuid, quantity: integer, collectionAddedQuantity: integer }),
    CommanderResult: object({ cardId: uuid, isCommander: { type: "boolean" } }),
    Deck: object({
        id: uuid,
        name: text,
        format: { type: "string", enum: ["commander", "pauper", "standard", "free"] },
        userId: uuid,
        coverCardId: { type: ["string", "null"], format: "uuid" },
        powerLevel: { type: ["integer", "null"], minimum: 1, maximum: 10 },
        coverCard: { anyOf: [ref("Card"), { type: "null" }] },
        cards: array(
            object({
                cardId: uuid,
                deckId: uuid,
                quantity: integer,
                ownedQuantity: integer,
                isCommander: { type: "boolean" },
                card: ref("Card")
            })
        )
    }),
    Location: object({
        cardId: uuid,
        card: ref("Card"),
        ownedQuantity: integer,
        assignedQuantity: integer,
        poolQuantity: integer,
        missingQuantity: integer,
        locations: array(object({ deckId: uuid, name: text, format: text, quantity: integer }))
    }),
    ImportResult: {
        ...object({
            canImport: { type: "boolean" },
            cards: array(object({ cardId: uuid, name: text, quantity: integer, lines: array(integer) })),
            errors: array(object({ line: integer, text, message: text })),
            totalQuantity: integer,
            collectionAddedQuantity: integer,
            imported: { type: "boolean" },
            message: text
        }),
        description:
            "Conferência da lista, cartas resolvidas, erros e totais. A confirmação acrescenta imported; registerOwned pode acrescentar collectionAddedQuantity.",
        additionalProperties: true
    },
    MovementPreview: object({
        card: ref("Card"),
        quantity: integer,
        pool: object({
            ownedQuantity: integer,
            assignedQuantity: integer,
            poolQuantity: integer,
            missingQuantity: integer
        }),
        replacement: { type: ["object", "null"], additionalProperties: true },
        previewToken: { type: "string", pattern: "^[a-f0-9]{64}$" },
        warnings: array(text),
        totals: array(object({ deckId: uuid, name: text, format: text, before: integer, after: integer }))
    }),
    MovementResult: object({
        operationId: uuid,
        quantity: integer,
        warnings: array(text),
        totals: array(object({ deckId: uuid, name: text, format: text, before: integer, after: integer }))
    }),
    Event: object({
        id: uuid,
        action: text,
        createdAt: { type: "string", format: "date-time" },
        deckIds: array(uuid),
        cardIds: array(uuid),
        payload: { type: "object", additionalProperties: true }
    }),
    HistoryPage: object({
        items: array({ type: "object", additionalProperties: true }),
        total: integer,
        page: integer,
        pageSize: integer
    }),
    Version: object({
        id: uuid,
        tag: text,
        note: text,
        createdAt: { type: "string", format: "date-time" },
        changeCount: integer,
        totalQuantity: integer
    }),
    VersionDetail: object({
        id: uuid,
        tag: text,
        note: text,
        createdAt: { type: "string", format: "date-time" },
        changeCount: integer,
        snapshot: { type: "object", additionalProperties: true },
        current: { type: ["object", "null"], additionalProperties: true },
        changes: array({ type: "object", additionalProperties: true })
    }),
    MediaInfo: object({ name: text, url: text, faces: array(object({ name: text, artist: text })) })
};

const movementConfirm = structuredClone(schemas.MovementInput);
movementConfirm.required = [...new Set([...(movementConfirm.required ?? []), "previewToken"])];
schemas.MovementConfirmInput = movementConfirm;

const paths: Record<string, Record<string, any>> = {};

function queryParameters(schema: z.ZodType) {
    const json = requestSchema(schema);

    return Object.entries(json.properties ?? {}).map(([name, value]) => ({
        name,
        in: "query",
        required: json.required?.includes(name) ?? false,
        schema: value
    }));
}

type Endpoint = {
    method: string;
    path: string;
    tag: string;
    summary: string;
    response?: Schema;
    body?: string;
    example?: Schema;
    status?: number;
    public?: boolean;
    query?: any[];
    description?: string;
    errors?: Record<string, string>;
};

function endpoint(config: Endpoint) {
    const status = config.status ?? 200;
    const errorDescriptions: Record<string, string> = {
        "400": "Parâmetros, JSON ou corpo inválidos.",
        ...(!config.public ? { "401": "JWT ausente, inválido ou expirado." } : {}),
        "500": "Erro interno do servidor.",
        ...config.errors
    };
    const responses: Schema = {};

    for (const [code, description] of Object.entries(errorDescriptions)) {
        responses[code] = { description, content: { "application/json": { schema: ref("Error") } } };
    }

    responses[status] = {
        description: status === 204 ? "Excluído, sem corpo de resposta." : "Operação concluída.",
        ...(config.response ? { content: { "application/json": { schema: config.response } } } : {})
    };

    const parameters: any[] = [...config.path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
        name: match[1],
        in: "path",
        required: true,
        schema: uuid
    }));

    parameters.push(...(config.query ?? []));
    paths[config.path] ??= {};
    paths[config.path]![config.method] = {
        tags: [config.tag],
        summary: config.summary,
        description: config.description,
        operationId: `${config.method}_${config.path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
        ...(config.public ? { security: [] } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(config.body
            ? {
                  requestBody: {
                      required: true,
                      content: {
                          "application/json": {
                              schema: ref(config.body),
                              ...(config.example ? { example: config.example } : {})
                          }
                      }
                  }
              }
            : {}),
        responses
    };
}

const notFound = { "404": "Recurso não encontrado ou não pertence ao usuário." };
const conflict = {
    ...notFound,
    "409": "Conflito de estado, identificador ou operação. Confira novamente antes de reenviar."
};
const sampleId = "00000000-0000-4000-8000-000000000001";

endpoint({
    method: "post",
    path: "/auth/register",
    tag: "Autenticação",
    summary: "Criar conta",
    public: true,
    body: "RegisterInput",
    response: ref("User"),
    status: 201,
    example: { username: "player", email: "player@example.com", password: "senha-de-exemplo" },
    description: "Senha de pelo menos 8 caracteres e no máximo 72 bytes UTF-8.",
    errors: { "409": "E-mail já cadastrado." }
});
endpoint({
    method: "post",
    path: "/auth/login",
    tag: "Autenticação",
    summary: "Entrar e obter JWT",
    public: true,
    body: "LoginInput",
    response: ref("Login"),
    example: { email: "player@example.com", password: "senha-de-exemplo" },
    errors: { "401": "Credenciais inválidas." }
});
endpoint({
    method: "get",
    path: "/users/me",
    tag: "Autenticação",
    summary: "Consultar perfil autenticado",
    response: ref("User"),
    errors: notFound
});
endpoint({
    method: "get",
    path: "/cards",
    tag: "Catálogo",
    summary: "Buscar cartas com filtros e paginação",
    response: ref("CardPage"),
    query: queryParameters(input.cardSearch),
    description:
        "Nome e regras em inglês. Cores: W,U,B,R,G ou C sozinho. manaMin deve ser menor ou igual a manaMax. scope=collection restringe à coleção; deckId restringe a um deck próprio.",
    errors: notFound
});
endpoint({
    method: "get",
    path: "/cards/filters",
    tag: "Catálogo",
    summary: "Obter opções dos filtros",
    response: ref("FilterOptions")
});
endpoint({
    method: "post",
    path: "/cards",
    tag: "Catálogo",
    summary: "Cadastrar carta extra no catálogo compartilhado",
    body: "CardInput",
    response: ref("Card"),
    status: 201,
    example: { name: "Carta extra" },
    errors: { "409": "Identificador já cadastrado." }
});
endpoint({
    method: "get",
    path: "/collection",
    tag: "Coleção",
    summary: "Listar coleção física",
    response: array(ref("CollectionEntry"))
});
endpoint({
    method: "put",
    path: "/collection/{cardId}",
    tag: "Coleção",
    summary: "Definir quantidade possuída",
    body: "QuantityInput",
    response: ref("QuantityResult"),
    example: { quantity: 3 },
    description: "Quantidade absoluta. Zero remove da coleção; não altera automaticamente os decks.",
    errors: notFound
});
endpoint({ method: "get", path: "/decks", tag: "Decks", summary: "Listar meus decks", response: array(ref("Deck")) });
endpoint({
    method: "post",
    path: "/decks",
    tag: "Decks",
    summary: "Criar deck",
    body: "DeckInput",
    response: ref("Deck"),
    status: 201,
    example: { name: "Meu deck", format: "commander" }
});
endpoint({
    method: "get",
    path: "/decks/{id}",
    tag: "Decks",
    summary: "Consultar deck e suas cartas",
    response: ref("Deck"),
    errors: notFound
});
endpoint({
    method: "patch",
    path: "/decks/{id}",
    tag: "Decks",
    summary: "Editar nome, formato, capa ou power level",
    body: "DeckUpdateInput",
    response: ref("Deck"),
    example: { powerLevel: 6 },
    description:
        "coverCardId deve pertencer ao deck. null remove capa ou nota. Power level é uma autoavaliação de 1 a 10. Alterações são auditadas.",
    errors: notFound
});
endpoint({
    method: "delete",
    path: "/decks/{id}",
    tag: "Decks",
    summary: "Excluir deck preservando histórico e versões",
    status: 204,
    errors: notFound
});
endpoint({
    method: "put",
    path: "/decks/{id}/cards/{cardId}",
    tag: "Decks",
    summary: "Definir quantidade de uma carta no deck",
    body: "DeckCardInput",
    response: ref("QuantityResult"),
    example: { quantity: 1, registerOwned: false },
    description:
        "Zero remove do deck. registerOwned registra cópias adicionais na coleção conforme o maior total já contabilizado para a carta neste deck; repetir não duplica o estoque.",
    errors: notFound
});
endpoint({
    method: "put",
    path: "/decks/{id}/cards/{cardId}/commander",
    tag: "Decks",
    summary: "Marcar ou desmarcar comandante",
    body: "CommanderInput",
    response: ref("CommanderResult"),
    example: { isCommander: true },
    description:
        "Exige deck Commander e carta já presente. Permite múltiplos comandantes; não verifica elegibilidade pelas regras do formato.",
    errors: notFound
});
endpoint({
    method: "post",
    path: "/decks/{id}/import/preview",
    tag: "Importação",
    summary: "Conferir lista sem gravar",
    body: "ListInput",
    response: ref("ImportResult"),
    example: { text: "30 Island\n1 Arcane Lighthouse", registerOwned: false },
    errors: notFound
});
endpoint({
    method: "post",
    path: "/decks/{id}/import",
    tag: "Importação",
    summary: "Importar lista completa em uma transação",
    body: "ListInput",
    response: ref("ImportResult"),
    example: { text: "30 Island\n1 Arcane Lighthouse", registerOwned: false },
    description: "Substitui a composição do deck. Nomes ambíguos ou desconhecidos impedem a importação inteira.",
    errors: {
        ...notFound,
        "422": "Lista contém erros. Retorna a conferência com imported=false e message; nenhuma carta é importada."
    }
});
paths["/decks/{id}/import"]!.post.responses["422"].content["application/json"].schema = ref("ImportResult");
endpoint({
    method: "get",
    path: "/tracking",
    tag: "Rastreamento",
    summary: "Listar estoque, pool e localizações",
    response: array(ref("Location"))
});
endpoint({
    method: "get",
    path: "/cards/{cardId}/locations",
    tag: "Rastreamento",
    summary: "Localizar uma carta nos meus decks",
    response: ref("Location"),
    errors: notFound
});
const moveExample = {
    cardId: sampleId,
    quantity: 1,
    fromDeckId: null,
    toDeckId: "00000000-0000-4000-8000-000000000002",
    replaceCardId: null,
    operationId: "00000000-0000-4000-8000-000000000003",
    note: "Transferência da pool"
};
endpoint({
    method: "post",
    path: "/tracking/move/preview",
    tag: "Rastreamento",
    summary: "Conferir transferência ou substituição",
    body: "MovementInput",
    response: ref("MovementPreview"),
    example: moveExample,
    description:
        "null representa pool. Origem e destino devem diferir e ao menos um deve ser deck. replaceCardId devolve a carta substituída à pool, preservando o tamanho do destino.",
    errors: conflict
});
endpoint({
    method: "post",
    path: "/tracking/move",
    tag: "Rastreamento",
    summary: "Confirmar movimentação conferida",
    body: "MovementConfirmInput",
    response: ref("MovementResult"),
    example: { ...moveExample, previewToken: "0".repeat(64), acknowledgeWarnings: false },
    description:
        "Use UUIDs reais e o previewToken retornado pela prévia. Avisos Commander exigem acknowledgeWarnings=true. Prévia desatualizada retorna 409. Reenvio idêntico do mesmo operationId não repete a operação; conteúdo diferente com o mesmo identificador retorna 409.",
    errors: conflict
});
endpoint({
    method: "get",
    path: "/history",
    tag: "Histórico e versões",
    summary: "Consultar histórico paginado",
    response: ref("HistoryPage"),
    query: queryParameters(input.historySearch)
});
endpoint({
    method: "get",
    path: "/history/{id}",
    tag: "Histórico e versões",
    summary: "Consultar evento e snapshots",
    response: ref("Event"),
    errors: notFound
});
endpoint({
    method: "get",
    path: "/decks/{id}/versions",
    tag: "Histórico e versões",
    summary: "Listar versões salvas do deck",
    response: array(ref("Version"))
});
endpoint({
    method: "post",
    path: "/decks/{id}/versions",
    tag: "Histórico e versões",
    summary: "Salvar versão imutável",
    body: "VersionInput",
    response: ref("Version"),
    status: 201,
    example: { tag: "v1.0", note: "Lista inicial" },
    errors: conflict
});
endpoint({
    method: "get",
    path: "/decks/{id}/versions/{versionId}",
    tag: "Histórico e versões",
    summary: "Comparar versão com deck atual",
    response: ref("VersionDetail"),
    description: "Não restaura o deck. current=null quando o deck foi excluído.",
    errors: notFound
});
endpoint({
    method: "get",
    path: "/media/cards/{id}/info",
    tag: "Imagens",
    summary: "Consultar créditos públicos da imagem",
    public: true,
    response: ref("MediaInfo"),
    errors: { "404": "Carta ou imagem não encontrada.", "503": "Informações temporariamente indisponíveis." }
});
endpoint({
    method: "get",
    path: "/media/cards/{id}/{size}/{face}",
    tag: "Imagens",
    summary: "Redirecionar para imagem no CDN",
    public: true,
    status: 302,
    description:
        "Não transfere bytes da imagem pelo servidor. O navegador segue o redirecionamento para cards.scryfall.io.",
    errors: {
        "404": "Carta ou face não encontrada.",
        "503": "Imagem temporariamente indisponível; consulte Retry-After."
    }
});
const imageOperation = paths["/media/cards/{id}/{size}/{face}"]!.get;
imageOperation.parameters.find((parameter: any) => parameter.name === "size").schema = {
    type: "string",
    enum: ["small", "normal", "art_crop"]
};
imageOperation.parameters.find((parameter: any) => parameter.name === "face").schema = {
    type: "string",
    enum: ["0", "1"]
};
imageOperation.responses["302"] = {
    description: "Redirecionamento para o CDN.",
    headers: { Location: { schema: { type: "string", format: "uri" } } }
};

export const openapi = {
    openapi: "3.1.0",
    info: {
        title: "DeckTrack API",
        version: "1.1.0",
        description:
            "API de decks e coleção física. Faça login, copie token e use Authorize com o JWT (sem o prefixo Bearer). Try it out executa operações reais, inclusive alterações e exclusões. Os UUIDs dos exemplos são ilustrativos. Regras adicionais entre campos são validadas pelo servidor. DeckTrack é um projeto de fãs não oficial; os direitos sobre Magic pertencem aos respectivos titulares.",
        license: { name: "MIT — somente código original", url: "https://opensource.org/license/mit/" }
    },
    servers: [{ url: "/", description: "Servidor atual" }],
    tags: [
        "Autenticação",
        "Catálogo",
        "Coleção",
        "Decks",
        "Importação",
        "Rastreamento",
        "Histórico e versões",
        "Imagens"
    ].map((name) => ({ name })),
    security: [{ bearerAuth: [] }],
    components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
        schemas
    },
    paths
};
