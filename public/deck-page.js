window.DeckPage = (() => {
    const categories = [
        ["commanders", "Comandantes"],
        ["Land", "Terrenos"],
        ["Creature", "Criaturas"],
        ["Instant", "Mágicas instantâneas"],
        ["Sorcery", "Feitiços"],
        ["Artifact", "Artefatos"],
        ["Enchantment", "Encantamentos"],
        ["Planeswalker", "Planeswalkers"],
        ["Battle", "Batalhas"],
        ["other", "Outras cartas"]
    ];
    let generation = 0,
        filterRequest = 0,
        activeId = null,
        layout = localStorage.getItem("decktrack-deck-layout") === "list" ? "list" : "grid",
        filters = {};

    function category(item, format) {
        if (format === "commander" && item.isCommander) {
            return "commanders";
        }

        const types = item.card.metadata?.types || [];

        return categories.slice(1, -1).find(([key]) => types.includes(key))?.[0] || "other";
    }

    function group(cards, format) {
        return categories
            .map(([key, label]) => ({ key, label, cards: cards.filter((card) => category(card, format) === key) }))
            .filter((group) => group.cards.length);
    }

    function leave() {
        ++generation;
        ++filterRequest;
        activeId = null;

        const root = document.querySelector("#deck-page");

        if (root) {
            root.hidden = true;
        }

        document.querySelector(".content").hidden = false;
    }

    async function open(id) {
        window.ArcaneUI?.leave();
        const current = ++generation;

        ++filterRequest;

        if (activeId !== id) {
            filters = {};
        }

        activeId = id;
        state.page = "decks";

        if (window.TrackingUI) {
            TrackingUI.leave();
        }

        $("#modal").close();
        $(".content").hidden = true;

        let root = $("#deck-page");

        if (!root) {
            root = document.createElement("section");
            root.id = "deck-page";
            root.className = "content deck-page";
            $("main").append(root);
        }

        root.hidden = false;
        root.innerHTML = '<div class="empty"><p>Carregando seu deck…</p></div>';

        if (location.hash !== `#deck/${id}`) {
            history.pushState({}, "", `#deck/${id}`);
        }

        document
            .querySelectorAll("[data-page]")
            .forEach((button) => button.classList.toggle("active", button.dataset.page === "decks"));

        try {
            const deck = await api(`/decks/${id}`);

            if (current !== generation) {
                return;
            }

            const total = deck.cards.reduce((sum, item) => sum + item.quantity, 0),
                commanders = deck.format === "commander" ? deck.cards.filter((item) => item.isCommander) : [];
            const owned = deck.cards.reduce((sum, item) => sum + Math.min(item.quantity, item.ownedQuantity), 0);

            root.innerHTML = `<button type="button" class="text-button deck-back">← Meus decks</button><div class="page-heading"><div><span class="eyebrow">${escapeHtml(formats[deck.format])} · SUA ESTRATÉGIA NA MESA</span><h1>${escapeHtml(deck.name)}<span>.</span></h1><p>${total} cópias · ${deck.cards.length} cartas diferentes · ${owned} cópias disponíveis na coleção</p></div><div class="deck-page-actions"><button class="secondary" id="deck-page-edit">Editar deck</button><button class="secondary" id="deck-page-import">Importar lista</button><button class="primary" id="deck-page-add">+ Adicionar carta</button></div></div>${CardImageUI.hero(deck.coverCard)}${deck.format === "commander" ? `<section class="commander-overview"><div><span class="eyebrow">ZONA DE COMANDO</span><h2>${commanders.length ? commanders.map((item) => escapeHtml(item.card.name)).join(" + ") : "Escolha seus comandantes"}</h2><p>Use “Marcar comandante” nas cartas abaixo. Você pode marcar mais de uma carta, incluindo parceiros e Background. A seleção não valida a legalidade da combinação.</p></div><span class="commander-counter">${commanders.length} ${commanders.length === 1 ? "comandante" : "comandantes"}</span></section>` : ""}<div class="deck-display-toolbar"><h2>Cartas por categoria</h2><div role="group" aria-label="Modo de visualização"><button class="secondary" data-layout="grid" aria-pressed="${layout === "grid"}">▦ Grade</button><button class="secondary" data-layout="list" aria-pressed="${layout === "list"}">☷ Lista detalhada</button></div></div><div id="deck-page-filters"></div><p id="deck-page-count" class="detail-caption"></p><div id="deck-page-groups" aria-live="polite"></div>`;
            root.querySelector(".page-heading p").textContent =
                `${total} cópias · ${deck.cards.length} cartas diferentes`;

            root.querySelector(".deck-back").onclick = () => document.querySelector('[data-page="decks"]').click();

            $("#deck-page-edit").onclick = () => openDeckEditor(id).catch((error) => notify(error.message));

            $("#deck-page-add").onclick = async () => {
                try {
                    await openDeckEditor(id);
                    $("#deck-card-search")?.focus();
                    $("#deck-card-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                } catch (error) {
                    notify(error.message);
                }
            };

            $("#deck-page-import").onclick = () => openListImport(id);

            $("#deck-page-import").insertAdjacentHTML(
                "beforebegin",
                '<button class="secondary" id="deck-page-history">Histórico e versões</button>'
            );

            $("#deck-page-history").onclick = () => TrackingUI.history(id);

            root.querySelector(".deck-display-toolbar").insertAdjacentHTML(
                "beforebegin",
                '<div id="deck-statistics"></div>'
            );
            DeckStats.mount($("#deck-statistics"), deck, {
                request: api,
                onSaved: (saved) => {
                    const entry = state.decks.find((item) => item.id === saved.id);
                    if (entry) {
                        entry.powerLevel = saved.powerLevel;
                    }
                }
            });

            if (deck.format === "commander" && total !== 100) {
                $("#deck-page-filters").insertAdjacentHTML(
                    "beforebegin",
                    `<p class="movement-warnings" role="status">Este deck tem ${total}/100 cartas: ${total < 100 ? `faltam ${100 - total}` : `há ${total - 100} acima do total`}.</p>`
                );
            }

            let visible = deck.cards;

            function entryDescription(item) {
                return `<div class="deck-entry-description">
                    <h3>${escapeHtml(item.card.name)}</h3>
                    ${CardFilterUI.summary(item.card)}
                    <p class="detail-caption">${item.quantity} no deck · ${item.ownedQuantity} na coleção${item.quantity > item.ownedQuantity ? ` · faltam ${item.quantity - item.ownedQuantity}` : ""}</p>
                    ${CardFilterUI.details(item.card)}
                    <div class="deck-entry-actions">
                        <button class="secondary" data-edit-entry="${item.cardId}">Editar quantidade</button>
                        ${deck.format === "commander" ? `<button class="${item.isCommander ? "commander-selected" : "secondary"}" data-commander="${item.cardId}" aria-pressed="${Boolean(item.isCommander)}">${item.isCommander ? "♛ Remover comandante" : "♛ Marcar comandante"}</button>` : ""}
                        <button class="text-button" data-cover-entry="${item.cardId}">${deck.coverCardId === item.cardId ? "✓ Capa atual" : "Usar como capa"}</button>
                    </div>
                </div>`;
            }

            function bindEntryActions(target) {
                target.querySelectorAll("[data-edit-entry]").forEach((button) => {
                    button.onclick = () =>
                        editQuantity(
                            deck,
                            deck.cards.find((item) => item.cardId === button.dataset.editEntry)
                        );
                });
                target.querySelectorAll("[data-cover-entry]").forEach((button) => {
                    button.onclick = async () => {
                        button.disabled = true;

                        try {
                            await api(`/decks/${id}`, {
                                method: "PATCH",
                                body: { coverCardId: button.dataset.coverEntry }
                            });
                            await load();
                            await open(id);
                        } catch (error) {
                            notify(error.message);
                            button.disabled = false;
                        }
                    };
                });
                target.querySelectorAll("[data-commander]").forEach((button) => {
                    button.onclick = async () => {
                        button.disabled = true;

                        const item = deck.cards.find((entry) => entry.cardId === button.dataset.commander);

                        try {
                            await api(`/decks/${id}/cards/${item.cardId}/commander`, {
                                method: "PUT",
                                body: { isCommander: !item.isCommander }
                            });
                            await open(id);
                        } catch (error) {
                            notify(error.message);
                            button.disabled = false;
                        }
                    };
                });

                if (window.TrackingUI) {
                    TrackingUI.decorateDeck(target);
                }
            }

            function showCardDetails(item) {
                modal(
                    item.card.name,
                    `<div class="deck-card-details-modal">
                        <div class="deck-card-detail-image">${CardImageUI.thumbnail(item.card, "normal")}</div>
                        ${entryDescription(item)}
                    </div>`
                );
                bindEntryActions($("#modal-body"));
            }

            function renderEntry(item) {
                const isCommander = item.isCommander && deck.format === "commander";
                const image =
                    layout === "grid"
                        ? CardImageUI.thumbnail(item.card, "normal", "details")
                        : CardImageUI.thumbnail(item.card, "small");

                return `<article class="deck-card-entry ${isCommander ? "commander-entry" : ""}">
                    <div class="deck-card-picture">
                        ${image}
                        <span class="deck-quantity-badge">${item.quantity}×</span>
                        ${isCommander ? '<span class="commander-badge">♛ Comandante</span>' : ""}
                    </div>
                    ${layout === "list" ? entryDescription(item) : ""}
                </article>`;
            }

            function renderCards() {
                const groups = group(visible, deck.format);
                const target = $("#deck-page-groups");

                $("#deck-page-count").textContent =
                    `${visible.length} de ${deck.cards.length} cartas diferentes · ${visible.reduce((sum, item) => sum + item.quantity, 0)} cópias exibidas`;
                target.innerHTML = groups.length
                    ? groups
                          .map(
                              (
                                  section
                              ) => `<section class="deck-category ${section.key === "commanders" ? "commanders-category" : ""}">
                        <div class="category-heading">
                            <h2>${section.key === "commanders" ? "♛ " : ""}${section.label}</h2>
                            <span>${section.cards.reduce((sum, item) => sum + item.quantity, 0)} cópias · ${section.cards.length} cartas</span>
                        </div>
                        <div class="${layout === "grid" ? "deck-card-grid" : "deck-detailed-list"}">${section.cards.map(renderEntry).join("")}</div>
                    </section>`
                          )
                          .join("")
                    : `<div class="empty"><span>▧</span><h3>${deck.cards.length ? "Nenhuma carta corresponde aos filtros." : "Seu deck começa com uma carta."}</h3><p>${deck.cards.length ? "Limpe ou ajuste os filtros para ver outras cartas." : "Adicione cartas individualmente ou importe sua lista completa."}</p></div>`;

                target.querySelectorAll("[data-card-details]").forEach((button) => {
                    button.onclick = () => {
                        const item = deck.cards.find((entry) => entry.card.id === button.dataset.cardDetails);

                        if (item) {
                            showCardDetails(item);
                        }
                    };
                });
                bindEntryActions(target);
            }

            async function applyFilters(values) {
                filters = values;

                const request = ++filterRequest;
                const target = $("#deck-page-groups");

                target.innerHTML = '<div class="empty"><p>Filtrando cartas…</p></div>';

                try {
                    const ids = new Set();
                    let page = 1,
                        total = 0;

                    do {
                        const result = await api(
                            `/cards?${new URLSearchParams({ ...values, deckId: id, pageSize: 100, page })}`
                        );

                        if (current !== generation || request !== filterRequest) {
                            return;
                        }

                        result.items.forEach((card) => ids.add(card.id));
                        total = result.total;
                        page++;

                        if (!result.items.length) {
                            break;
                        }
                    } while (ids.size < total);
                    visible = deck.cards.filter((item) => ids.has(item.cardId));
                    renderCards();
                } catch (error) {
                    if (current === generation && request === filterRequest) {
                        target.innerHTML = `<p class="error">${escapeHtml(error.message)}</p><button type="button" class="secondary">Tentar novamente</button>`;

                        target.querySelector("button").onclick = () => applyFilters(values);
                    }
                }
            }

            CardFilterUI.mount($("#deck-page-filters"), {
                request: api,
                includeName: true,
                initial: filters,
                onApply: applyFilters
            });
            root.querySelectorAll("[data-layout]").forEach(
                (button) =>
                    (button.onclick = () => {
                        layout = button.dataset.layout;
                        localStorage.setItem("decktrack-deck-layout", layout);
                        root.querySelectorAll("[data-layout]").forEach((option) =>
                            option.setAttribute("aria-pressed", String(option.dataset.layout === layout))
                        );
                        renderCards();
                    })
            );
            renderCards();

            window.ArcaneUI?.mountDeck(root, deck, showCardDetails);

            if (Object.entries(filters).some(([key, value]) => !["colorMode", "colorField"].includes(key) && value)) {
                applyFilters(filters);
            }
        } catch (error) {
            if (current !== generation) {
                return;
            }

            root.innerHTML = `<button class="text-button deck-back">← Meus decks</button><div class="empty"><h3>Não foi possível abrir o deck.</h3><p>${escapeHtml(error.message)}</p><button class="primary" id="deck-retry">Tentar novamente</button></div>`;

            root.querySelector(".deck-back").onclick = () => document.querySelector('[data-page="decks"]').click();

            $("#deck-retry").onclick = () => open(id);
        }
    }

    function editQuantity(deck, item) {
        modal(
            "Editar quantidade",
            `<form id="editor" class="form-grid"><strong>${escapeHtml(item.card.name)}</strong><label>Quantidade no deck<input name="quantity" type="number" min="0" max="2147483647" required value="${item.quantity}"></label><label class="check-option"><input type="checkbox" name="registerOwned"><span>Já possuo estas cópias: registrar na coleção</span></label><p class="detail-caption">Zero remove a carta do deck. Remover não diminui sua coleção.</p><p id="form-error" class="error" role="alert"></p><button class="primary">Salvar quantidade</button></form>`
        );
        bindForm(async (input) => {
            await api(`/decks/${deck.id}/cards/${item.cardId}`, {
                method: "PUT",
                body: { quantity: Number(input.quantity), registerOwned: input.registerOwned === "on" }
            });
            await load();
            await open(deck.id);
            notify("Quantidade atualizada.");
        });
    }

    return { open, leave, group, category };
})();
