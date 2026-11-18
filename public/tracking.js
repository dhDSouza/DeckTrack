window.TrackingUI = (() => {
    let query = "",
        scope = "all",
        page = 1,
        moveRequest = 0;
    const actions = {
        "deck.created": "Deck criado",
        "deck.updated": "Deck editado",
        "deck.deleted": "Deck excluído",
        "deck.cards.updated": "Cartas do deck alteradas",
        "deck.imported": "Lista importada",
        "commander.changed": "Comandantes alterados",
        "collection.updated": "Coleção ajustada",
        "cards.moved": "Cartas movimentadas",
        "cards.replaced": "Cartas substituídas",
        "version.saved": "Versão salva"
    };
    const esc = (value) => escapeHtml(value),
        date = (value) => new Date(value).toLocaleString("pt-BR");

    document
        .querySelector("nav")
        .insertAdjacentHTML(
            "beforeend",
            '<button data-page="tracking" class="nav-item">⌖ <span>Rastrear cartas</span></button>'
        );

    function summary(item) {
        if (!item) {
            return "";
        }

        return `<div class="location-summary"><span class="pool-label">${item.poolQuantity} na pool</span><span>${item.assignedQuantity} em decks</span>${item.missingQuantity ? `<strong class="error">Pendência: ${item.missingQuantity} cópias</strong>` : ""}</div>`;
    }

    function leave() {
        const root = $("#tracking-page");

        if (root) {
            root.hidden = true;
        }

        $(".content").hidden = false;
    }

    function show() {
        $(".content").hidden = true;

        let root = $("#tracking-page");

        if (!root) {
            root = document.createElement("section");
            root.id = "tracking-page";
            root.className = "content";
            $("main").append(root);
        }

        root.hidden = false;

        const items = state.tracking || [],
            free = items.reduce((sum, item) => sum + item.poolQuantity, 0),
            missing = items.reduce((sum, item) => sum + item.missingQuantity, 0);

        root.innerHTML = `<div class="page-heading"><div><span class="eyebrow">CADA CÓPIA TEM UM LUGAR</span><h1>Rastrear cartas<span>.</span></h1><p>${free} cópias livres na pool · ${missing} cópias pendentes nos decks</p></div><button class="secondary" id="tracking-history">Histórico geral</button></div><p class="detail-caption">Pool = coleção menos cópias usadas nos decks. Pendências indicam que os decks usam mais cópias do que você possui.</p><div class="tracking-toolbar"><label>Buscar carta<input id="tracking-query" type="search" placeholder="Nome da carta…" value="${esc(query)}"></label><label>Localização<select id="tracking-scope"><option value="all">Todas</option><option value="pool">Com cópias na pool</option><option value="decks">Em algum deck</option><option value="missing">Com pendências</option></select></label></div><p id="tracking-count" class="detail-caption"></p><div id="tracking-items" class="detail-list"></div><div id="tracking-pages" class="pagination"></div>`;
        $("#tracking-scope").value = scope;

        $("#tracking-query").oninput = (event) => {
            query = event.target.value;
            page = 1;
            render();
        };

        $("#tracking-scope").onchange = (event) => {
            scope = event.target.value;
            page = 1;
            render();
        };

        $("#tracking-history").onclick = () => history();

        function render() {
            const matches = items
                .filter(
                    (item) =>
                        item.card.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) &&
                        (scope === "all" ||
                            (scope === "pool" && item.poolQuantity > 0) ||
                            (scope === "decks" && item.assignedQuantity > 0) ||
                            (scope === "missing" && item.missingQuantity > 0))
                )
                .sort((a, b) => a.card.name.localeCompare(b.card.name));
            const pages = Math.max(1, Math.ceil(matches.length / 60));

            page = Math.min(page, pages);
            $("#tracking-count").textContent = `${matches.length} cartas · página ${page}/${pages}`;
            $("#tracking-items").innerHTML = matches.length
                ? matches
                      .slice((page - 1) * 60, page * 60)
                      .map(
                          (item) =>
                              `<article class="card-row">${CardImageUI.thumbnail(item.card)}<div class="card-description"><h3>${esc(item.card.name)}</h3><small>${item.ownedQuantity} cópias na coleção</small>${summary(item)}<div class="location-decks">${item.locations.map((place) => `<button class="text-button" data-open-tracked-deck="${place.deckId}">${esc(place.name)} · ${place.quantity}×</button>`).join("") || '<small class="detail-caption">Fora dos decks</small>'}</div></div><button class="secondary" data-track-card="${item.cardId}">Localizar / mover</button></article>`
                      )
                      .join("")
                : '<div class="empty"><h3>Nenhuma carta encontrada.</h3><p>Adicione cartas à coleção ou ajuste os filtros.</p></div>';
            $("#tracking-pages").innerHTML =
                `<button class="secondary" data-page-step="-1" ${page === 1 ? "disabled" : ""}>← Anterior</button><span>${page}/${pages}</span><button class="secondary" data-page-step="1" ${page === pages ? "disabled" : ""}>Próxima →</button>`;
            root.querySelectorAll("[data-page-step]").forEach(
                (button) =>
                    (button.onclick = () => {
                        page += Number(button.dataset.pageStep);
                        render();
                    })
            );
        }

        render();
    }

    function annotate(root) {
        root.querySelectorAll("[data-owned]").forEach((button) => {
            const id = button.dataset.owned,
                item = state.tracking?.find((entry) => entry.cardId === id),
                row = button.closest(".card-row");

            if (!row || row.querySelector("[data-track-card]")) {
                return;
            }

            row.querySelector(".card-description")?.insertAdjacentHTML("beforeend", summary(item));
            button.insertAdjacentHTML(
                "afterend",
                `<button class="secondary" data-track-card="${id}">Localizar / mover</button>`
            );
        });
    }

    function decorateDeck(root) {
        root.querySelectorAll("[data-edit-entry]").forEach((button) => {
            const id = button.dataset.editEntry,
                item = state.tracking?.find((entry) => entry.cardId === id);

            button.closest(".deck-entry-description").insertAdjacentHTML("beforeend", summary(item));
            button.parentElement.insertAdjacentHTML(
                "beforeend",
                `<button class="text-button" data-track-card="${id}">Localizar / mover</button>`
            );
        });
    }

    async function locate(cardId) {
        modal("Localização da carta", '<p class="detail-caption">Carregando localização…</p>');

        try {
            const item = await api(`/cards/${cardId}/locations`);

            modal(
                item.card.name,
                `<div class="location-card">${CardImageUI.thumbnail(item.card)}<div><strong>${item.ownedQuantity} na coleção</strong>${summary(item)}</div></div><h3>Onde está</h3><div class="detail-list"><div class="card-row"><span>Pool / bulk fora dos decks</span><strong>${item.poolQuantity}×</strong></div>${item.locations.map((place) => `<div class="card-row"><button class="text-button" data-open-tracked-deck="${place.deckId}">${esc(place.name)}</button><span>${place.quantity}× ${place.isCommander ? "· Comandante" : ""}</span></div>`).join("")}</div>${item.missingQuantity ? '<p class="error">Há mais cópias usadas nos decks do que registradas na coleção. Corrija o estoque ou a composição dos decks para eliminar a pendência.</p>' : ""}<div class="form-actions"><button class="secondary" id="card-location-history">Histórico da carta</button><button class="primary" id="card-location-move">Mover / substituir</button></div>`
            );

            $("#card-location-history").onclick = () => history(null, cardId);

            $("#card-location-move").onclick = () => movement(item);
        } catch (error) {
            notify(error.message);
        }
    }

    function movement(item) {
        const operationId = crypto.randomUUID();
        let approved = null,
            busy = false;

        modal(
            "Mover / substituir carta",
            `<form id="movement-form" class="form-grid"><strong>${esc(item.card.name)}</strong><label>Origem<select name="fromDeckId"><option value="">Pool (${item.poolQuantity} cópias livres)</option>${item.locations.map((place) => `<option value="${place.deckId}">${esc(place.name)} (${place.quantity}×)</option>`).join("")}</select></label><label>Destino<select name="toDeckId"><option value="">Pool</option>${state.decks.map((deck) => `<option value="${deck.id}">${esc(deck.name)}</option>`).join("")}</select></label><label>Quantidade<input name="quantity" type="number" min="1" max="2147483647" step="1" value="1" required></label><label>Substituir no destino (opcional)<select name="replaceCardId"><option value="">Apenas adicionar, sem substituir</option></select></label><label>Motivo / anotação<input name="note" maxlength="500" placeholder="Ex.: Troca de terreno na versão 1.1"></label><p class="detail-caption">Substituir retira a mesma quantidade da carta escolhida no destino e a devolve à pool, mantendo o tamanho do deck. Mover não altera o total da coleção.</p><p id="movement-error" class="error" role="alert"></p><button class="secondary" type="submit">Conferir movimentação</button><div id="movement-preview" aria-live="polite"></div><button class="primary" type="button" id="movement-confirm" disabled>Confirmar movimentação</button></form>`
        );

        const form = $("#movement-form"),
            confirm = $("#movement-confirm");

        if (!item.poolQuantity && item.locations.length) {
            form.elements.fromDeckId.value = item.locations[0].deckId;
        }

        function input() {
            return {
                cardId: item.cardId,
                operationId,
                quantity: Number(form.elements.quantity.value),
                fromDeckId: form.elements.fromDeckId.value || null,
                toDeckId: form.elements.toDeckId.value || null,
                replaceCardId: form.elements.replaceCardId.value || null,
                note: form.elements.note.value
            };
        }

        function invalidate() {
            approved = null;
            confirm.disabled = true;
            $("#movement-preview").innerHTML = "";
            $("#movement-error").textContent = "";
        }

        form.oninput = (event) => {
            if (event.target.id !== "movement-ack") {
                invalidate();
            }
        };

        form.elements.toDeckId.onchange = async () => {
            invalidate();

            const request = ++moveRequest,
                deckId = form.elements.toDeckId.value;

            form.elements.replaceCardId.innerHTML = '<option value="">Apenas adicionar, sem substituir</option>';

            if (!deckId) {
                return;
            }

            try {
                const deck = await api(`/decks/${deckId}`);

                if (!form.isConnected || request !== moveRequest) {
                    return;
                }

                form.elements.replaceCardId.innerHTML += [...deck.cards]
                    .filter((entry) => entry.cardId !== item.cardId)
                    .map(
                        (entry) =>
                            `<option value="${entry.cardId}">${esc(entry.card.name)} (${entry.quantity}×)</option>`
                    )
                    .join("");
            } catch (error) {
                if (form.isConnected) {
                    $("#movement-error").textContent = error.message;
                }
            }
        };

        form.onsubmit = async (event) => {
            event.preventDefault();

            if (busy) {
                return;
            }

            invalidate();
            busy = true;

            const payload = input(),
                submit = event.submitter;

            submit.disabled = true;

            try {
                const preview = await api("/tracking/move/preview", { method: "POST", body: payload });

                if (!form.isConnected) {
                    return;
                }

                approved = { payload, token: preview.previewToken };
                $("#movement-preview").innerHTML =
                    `<div class="import-summary"><strong>${payload.replaceCardId ? "Substituição" : "Movimentação"} de ${payload.quantity} cópia(s)</strong>${preview.totals.map((deck) => `<p>${esc(deck.name)}: ${deck.before} → <strong>${deck.after}</strong> cartas</p>`).join("")}<p>A quantidade total na coleção será mantida.</p></div>${preview.warnings.length ? `<div class="movement-warnings" role="alert">${preview.warnings.map((warning) => `<p>${esc(warning)}</p>`).join("")}</div><label class="check-option"><input type="checkbox" id="movement-ack"><span>Estou ciente dos novos totais e quero continuar.</span></label>` : ""}`;
                confirm.disabled = preview.warnings.length > 0;

                if ($("#movement-ack")) {
                    $("#movement-ack").onchange = (event) => (confirm.disabled = !event.target.checked);
                }
            } catch (error) {
                if (form.isConnected) {
                    $("#movement-error").textContent = error.message;
                }
            } finally {
                busy = false;
                submit.disabled = false;
            }
        };

        confirm.onclick = async () => {
            if (busy || !approved) {
                return;
            }
            if (JSON.stringify(input()) !== JSON.stringify(approved.payload)) {
                invalidate();

                return;
            }

            busy = true;
            confirm.disabled = true;

            try {
                await api("/tracking/move", {
                    method: "POST",
                    body: {
                        ...approved.payload,
                        previewToken: approved.token,
                        acknowledgeWarnings: Boolean($("#movement-ack")?.checked)
                    }
                });
                $("#modal").close();
                await refresh();
                notify("Movimentação registrada no histórico.");
            } catch (error) {
                if (form.isConnected) {
                    $("#movement-error").textContent = error.message;
                    confirm.disabled = false;
                }
            } finally {
                busy = false;
            }
        };
    }

    async function refresh() {
        await load();

        const match = location.hash.match(/^#deck\/([0-9a-f-]{36})$/i);

        if (match) {
            await openDeck(match[1]);
        }
    }

    function changesHtml(changes) {
        if (!changes) {
            return "";
        }

        return `${(changes.decks || []).map((deck) => `<div><strong>${esc(deck.name)}</strong><ul>${deck.cards.map((card) => `<li>${esc(card.name)}: ${card.before} → ${card.after}${card.commanderBefore !== card.commanderAfter ? ` · ${card.commanderAfter ? "marcado" : "desmarcado"} como comandante` : ""}</li>`).join("")}${deck.metadata.map((field) => `<li>${esc({ name: "Nome", format: "Formato", coverCardId: "Capa", powerLevel: "Power level" }[field.field] || field.field)}: ${esc(field.before ?? "—")} → ${esc(field.after ?? "—")}</li>`).join("")}</ul></div>`).join("")}${changes.collection?.length ? `<strong>Coleção</strong><ul>${changes.collection.map((card) => `<li>${esc(card.name)}: ${card.before} → ${card.after}</li>`).join("")}</ul>` : ""}`;
    }

    async function history(deckId = null, cardId = null, pageNumber = 1) {
        modal(deckId ? "Histórico e versões" : "Histórico de movimentações", "<p>Carregando histórico…</p>");

        try {
            const params = new URLSearchParams({ page: pageNumber });

            if (deckId) {
                params.set("deckId", deckId);
            }
            if (cardId) {
                params.set("cardId", cardId);
            }

            const [data, versions] = await Promise.all([
                api(`/history?${params}`),
                deckId ? api(`/decks/${deckId}/versions`) : Promise.resolve([])
            ]);

            modal(
                deckId ? "Histórico e versões" : "Histórico de movimentações",
                `${deckId ? `<div class="import-summary"><strong>${data.changeCount} alterações registradas neste deck</strong><p>O histórico começa com as operações desta atualização. Versões são retratos imutáveis; salvar uma tag não muda o deck.</p><button class="primary" id="save-version">Salvar versão</button></div><h3>Versões salvas</h3><div class="version-tags">${versions.map((version) => `<button class="secondary" data-version-id="${version.id}" data-version-deck="${deckId}">${esc(version.tag)} · ${version.totalQuantity} cartas</button>`).join("") || '<p class="detail-caption">Nenhuma versão salva.</p>'}</div>` : ""}<h3>Eventos (${data.total})</h3><div class="audit-timeline">${data.items.map((event) => `<details class="audit-event"><summary><strong>${esc(actions[event.action] || event.action)}${event.tag ? ` · ${esc(event.tag)}` : ""}</strong><small>${date(event.createdAt)} · ${event.id.slice(0, 8)}</small></summary>${event.note ? `<p>${esc(event.note)}</p>` : ""}${changesHtml(event.changes)}${event.versionId ? `<button class="secondary" data-version-id="${event.versionId}" data-version-deck="${event.deckIds[0]}">Ver versão salva</button>` : ""}</details>`).join("") || '<p class="detail-caption">Nenhum evento registrado ainda.</p>'}</div><div class="pagination"><button class="secondary" id="history-previous" ${pageNumber === 1 ? "disabled" : ""}>←</button><span>${pageNumber}/${Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button class="secondary" id="history-next" ${pageNumber * data.pageSize >= data.total ? "disabled" : ""}>→</button></div>`
            );

            if ($("#save-version")) {
                $("#save-version").onclick = () => saveVersion(deckId);
            }

            $("#history-previous").onclick = () => history(deckId, cardId, pageNumber - 1);

            $("#history-next").onclick = () => history(deckId, cardId, pageNumber + 1);
        } catch (error) {
            notify(error.message);
        }
    }

    function saveVersion(deckId) {
        modal(
            "Salvar versão do deck",
            `<form id="editor" class="form-grid"><label>Tag da versão<input name="tag" maxlength="40" placeholder="v1.0" required></label><label>Anotação<input name="note" maxlength="500" placeholder="Ex.: Lista antes da troca dos terrenos"></label><p class="detail-caption">Use letras, números, pontos, hífens ou sublinhados. A versão salva a lista completa, quantidades, comandantes e capa. Tags não são sobrescritas.</p><p id="form-error" class="error" role="alert"></p><button class="primary">Salvar versão</button></form>`
        );
        bindForm(async (input) => {
            await api(`/decks/${deckId}/versions`, { method: "POST", body: input });
            await history(deckId);
            notify("Versão salva.");
        });
    }

    async function version(deckId, id) {
        try {
            const data = await api(`/decks/${deckId}/versions/${id}`),
                cover =
                    data.snapshot.cards.find((card) => card.cardId === data.snapshot.coverCardId)?.name || "Sem capa";
            const metadata = (data.metadataChanges || [])
                .map(
                    (field) =>
                        `<li>${esc({ name: "Nome", format: "Formato", coverCardId: "Capa", powerLevel: "Power level" }[field.field] || field.field)}: ${esc(field.before ?? "—")} → ${esc(field.after ?? "—")}</li>`
                )
                .join("");

            modal(
                `Versão ${data.tag}`,
                `<p><strong>${esc(data.snapshot.name)}</strong> · ${date(data.createdAt)}</p><p class="detail-caption">${esc(data.snapshot.format)} · Capa: ${esc(cover)}</p><p class="detail-caption">${esc(data.note)} · ${data.changeCount} alterações registradas até esta versão</p>${!data.current ? '<p class="movement-warnings">O deck foi excluído; esta versão continua preservada.</p>' : ""}<h3>Diferenças para o deck atual</h3>${metadata ? `<ul>${metadata}</ul>` : ""}${data.changes.length ? `<ul>${data.changes.map((card) => `<li>${esc(card.name)}: ${card.before} → ${card.after}${card.commanderBefore !== card.commanderAfter ? " · marcação de comandante alterada" : ""}</li>`).join("")}</ul>` : '<p class="detail-caption">Mesmas cartas, quantidades e comandantes.</p>'}<h3>Lista salva (${data.snapshot.cards.reduce((sum, card) => sum + card.quantity, 0)} cópias)</h3><div class="import-table-wrap"><table class="import-table"><thead><tr><th>Qtd.</th><th>Carta</th></tr></thead><tbody>${data.snapshot.cards.map((card) => `<tr><td>${card.quantity}</td><td>${esc(card.name)}${card.isCommander ? " ♛" : ""}</td></tr>`).join("")}</tbody></table></div>`
            );
        } catch (error) {
            notify(error.message);
        }
    }

    document.addEventListener("click", (event) => {
        const track = event.target.closest("[data-track-card]"),
            deck = event.target.closest("[data-open-tracked-deck]"),
            versionButton = event.target.closest("[data-version-id]");

        if (track) {
            locate(track.dataset.trackCard);
        }
        if (deck) {
            leave();
            openDeck(deck.dataset.openTrackedDeck);
        }
        if (versionButton) {
            version(versionButton.dataset.versionDeck, versionButton.dataset.versionId);
        }
    });

    return { show, leave, annotate, decorateDeck, locate, history, saveVersion };
})();
