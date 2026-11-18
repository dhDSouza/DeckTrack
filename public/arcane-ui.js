window.ArcaneUI = (() => {
    const palette = {
        W: "#d8c492",
        U: "#66b8e8",
        B: "#b293d4",
        R: "#e38465",
        G: "#77ba91",
        C: "#a4adbd",
        M: "#c9a86a",
        "?": "#697489"
    };
    const colorNames = {
        W: "Branco",
        U: "Azul",
        B: "Preto",
        R: "Vermelho",
        G: "Verde",
        C: "Incolor",
        M: "Multicolor",
        "?": "Sem dados"
    };
    const actionNames = {
        "deck.created": "Deck criado",
        "deck.updated": "Deck atualizado",
        "deck.deleted": "Deck excluído",
        "deck.cards.updated": "Lista ajustada",
        "deck.imported": "Lista importada",
        "commander.changed": "Comando atualizado",
        "collection.updated": "Coleção atualizada",
        "cards.moved": "Cartas transferidas",
        "cards.replaced": "Cartas substituídas",
        "version.saved": "Versão salva"
    };
    let events = [];
    let historyError = false;
    let activityRequest = 0;
    const esc = (value) => escapeHtml(value);
    const count = (value) => Number(value || 0).toLocaleString("pt-BR");
    const date = (value) => new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

    function mana(colors = []) {
        colors = [...new Set(colors)].filter((color) => Object.hasOwn(palette, color) && color !== "?");
        return `<span class="mana-symbols" aria-label="${esc(colors.length ? colors.map((color) => colorNames[color] || color).join(", ") : "Incolor")}">${(colors.length ? colors : ["C"]).map((color) => `<span class="mana-orb mana-${color}" title="${esc(colorNames[color] || color)}">${color === "C" ? "◇" : color}</span>`).join("")}</span>`;
    }

    function summary(deck) {
        const cards = (state.tracking || []).flatMap((entry) => {
            const location = entry.locations.find((place) => place.deckId === deck.id);

            return location
                ? [
                      {
                          card: entry.card,
                          cardId: entry.cardId,
                          quantity: location.quantity,
                          ownedQuantity: entry.ownedQuantity,
                          isCommander: location.isCommander
                      }
                  ]
                : [];
        });
        const colors = [...new Set(cards.flatMap((entry) => entry.card.metadata?.colorIdentity || []))].filter(
            (color) => "WUBRG".includes(color)
        );
        const total = cards.reduce((sum, entry) => sum + entry.quantity, 0);
        const owned = cards.reduce((sum, entry) => sum + Math.min(entry.quantity, entry.ownedQuantity), 0);
        const cover = deck.coverCard || cards.find((entry) => entry.isCommander)?.card || cards[0]?.card;
        if (cover) {
            CardImageUI.register(cover);
        }
        const activity = events.find((event) => event.deckIds?.includes(deck.id));

        return {
            cards,
            colors,
            total,
            owned,
            cover,
            missing: total - owned,
            progress: total ? Math.round((owned / total) * 100) : 0,
            activity
        };
    }

    function identityStyle(colors) {
        const first = palette[colors[0]] || "#8b5cf6";
        const last = palette[colors[colors.length - 1]] || "#c084fc";

        return `--deck-accent:${first};--deck-accent-end:${last}`;
    }

    function tile(deck) {
        const info = summary(deck);

        return `<button class="deck-card" data-deck="${esc(deck.id)}" style="${identityStyle(info.colors)}">
            <div class="deck-art ${info.cover ? "has-cover" : ""}">${info.cover ? CardImageUI.art(info.cover) : '<span class="empty-deck-sigil">✧</span>'}<span class="deck-art-format">${esc(formats[deck.format] || deck.format)}</span></div>
            <div class="deck-info"><div class="deck-title-row"><h3>${esc(deck.name)}</h3>${mana(info.colors)}</div>
                <p class="deck-tile-meta">${count(info.total)} cartas${deck.format === "commander" ? " / 100" : ""} <span>${info.activity ? date(info.activity.createdAt) : "Sem atividade recente"}</span></p>
                <div class="deck-progress-label"><span>${info.total ? `${count(info.owned)} / ${count(info.total)} na coleção` : "Uma estratégia por descobrir"}</span><strong>${info.progress}%</strong></div>
                <progress max="100" value="${info.progress}" aria-label="Conclusão física de ${esc(deck.name)}"></progress>
                <div class="deck-bottom"><span class="${info.missing ? "status-missing" : "status-owned"}">${info.missing ? `${count(info.missing)} cópias faltantes` : info.total ? "Todas as cópias disponíveis" : "Deck vazio"}</span><b>Abrir grimório ↗</b></div>
            </div></button>`;
    }

    function bindDecks(root) {
        root.querySelectorAll("[data-deck]").forEach((button) => {
            button.onclick = () => openDeck(button.dataset.deck).catch((error) => notify(error.message));
        });
    }

    function refresh() {
        const root = $("#sidebar-decks");

        root.innerHTML =
            Object.entries(formats)
                .map(([key, label]) => {
                    const decks = state.decks.filter((deck) => deck.format === key);

                    return decks.length
                        ? `<details class="sidebar-deck-group" open><summary>${esc(label)} <span>${decks.length}</span></summary>${decks
                              .map((deck) => {
                                  const info = summary(deck);

                                  return `<button class="sidebar-deck" data-deck="${esc(deck.id)}" title="${esc(deck.name)}">${info.cover ? `<img src="${esc(CardImageUI.url(info.cover.id, "art_crop"))}" alt="" loading="lazy" />` : '<span class="sidebar-deck-placeholder">✧</span>'}<span>${esc(deck.name)}</span></button>`;
                              })
                              .join("")}</details>`
                        : "";
                })
                .join("") || '<p class="sidebar-empty">Sua próxima estratégia começa aqui.</p>';
        bindDecks(root);

        const featured = state.decks.map((deck) => summary(deck).cover).find(Boolean);
        if (featured) {
            CardImageUI.register(featured);
            document.documentElement.style.setProperty(
                "--header-art",
                `url("${CardImageUI.url(featured.id, "art_crop")}")`
            );
        } else {
            document.documentElement.style.removeProperty("--header-art");
        }
    }

    async function refreshActivity() {
        const request = ++activityRequest;

        try {
            const result = await api("/history?pageSize=100");
            if (request !== activityRequest || !state.user) {
                return;
            }
            events = result.items;
            historyError = false;
        } catch {
            if (request !== activityRequest || !state.user) {
                return;
            }
            events = [];
            historyError = true;
        }
        refresh();
        if (["dashboard", "analytics"].includes(state.page)) {
            show(state.page);
        } else if (state.page === "decks" && !location.hash.startsWith("#deck/")) {
            render();
        }
    }

    function leave() {
        const root = $("#overview-page");
        if (root) {
            root.hidden = true;
        }
    }

    function reset() {
        ++activityRequest;
        events = [];
        historyError = false;
        leave();
        $("#sidebar-decks").innerHTML = "";
        document.documentElement.style.removeProperty("--header-art");
    }

    function activityMarkup() {
        return events.length
            ? events
                  .slice(0, 6)
                  .map(
                      (event) =>
                          `<button class="activity-row" data-event="${esc(event.id)}"><span class="activity-icon">${event.action === "version.saved" ? "⚑" : "◇"}</span><span><strong>${esc(actionNames[event.action] || "Alteração registrada")}</strong><small>${esc(event.note || "Movimento registrado no seu histórico")}</small></span><time datetime="${esc(event.createdAt)}">${date(event.createdAt)}</time></button>`
                  )
                  .join("")
            : `<div class="small-empty">${historyError ? 'Não foi possível carregar as atividades. <button class="text-button" id="retry-activity">Tentar novamente</button>' : "Cada mudança conta uma história. Suas próximas ações aparecerão aqui."}</div>`;
    }

    function show(page = "dashboard") {
        $(".content").hidden = true;
        let root = $("#overview-page");
        if (!root) {
            root = document.createElement("section");
            root.id = "overview-page";
            root.className = "content overview-page";
            $("main").append(root);
        }
        root.hidden = false;
        const decks = state.decks.map((deck) => ({ ...deck, info: summary(deck) }));
        const owned = state.collection.reduce((sum, item) => sum + item.quantity, 0);
        const pool = (state.tracking || []).reduce((sum, item) => sum + item.poolQuantity, 0);
        const complete = decks.filter((deck) => deck.info.total > 0 && !deck.info.missing).length;
        const missing = (state.tracking || []).reduce((sum, item) => sum + item.missingQuantity, 0);
        const distribution = new Map(Object.keys(colorNames).map((key) => [key, 0]));
        state.collection.forEach((item) => {
            const colors = item.card.metadata?.colors;
            const key = !Array.isArray(colors) ? "?" : colors.length > 1 ? "M" : colors[0] || "C";
            distribution.set(key, (distribution.get(key) || 0) + item.quantity);
        });
        const recent = [...decks]
            .sort((a, b) => (b.info.activity?.createdAt || "").localeCompare(a.info.activity?.createdAt || ""))
            .slice(0, page === "analytics" ? decks.length : 3);
        root.classList.toggle("analytics-view", page === "analytics");
        root.innerHTML = `<div class="page-heading"><div><span class="eyebrow">SEU ARQUIVO ARCANO</span><h1>${page === "analytics" ? "Estatísticas do acervo" : "Seu próximo capítulo"}</h1><p>${page === "analytics" ? "Cada cópia, cada cor, cada estratégia. Os números da sua coleção." : `Boas-vindas, ${esc(state.user.username)}. Prepare suas próximas jogadas.`}</p></div><button class="primary" id="overview-create">+ Novo deck</button></div>
            <section class="overview-hero"><div><span class="eyebrow">COLECIONE. CONSTRUA. EVOLUA.</span><h2>Grandes estratégias.<br />Cada carta no seu lugar.</h2><p>Do primeiro terreno à última mudança no deck.<br />Seu grimório está sempre em construção.</p><button class="secondary" id="overview-decks">Explorar meus decks ↗</button></div><div class="hero-sigil" aria-hidden="true"><img src="/arcane-mark.svg" alt="" /><span>SEU GRIMÓRIO DIGITAL</span></div></section>
            <div class="overview-metrics"><article><span>▱</span><small>Meus decks</small><strong>${count(decks.length)}</strong><p>${complete} com todas as cópias disponíveis</p></article><article><span>▤</span><small>Cartas físicas</small><strong>${count(owned)}</strong><p>${count(state.collection.length)} cartas diferentes</p></article><article><span>◇</span><small>Livres na pool</small><strong>${count(pool)}</strong><p>Prontas para novas estratégias</p></article><article><span>⚑</span><small>Cópias faltantes</small><strong>${count(missing)}</strong><p>${decks.length - complete} decks vazios ou com faltas</p></article></div>
            <div class="section-heading"><h2>${page === "analytics" ? "Conclusão física dos decks" : "Seus grimórios"}</h2><button class="text-button" id="overview-all">Ver todos ↗</button></div>
            <div class="items overview-decks">${recent.map(tile).join("") || '<div class="empty"><span>✧</span><h3>A primeira página está em branco.</h3><p>Crie um deck para começar sua coleção de estratégias.</p></div>'}</div>
            <div class="overview-panels"><section class="arcane-panel"><div class="section-heading"><h2>Cores do acervo</h2><small>${count(owned)} cópias</small></div><div class="collection-colors">${
                [...distribution]
                    .filter(([, amount]) => amount)
                    .map(
                        ([key, amount]) =>
                            `<div class="collection-color-row"><span style="--mana-color:${palette[key]}">${esc(colorNames[key])}</span><progress max="${Math.max(1, owned)}" value="${amount}" aria-label="${esc(colorNames[key])}: ${amount} cópias" style="--progress-color:${palette[key]}"></progress><strong>${count(amount)}</strong></div>`
                    )
                    .join("") || '<p class="small-empty">Adicione cartas à coleção para descobrir suas cores.</p>'
            }</div><p class="detail-caption">Cor da carta, incluindo terrenos. Multicolor conta uma vez; cartas sem metadados aparecem separadamente.</p></section><section class="arcane-panel"><div class="section-heading"><h2>Últimas atividades</h2><button class="text-button" id="overview-history">Histórico ↗</button></div>${activityMarkup()}</section></div>`;
        bindDecks(root);
        $("#overview-create").onclick = () => {
            navigate("decks");
            create();
        };
        $("#overview-decks").onclick = $("#overview-all").onclick = () => navigate("decks");
        $("#overview-history").onclick = () => TrackingUI.history();
        root.querySelectorAll("[data-event]").forEach((button) => {
            button.onclick = () => TrackingUI.history();
        });
        if ($("#retry-activity")) {
            $("#retry-activity").onclick = refreshActivity;
        }
        document
            .querySelectorAll("[data-page]")
            .forEach((button) => button.classList.toggle("active", button.dataset.page === page));
    }

    function preferences() {
        modal(
            "Seu espaço de jogo",
            `<form id="appearance-preferences" class="form-grid"><p class="detail-caption">Preferências salvas apenas neste navegador.</p><label class="check-option"><input name="compact" type="checkbox" ${document.body.classList.contains("sidebar-collapsed") ? "checked" : ""} /><span>Menu lateral compacto</span></label><label class="check-option"><input name="motion" type="checkbox" ${document.body.classList.contains("reduce-motion") ? "checked" : ""} /><span>Reduzir animações</span></label><button class="primary">Salvar preferências</button></form>`
        );
        $("#appearance-preferences").onsubmit = (event) => {
            event.preventDefault();
            setCollapsed(event.target.elements.compact.checked);
            document.body.classList.toggle("reduce-motion", event.target.elements.motion.checked);
            localStorage.setItem("decktrack-reduce-motion", String(event.target.elements.motion.checked));
            $("#modal").close();
            notify("Seu espaço foi atualizado.");
        };
        $("#appearance-preferences").insertAdjacentHTML(
            "beforeend",
            `<div class="preferences-account"><span>Conectado como <strong>${esc(state.user.username)}</strong></span><button type="button" class="text-button" id="preferences-logout">Sair da conta ↗</button></div>`
        );
        $("#preferences-logout").onclick = () => $("#logout").click();
    }

    function setCollapsed(value) {
        document.body.classList.toggle("sidebar-collapsed", value);
        localStorage.setItem("decktrack-sidebar-collapsed", String(value));
        $("#sidebar-toggle").setAttribute("aria-expanded", String(!value));
        $("#sidebar-toggle").setAttribute("aria-label", value ? "Expandir menu" : "Recolher menu");
        $("#sidebar-toggle").title = value ? "Expandir menu" : "Recolher menu";
    }

    function mountDeck(root, deck, onDetails) {
        const stats = DeckStats.compute(deck);
        const owned = deck.cards.reduce((sum, item) => sum + Math.min(item.quantity, item.ownedQuantity), 0);
        const total = stats.total;
        const progress = total ? Math.round((owned / total) * 100) : 0;
        const featured =
            deck.cards.find((item) => item.isCommander) ||
            deck.cards.find((item) => item.cardId === deck.coverCardId) ||
            deck.cards[0];
        const colors = [...new Set(deck.cards.flatMap((item) => item.card.metadata?.colorIdentity || []))];
        root.setAttribute("style", identityStyle(colors));
        const tableRows = DeckPage.group(deck.cards, deck.format)
            .map(
                (group) =>
                    `<tr class="compact-group-heading" data-table-group="${esc(group.key)}"><th colspan="4" scope="rowgroup">${esc(group.label)}</th></tr>${group.cards.map((item) => `<tr data-row-card="${esc(item.cardId)}" data-row-group="${esc(group.key)}"><td>${item.quantity}</td><td><button type="button" data-preview-card="${esc(item.cardId)}">${item.isCommander ? '<span class="command-star" aria-label="Comandante">♛</span> ' : ""}${esc(item.card.name)}</button></td><td>${esc(item.card.metadata?.manaCost || "—")}</td><td>${esc(item.card.metadata?.type || "Sem tipo cadastrado")}</td></tr>`).join("")}`
            )
            .join("");
        const maximum = Math.max(1, ...stats.curve.map((bucket) => bucket.copies));
        root.querySelector(".page-heading").insertAdjacentHTML(
            "afterend",
            `<div class="deck-command-center">
            <section class="commander-preview arcane-panel"><div class="panel-eyebrow">${featured?.isCommander ? "ZONA DE COMANDO" : "CARTA EM DESTAQUE"}</div><div id="command-preview-image">${featured ? CardImageUI.thumbnail(featured.card, "normal") : '<div class="empty"><span>✧</span><p>Adicione sua primeira carta.</p></div>'}</div><p id="command-preview-name">${esc(featured?.card.name || "Um grimório por escrever")}</p><small>Passe pela lista para pré-visualizar</small></section>
            <section class="decklist-panel arcane-panel"><div class="section-heading"><h2>Lista do deck <span>(${total})</span></h2>${mana(colors)}</div><label class="compact-list-search"><span class="sr-only">Buscar na lista completa do deck</span><input id="compact-deck-search" type="search" maxlength="200" placeholder="Buscar na lista do deck…" /></label><div class="compact-deck-scroll"><table class="compact-deck-table"><thead><tr><th scope="col">Qtd.</th><th scope="col">Carta</th><th scope="col">Mana</th><th scope="col">Tipo</th></tr></thead><tbody>${tableRows || '<tr><td colspan="4">Sua próxima estratégia começa aqui.</td></tr>'}</tbody></table></div></section>
            <aside class="deck-glance arcane-panel"><h2>Estatísticas</h2><dl><div><dt>Total de cartas</dt><dd>${total}</dd></div><div><dt>Terrenos</dt><dd>${stats.lands}</dd></div><div><dt>Não terrenos</dt><dd>${total - stats.lands}</dd></div><div><dt>Valor de mana médio</dt><dd>${stats.averageMana == null ? "—" : Number(stats.averageMana).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</dd></div></dl><h3>Identidade de cores</h3>${mana(colors)}<h3>Curva de mana</h3><div class="mini-mana-curve" role="img" aria-label="Curva de mana do deck">${stats.curve.map((bucket) => `<div title="Mana ${bucket.label}: ${bucket.copies} cópias"><strong>${bucket.copies}</strong><span style="--bar-height:${Math.round((bucket.copies / maximum) * 100)}%"></span><small>${esc(bucket.label)}</small></div>`).join("")}</div><p class="detail-caption">Sem terrenos. Mais detalhes na análise completa abaixo.</p></aside>
        </div><section class="deck-ownership-strip"><span>▤ &nbsp; Coleção no deck</span><strong>${owned} / ${total} <small>cópias disponíveis (${progress}%)</small></strong><progress max="100" value="${progress}" aria-label="Conclusão física do deck"></progress><span class="${owned < total ? "status-missing" : "status-owned"}">${total - owned} faltantes</span><button class="secondary" id="deck-view-missing">Localizar cartas</button></section>`
        );
        $("#compact-deck-search").oninput = (event) => {
            const query = event.target.value.trim().toLocaleLowerCase("pt-BR");
            const rows = [...root.querySelectorAll("[data-row-card]")];

            rows.forEach((row) => {
                row.hidden = !row.textContent.toLocaleLowerCase("pt-BR").includes(query);
            });
            root.querySelectorAll("[data-table-group]").forEach((heading) => {
                heading.hidden = !rows.some(
                    (row) => !row.hidden && row.dataset.rowGroup === heading.dataset.tableGroup
                );
            });
        };
        root.querySelectorAll("[data-preview-card]").forEach((button) => {
            const item = deck.cards.find((entry) => entry.cardId === button.dataset.previewCard);
            const preview = () => {
                $("#command-preview-image").innerHTML = CardImageUI.thumbnail(item.card, "normal");
                $("#command-preview-name").textContent = item.card.name;
            };
            button.onpointerenter = preview;
            button.onfocus = preview;
            button.onclick = () => onDetails(item);
        });
        $("#deck-view-missing").onclick = () => navigate("tracking");
        const statistics = root.querySelector(".deck-statistics");
        if (statistics) {
            statistics.open = false;
            const analysisButton = document.createElement("button");
            analysisButton.type = "button";
            analysisButton.className = "text-button";
            analysisButton.textContent = "Abrir análise completa ↗";
            analysisButton.onclick = () => {
                statistics.open = true;
                statistics.scrollIntoView({ behavior: "smooth", block: "start" });
            };
            root.querySelector(".deck-glance").append(analysisButton);
        }
        const groups = root.querySelector("#deck-page-groups");
        const commanders = root.querySelector(".commander-overview");
        if (commanders) {
            groups.insertAdjacentElement("afterend", commanders);
        }
        const analysis = root.querySelector("#deck-statistics");
        if (analysis) {
            root.append(analysis);
        }
        document
            .querySelectorAll(".sidebar-deck")
            .forEach((button) => button.classList.toggle("is-current", button.dataset.deck === deck.id));
    }

    function init() {
        setCollapsed(localStorage.getItem("decktrack-sidebar-collapsed") === "true");
        document.body.classList.toggle("reduce-motion", localStorage.getItem("decktrack-reduce-motion") === "true");
        $("#sidebar-toggle").onclick = () => setCollapsed(!document.body.classList.contains("sidebar-collapsed"));
        $("#sidebar-create").onclick = () => {
            navigate("decks");
            create();
        };
        $("#preferences").onclick = preferences;
        $("#recent-activity").onclick = () => TrackingUI.history();
        $(".topbar-brand").onclick = (event) => {
            event.preventDefault();
            navigate("dashboard");
        };
        $("#global-search").onsubmit = (event) => {
            event.preventDefault();
            const term = event.target.elements.q.value.trim();
            navigate("catalog", term);
        };
        document.addEventListener("keydown", (event) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k" &&
                state.user &&
                !$("#modal").open
            ) {
                event.preventDefault();
                $("#global-search input").focus();
            }
        });
    }

    return { init, refresh, refreshActivity, leave, reset, show, summary, tile, mana, identityStyle, mountDeck };
})();
