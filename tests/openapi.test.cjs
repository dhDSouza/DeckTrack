const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { app } = require("../dist/app");
const { openapi } = require("../dist/openapi");

test("OpenAPI covers every API and media operation and resolves all schema references", () => {
    for (const file of ["src/routes.ts", "src/media.ts"]) {
        const source = readFileSync(file, "utf8");

        for (const match of source.matchAll(/(?:routes|media)\.(get|post|put|patch|delete)\("([^"]+)"/g)) {
            const path = match[2].replace(/:([a-zA-Z]+)/g, "{$1}");

            assert.ok(openapi.paths[path]?.[match[1]], `${match[1]} ${path} is documented`);
        }
    }

    const operationIds = new Set();

    for (const [path, methods] of Object.entries(openapi.paths)) {
        for (const operation of Object.values(methods)) {
            assert.ok(!operationIds.has(operation.operationId));
            operationIds.add(operation.operationId);

            for (const match of path.matchAll(/\{([^}]+)\}/g)) {
                assert.ok(
                    operation.parameters.some(
                        (parameter) => parameter.in === "path" && parameter.name === match[1] && parameter.required
                    )
                );
            }

            if (path.startsWith("/auth/") || path.startsWith("/media/")) {
                assert.deepEqual(operation.security, []);
            } else {
                assert.ok(operation.responses["401"]);
            }
        }
    }

    for (const match of JSON.stringify(openapi).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)) {
        assert.ok(openapi.components.schemas[match[1]], match[1]);
    }

    assert.ok(openapi.components.schemas.MovementConfirmInput.required.includes("previewToken"));
    assert.equal(openapi.components.schemas.DeckUpdateInput.properties.powerLevel.anyOf[0].maximum, 10);
    assert.equal(openapi.paths["/decks/{id}"].delete.responses["204"].content, undefined);
});

test("Swagger UI and JSON are public, serve local assets and leave protected API routes authenticated", async () => {
    const server = app.listen(0, "127.0.0.1");

    try {
        await new Promise((resolve) => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        const specResponse = await fetch(`${base}/api-docs/openapi.json`);

        assert.equal(specResponse.status, 200);
        assert.equal((await specResponse.json()).openapi, "3.1.0");

        const ui = await fetch(`${base}/api-docs/`);

        assert.equal(ui.status, 200);
        assert.match(await ui.text(), /swagger-ui/);

        const asset = await fetch(`${base}/api-docs/swagger-ui.css`);

        assert.equal(asset.status, 200);
        assert.match(asset.headers.get("content-type"), /css/);

        const initialization = await fetch(`${base}/api-docs/swagger-ui-init.js`);
        const script = await initialization.text();

        assert.match(script, /\/api-docs\/openapi.json/);
        assert.match(script, /"validatorUrl": null/);
        assert.match(script, /"persistAuthorization": false/);
        assert.equal((await fetch(`${base}/decks`)).status, 401);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
