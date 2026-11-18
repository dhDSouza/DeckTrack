const $ = (s) => document.querySelector(s);
const formats = { commander: "Commander", pauper: "Pauper", standard: "Standard", free: "Livre" };
const state = {
    token: sessionStorage.getItem("decktrack-token"),
    user: null,
    decks: [],
    collection: [],
    cards: [],
    page: "dashboard",
    format: "all",
    query: "",
    register: false,
    catalogPage: 1,
    catalogTotal: 0,
    catalogLoading: false,
    catalogError: ""
};

state.advanced = {};

const escapeHtml = (value) =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
let toastTimer;
let searchTimer,
    catalogRequest = 0;

function notify(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 4500);
}

function logout() {
    ArcaneUI.reset();
    DeckPage.leave();
    TrackingUI.leave();
    state.token = null;
    state.user = null;
    sessionStorage.removeItem("decktrack-token");
    $("#modal").close();
    $("#workspace").hidden = true;
    $("#auth").hidden = false;
    $("#auth-form").reset();
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
            ...options.headers
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const data = response.status === 204 ? null : await response.json();

    if (!response.ok) {
        if (response.status === 401 && state.user) {
            logout();
            notify("Sua sessão expirou. Entre novamente.");
        }

        throw new Error(data?.message || "Não foi possível concluir a operação.");
    }

    return data;
}

async function load() {
    const [decks, collection, tracking] = await Promise.all([api("/decks"), api("/collection"), api("/tracking")]);

    Object.assign(state, { decks, collection, tracking });
    ArcaneUI.refresh();
    ArcaneUI.refreshActivity();
    $("#stat-decks").textContent = decks.length;
    $("#stat-owned").textContent = collection.reduce((sum, item) => sum + item.quantity, 0).toLocaleString("pt-BR");
    $("#stat-unique").textContent = collection.length;

    if (["dashboard", "analytics"].includes(state.page)) {
        ArcaneUI.show(state.page);
    } else if (["tracking", "pool"].includes(state.page)) {
        TrackingUI.show(state.page === "pool" ? "pool" : undefined);
    } else if (state.page !== "decks") {
        await loadCatalog();
    } else {
        render();
    }
}

async function loadCatalog() {
    const request = ++catalogRequest;

    state.catalogLoading = true;
    state.catalogError = "";
    render();

    try {
        const params = new URLSearchParams({
            ...state.advanced,
            q: state.query,
            page: state.catalogPage,
            scope: state.page === "collection" ? "collection" : "catalog"
        });
        const result = await api(`/cards?${params}`);

        if (request !== catalogRequest) {
            return;
        }

        state.cards = result.items;
        state.catalogTotal = result.total;
    } catch (error) {
        if (request === catalogRequest) {
            state.catalogError = error.message;
        }
    } finally {
        if (request === catalogRequest) {
            state.catalogLoading = false;

            if (state.page !== "decks") {
                render();
            }
        }
    }
}

async function enter() {
    state.user = await api("/users/me");
    $("#player-name").textContent = state.user.username;
    $("#avatar").textContent = state.user.username.slice(0, 2).toUpperCase();
    $("#auth").hidden = true;
    $("#workspace").hidden = false;
    $("#items").innerHTML =
        '<div class="skeleton-grid" role="status" aria-label="Carregando sua biblioteca"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';

    try {
        await load();

        const match = location.hash.match(/^#deck\/([0-9a-f-]{36})$/i);

        if (match) {
            await openDeck(match[1]);
        }
    } catch (error) {
        $("#items").innerHTML =
            '<div class="empty"><h3>Não foi possível carregar sua biblioteca.</h3><button class="secondary" id="retry">Tentar novamente</button></div>';

        $("#retry").onclick = () => enter().catch((e) => notify(e.message));

        notify(error.message);
    }
}

$("#auth-toggle").onclick = () => {
    state.register = !state.register;
    $("#username-label").hidden = !state.register;
    $("#username-label input").required = state.register;
    $("#auth-title").textContent = state.register ? "Comece sua jornada." : "De volta ao jogo.";
    $("#auth-subtitle").textContent = state.register
        ? "Crie sua conta e dê espaço às suas estratégias."
        : "Entre para continuar sua próxima estratégia.";
    $("#auth-submit").textContent = state.register ? "Criar conta →" : "Entrar →";
    $("#auth-prompt").textContent = state.register ? "Já tem uma conta?" : "Ainda não tem uma conta?";
    $("#auth-toggle").textContent = state.register ? "Entre aqui" : "Crie sua conta";

    const password = $('#auth-form [name="password"]');

    password.minLength = state.register ? 8 : 1;
    password.autocomplete = state.register ? "new-password" : "current-password";
    $("#auth-error").textContent = "";
};

$("#auth-form").onsubmit = async (event) => {
    event.preventDefault();

    const input = Object.fromEntries(new FormData(event.target));

    $("#auth-submit").disabled = true;
    $("#auth-error").textContent = "";

    try {
        if (state.register) {
            await api("/auth/register", { method: "POST", body: input });
        }

        const result = await api("/auth/login", {
            method: "POST",
            body: { email: input.email, password: input.password }
        });

        state.token = result.token;
        sessionStorage.setItem("decktrack-token", result.token);
        await enter();
    } catch (error) {
        $("#auth-error").textContent = error.message;
    } finally {
        $("#auth-submit").disabled = false;
    }
};

$("#logout").onclick = logout;
function navigate(page, query = "") {
    DeckPage.leave();
    TrackingUI.leave();
    ArcaneUI.leave();
    $("#modal").close();
    history.replaceState({}, "", location.pathname + location.search);
    clearTimeout(searchTimer);
    ++catalogRequest;
    state.page = page;
    state.query = query;
    state.catalogPage = 1;
    $("#search").value = query;
    document.querySelectorAll("[data-page]").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    if (["dashboard", "analytics"].includes(page)) {
        ArcaneUI.show(page);
    } else if (["tracking", "pool"].includes(page)) {
        TrackingUI.show(page === "pool" ? "pool" : "all");
    } else if (page !== "decks") {
        loadCatalog();
    } else {
        render();
    }
}

document.querySelectorAll("[data-page]").forEach((button) => {
    button.title ||= button.textContent.trim();
    button.onclick = () => navigate(button.dataset.page);
});

document.querySelectorAll("[data-format]").forEach(
    (button) =>
        (button.onclick = () => {
            state.format = button.dataset.format;
            render();
        })
);
$("#search").maxLength = 200;

$("#search").oninput = (event) => {
    state.query = event.target.value;
    state.catalogPage = 1;
    clearTimeout(searchTimer);

    if (state.page !== "decks") {
        ++catalogRequest;
        state.catalogLoading = true;
        render();
        searchTimer = setTimeout(loadCatalog, 250);
    } else {
        render();
    }
};

$(".toolbar").insertAdjacentHTML("afterend", '<div id="advanced-filter-panel" hidden></div>');

let mainFilterPanel;

function ensureMainFilters() {
    if (!mainFilterPanel) {
        mainFilterPanel = CardFilterUI.mount($("#advanced-filter-panel"), {
            request: api,
            onApply: (values) => {
                state.advanced = values;
                state.catalogPage = 1;
                clearTimeout(searchTimer);
                loadCatalog();
            }
        });
    }
}

function deckTile(deck) {
    return ArcaneUI.tile(deck);
}

function render() {
    const decks = state.page === "decks",
        collection = state.page === "collection";

    $("#advanced-filter-panel").hidden = decks;

    if (!decks) {
        ensureMainFilters();
    }

    $("#page-title").innerHTML =
        `${decks ? "Meus decks" : collection ? "Minha coleção" : "Catálogo de cartas"}<span>.</span>`;
    $("#page-description").textContent = decks
        ? "Ideias na mesa. Estratégias em construção."
        : collection
          ? "Cada carta tem seu lugar. Encontre o da sua."
          : "Milhares de cartas prontas para sua próxima estratégia. Dados: MTGJSON.";
    $("#create").textContent = decks ? "+ Novo deck" : "+ Cadastrar carta";
    $("#list-title").textContent = decks
        ? "Sua biblioteca de decks"
        : collection
          ? "Suas cartas"
          : "Catálogo de Magic: The Gathering";
    $("#search").placeholder = decks ? "Buscar decks…" : "Buscar cartas…";
    $("#filters").hidden = !decks;
    document
        .querySelectorAll("[data-page]")
        .forEach((b) => b.classList.toggle("active", b.dataset.page === state.page));
    document
        .querySelectorAll("[data-format]")
        .forEach((b) => b.classList.toggle("selected", b.dataset.format === state.format));

    const source = decks
        ? state.decks
        : collection
          ? state.cards.map((card) => ({
                card,
                cardId: card.id,
                quantity: state.collection.find((item) => item.cardId === card.id)?.quantity ?? 0
            }))
          : state.cards;
    const items = !decks
        ? source
        : source.filter(
              (item) =>
                  (state.format === "all" || item.format === state.format) &&
                  item.name.toLocaleLowerCase("pt-BR").includes(state.query.toLocaleLowerCase("pt-BR"))
          );

    $("#result-count").textContent =
        `${!decks ? state.catalogTotal.toLocaleString("pt-BR") : items.length} ${decks ? "decks" : "cartas"}`;

    if (!decks && (state.catalogLoading || state.catalogError)) {
        $("#items").innerHTML =
            `<div class="empty"><p>${state.catalogLoading ? "Buscando cartas…" : escapeHtml(state.catalogError)}</p>${state.catalogError ? '<button class="secondary" id="catalog-retry">Tentar novamente</button>' : ""}</div>`;

        if ($("#catalog-retry")) {
            $("#catalog-retry").onclick = loadCatalog;
        }

        return;
    }
    if (!items.length) {
        const filtered =
            state.query ||
            (decks && state.format !== "all") ||
            (!decks &&
                Object.entries(state.advanced).some(
                    ([key, value]) => !["colorMode", "colorField"].includes(key) && value !== ""
                ));

        $("#items").innerHTML =
            `<div class="empty"><span>${decks ? "▧" : "✧"}</span><h3>${filtered ? "Nenhum resultado por aqui." : decks ? "Sua próxima estratégia começa aqui." : collection ? "Sua coleção está esperando por você." : "Vamos começar o catálogo?"}</h3><p>${filtered ? "Experimente outro termo ou formato." : decks ? "Crie seu primeiro deck e adicione as cartas da sua estratégia." : collection ? "Abra o catálogo para adicionar as cartas que você possui." : "Cadastre a primeira carta para começar a construir."}</p>${filtered ? "" : `<button class="primary" id="empty-action">${decks ? "+ Criar meu primeiro deck" : collection ? "Explorar catálogo →" : "+ Cadastrar carta"}</button>`}</div>`;

        if ($("#empty-action")) {
            $("#empty-action").onclick = () => {
                if (collection) {
                    state.page = "catalog";
                    state.query = "";
                    state.catalogPage = 1;
                    $("#search").value = "";
                    loadCatalog();
                } else {
                    create();
                }
            };
        }

        return;
    }

    $("#items").innerHTML = items
        .map((item) =>
            decks
                ? deckTile(item)
                : `<article class="card-row">${CardImageUI.thumbnail(item.card || item)}<div class="card-description"><h3>${escapeHtml(item.card?.name || item.name)}</h3>${CardFilterUI.summary(item.card || item)}${collection ? `<small>${item.quantity} na coleção</small>` : ""}${CardFilterUI.details(item.card || item)}</div><button class="secondary" data-owned="${item.cardId || item.id}">Definir quantidade</button></article>`
        )
        .join("");
    document
        .querySelectorAll("[data-deck]")
        .forEach((b) => (b.onclick = () => openDeck(b.dataset.deck).catch((e) => notify(e.message))));
    document.querySelectorAll("[data-owned]").forEach((b) => (b.onclick = () => owned(b.dataset.owned)));
    TrackingUI.annotate($("#items"));

    if (!decks) {
        const pages = Math.max(1, Math.ceil(state.catalogTotal / 60));

        $("#items").insertAdjacentHTML(
            "beforeend",
            `<div class="pagination"><button class="secondary" id="previous-page" ${state.catalogPage === 1 ? "disabled" : ""}>← Anterior</button><span>Página ${state.catalogPage} de ${pages}</span><button class="secondary" id="next-page" ${state.catalogPage >= pages ? "disabled" : ""}>Próxima →</button></div>`
        );

        $("#previous-page").onclick = () => {
            --state.catalogPage;
            loadCatalog();
        };

        $("#next-page").onclick = () => {
            ++state.catalogPage;
            loadCatalog();
        };
    }
}

function modal(title, html) {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = html;

    if (!$("#modal").open) {
        $("#modal").showModal();
    }
}

$("#close-modal").onclick = () => $("#modal").close();

$("#modal").addEventListener("click", (event) => {
    if (event.target === $("#modal")) {
        const rect = event.target.getBoundingClientRect();

        if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        ) {
            event.target.close();
        }
    }
});

const formatOptions = (selected = "commander") =>
    Object.entries(formats)
        .map(([id, name]) => `<option value="${id}" ${id === selected ? "selected" : ""}>${name}</option>`)
        .join("");

function bindForm(action) {
    $("#editor").onsubmit = async (event) => {
        event.preventDefault();

        const button = event.submitter;

        button.disabled = true;
        $("#form-error").textContent = "";

        try {
            await action(Object.fromEntries(new FormData(event.target)));
        } catch (error) {
            if ($("#form-error")) {
                $("#form-error").textContent = error.message;
            } else {
                notify(error.message);
            }
        } finally {
            button.disabled = false;
        }
    };
}

function create() {
    const deck = state.page === "decks";

    modal(
        deck ? "Uma nova estratégia" : "Cadastrar carta",
        `<form id="editor" class="form-grid"><label>${deck ? "Nome do deck" : "Nome da carta"}<input name="name" required maxlength="${deck ? 100 : 200}" placeholder="${deck ? "Ex.: Elfos da floresta" : "Ex.: Sol Ring"}"></label>${deck ? `<label>Formato<select name="format">${formatOptions()}</select></label>` : '<label>Identificador externo (opcional)<input name="externalId" maxlength="100"></label><p class="detail-caption">A carta ficará disponível no catálogo compartilhado. Depois, defina quantas cópias você possui.</p>'}<p id="form-error" class="error" role="alert"></p><button class="primary" type="submit">${deck ? "Criar deck" : "Cadastrar carta"}</button></form>`
    );
    bindForm(async (input) => {
        if (!input.externalId) {
            delete input.externalId;
        }

        const result = await api(deck ? "/decks" : "/cards", { method: "POST", body: input });

        await load();
        $("#modal").close();
        notify(deck ? "Deck criado. Hora de montar sua estratégia!" : "Carta cadastrada no catálogo.");

        if (deck) {
            await openDeck(result.id);
        } else {
            owned(result.id, result.name);
        }
    });
}

$("#create").onclick = create;

function owned(id, fallbackName) {
    const item = state.collection.find((c) => c.cardId === id);

    const card = state.cards.find((c) => c.id === id) || item?.card;

    modal(
        "Sua coleção",
        `<form id="editor" class="form-grid"><p>${escapeHtml(card?.name || fallbackName)}</p><label>Quantidade de cópias<input name="quantity" type="number" min="0" max="2147483647" step="1" required value="${item?.quantity || 0}"></label><p class="detail-caption">Use zero para remover a carta da coleção. Suas cartas podem ser usadas em vários decks.</p><p id="form-error" class="error" role="alert"></p><button class="primary">Salvar quantidade</button></form>`
    );
    $("#editor .detail-caption").textContent =
        "Use zero para remover a carta da coleção. A pool livre desconta as cópias usadas nos decks.";
    bindForm(async (input) => {
        await api(`/collection/${id}`, { method: "PUT", body: { quantity: Number(input.quantity) } });
        await load();
        $("#modal").close();
        notify("Coleção atualizada.");
    });
}

async function openDeck(id) {
    return DeckPage.open(id);
}

async function openDeckEditor(id) {
    const deck = await api(`/decks/${id}`);
    const initialCards = await api("/cards?pageSize=100");
    const available = new Map(initialCards.items.map((c) => [c.id, c]));

    deck.cards.forEach((c) => available.set(c.cardId, c.card));
    modal(
        deck.name,
        `<form id="editor" class="form-grid"><label>Nome do deck<input name="name" maxlength="100" required value="${escapeHtml(deck.name)}"></label><label>Formato<select name="format">${formatOptions(deck.format)}</select></label><div class="form-actions"><button type="button" class="danger" id="delete-deck">Excluir deck</button><button class="secondary" type="submit">Salvar alterações</button></div><p id="form-error" class="error" role="alert"></p></form><hr style="border:0;border-top:1px solid var(--line)"><h3>Cartas do deck <span class="detail-caption">· ${deck.cards.reduce((n, c) => n + c.quantity, 0)} cópias</span></h3><p class="detail-caption">O estoque é independente de cada deck. O formato não valida a legalidade das cartas.</p><div class="detail-list">${deck.cards.length ? deck.cards.map((c) => `<div class="card-row"><div><h3>${escapeHtml(c.card.name)}</h3><small>${c.quantity} no deck · ${c.ownedQuantity} na coleção${c.quantity > c.ownedQuantity ? ` · faltam ${c.quantity - c.ownedQuantity}` : ""}</small></div><button class="secondary" data-edit-card="${c.cardId}">Editar</button></div>`).join("") : '<p class="detail-caption">Seu deck ainda não tem cartas. Adicione a primeira abaixo.</p>'}</div><form id="deck-card-form" class="form-grid"><label>Carta<select name="cardId" required><option value="">Selecione uma carta</option>${[...available.values()].map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></label><label>Quantidade no deck<input name="quantity" type="number" value="1" min="0" max="2147483647" step="1" required></label><p class="detail-caption">A quantidade substitui a atual. Use zero para remover a carta.</p><p id="card-error" class="error" role="alert"></p><button class="primary" ${available.size ? "" : "disabled"}>Salvar carta no deck</button>${available.size ? "" : '<p class="detail-caption">Cadastre uma carta no catálogo para adicioná-la ao deck.</p>'}</form>`
    );

    const stockCaption = [...$("#modal-body").querySelectorAll(".detail-caption")].find((element) =>
        element.textContent.startsWith("O estoque")
    );

    if (stockCaption) {
        stockCaption.textContent =
            "A pool mostra as cópias fora dos decks. O total na coleção é preservado ao movimentar cartas.";
    }

    $("#editor").insertAdjacentHTML(
        "afterend",
        '<section class="import-banner"><div><h3>Já tem uma lista pronta?</h3><p>Cole sua lista ou abra um arquivo .txt para adicionar todas as cartas de uma vez.</p></div><button type="button" class="primary" id="open-list-import">Importar lista</button></section>'
    );

    $("#open-list-import").onclick = () => openListImport(id);

    $("#editor .form-actions").insertAdjacentHTML(
        "beforebegin",
        `<label>Carta de destaque / capa (ex.: comandante)<select name="coverCardId"><option value="">Sem carta de destaque</option>${deck.cards.map((item) => `<option value="${item.cardId}" ${deck.coverCardId === item.cardId ? "selected" : ""}>${escapeHtml(item.card.name)}</option>`).join("")}</select></label><p class="detail-caption">Escolha uma carta deste deck para personalizar o banner e a capa. Isso não valida regras de comandante.</p>`
    );
    $("#editor").insertAdjacentHTML("beforebegin", CardImageUI.hero(deck.coverCard));
    bindForm(async (input) => {
        input.coverCardId = input.coverCardId || null;
        await api(`/decks/${id}`, { method: "PATCH", body: input });
        await load();
        await openDeck(id);
        notify("Deck atualizado.");
    });

    $("#delete-deck").onclick = () => {
        modal(
            "Excluir deck?",
            `<p class="detail-caption">O deck “${escapeHtml(deck.name)}” será excluído. As cartas continuam na sua coleção.</p><div class="form-actions"><button class="secondary" id="cancel-delete">Cancelar</button><button class="danger" id="confirm-delete">Excluir deck</button></div>`
        );

        $("#cancel-delete").onclick = () => openDeck(id).catch((e) => notify(e.message));

        $("#confirm-delete").onclick = async (event) => {
            event.target.disabled = true;

            try {
                await api(`/decks/${id}`, { method: "DELETE" });
                await load();
                $("#modal").close();
                document.querySelector('[data-page="decks"]').click();
                notify("Deck excluído.");
            } catch (error) {
                notify(error.message);
                event.target.disabled = false;
            }
        };
    };

    document.querySelectorAll("[data-edit-card]").forEach(
        (button) =>
            (button.onclick = () => {
                const item = deck.cards.find((c) => c.cardId === button.dataset.editCard);

                $('#deck-card-form [name="cardId"]').value = item.cardId;
                $('#deck-card-form [name="quantity"]').value = item.quantity;
                $('#deck-card-form [name="quantity"]').focus();
            })
    );

    const cardSelect = $('#deck-card-form [name="cardId"]');
    const cardForm = $("#deck-card-form");
    const deckListRoot = $(".detail-list");

    deckListRoot.insertAdjacentHTML("beforebegin", '<div id="deck-existing-filters"></div>');
    deckListRoot.insertAdjacentHTML("afterend", '<div id="deck-filter-pages" class="pagination"></div>');

    const deckPager = $("#deck-filter-pages");
    let deckFilterValues = {},
        deckFilterPage = 1,
        deckFilterRequest = 0;

    async function filterDeckCards() {
        const request = ++deckFilterRequest;

        deckListRoot.innerHTML = '<p class="detail-caption">Buscando cartas do deck…</p>';
        deckPager.innerHTML = "";

        try {
            const result = await api(
                `/cards?${new URLSearchParams({ ...deckFilterValues, deckId: id, page: deckFilterPage })}`
            );

            if (request !== deckFilterRequest || !deckListRoot.isConnected) {
                return;
            }

            deckListRoot.innerHTML = result.items.length
                ? result.items
                      .map((card) => {
                          const item = deck.cards.find((entry) => entry.cardId === card.id);

                          return `<div class="card-row">${CardImageUI.thumbnail(card)}<div class="card-description"><h3>${escapeHtml(card.name)}</h3>${CardFilterUI.summary(card)}<small>${item.quantity} no deck · ${item.ownedQuantity} na coleção</small>${CardFilterUI.details(card)}</div><button type="button" class="secondary" data-edit-card="${card.id}">Editar</button></div>`;
                      })
                      .join("")
                : '<p class="detail-caption">Nenhuma carta do deck corresponde aos filtros.</p>';
            deckListRoot.querySelectorAll("[data-edit-card]").forEach(
                (button) =>
                    (button.onclick = () => {
                        const item = deck.cards.find((entry) => entry.cardId === button.dataset.editCard);

                        ++deckSearchRequest;
                        clearTimeout(deckSearchTimer);
                        cardSelect.disabled = false;
                        cardForm.querySelector("button.primary").disabled = false;

                        if (![...cardSelect.options].some((option) => option.value === item.cardId)) {
                            cardSelect.insertAdjacentHTML(
                                "beforeend",
                                `<option value="${item.cardId}">${escapeHtml(item.card.name)}</option>`
                            );
                        }

                        $("#deck-search-status").textContent =
                            "Editando uma carta deste deck. Os filtros de adição continuam disponíveis.";
                        cardSelect.value = item.cardId;
                        cardForm.querySelector('[name="quantity"]').value = item.quantity;
                        cardForm.querySelector('[name="quantity"]').focus();
                    })
            );

            const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

            deckPager.innerHTML = `<button type="button" class="secondary" data-direction="-1" ${deckFilterPage === 1 ? "disabled" : ""}>←</button><span>${result.total} cartas · ${deckFilterPage}/${pages}</span><button type="button" class="secondary" data-direction="1" ${deckFilterPage >= pages ? "disabled" : ""}>→</button>`;
            deckPager.querySelectorAll("[data-direction]").forEach(
                (button) =>
                    (button.onclick = () => {
                        deckFilterPage += Number(button.dataset.direction);
                        filterDeckCards();
                    })
            );
        } catch (error) {
            if (request === deckFilterRequest && deckListRoot.isConnected) {
                deckListRoot.innerHTML = `<p class="error">${escapeHtml(error.message)}</p><button type="button" class="secondary">Tentar novamente</button>`;
                deckListRoot.querySelector("button").onclick = filterDeckCards;
            }
        }
    }

    CardFilterUI.mount($("#deck-existing-filters"), {
        request: api,
        includeName: true,
        onApply: (values) => {
            deckFilterValues = values;
            deckFilterPage = 1;
            filterDeckCards();
        }
    });
    cardForm
        .querySelector("button.primary")
        .insertAdjacentHTML(
            "beforebegin",
            '<label class="check-option"><input type="checkbox" name="registerOwned"><span>Já possuo estas cópias: registrar na coleção<small>Este deck registra suas próprias cópias. Em outro deck, a mesma carta acrescenta cópias adicionais. Repetir este registro não duplica o estoque.</small></span></label>'
        );
    cardSelect.parentElement.insertAdjacentHTML(
        "beforebegin",
        '<label>Buscar carta no catálogo<input type="search" id="deck-card-search" maxlength="200" placeholder="Digite o nome em inglês…"></label><p class="detail-caption" id="deck-search-status">Mostrando até 100 cartas. Busque pelo nome para encontrar outras.</p>'
    );

    let deckSearchTimer,
        deckSearchRequest = 0,
        candidateFilters = {};

    cardSelect.parentElement.insertAdjacentHTML("afterend", '<div id="deck-candidate-filters"></div>');
    CardFilterUI.mount($("#deck-candidate-filters"), {
        request: api,
        onApply: (values) => {
            candidateFilters = values;
            $("#deck-card-search").dispatchEvent(new Event("input"));
        }
    });

    $("#deck-card-search").oninput = (event) => {
        const query = event.target.value,
            request = ++deckSearchRequest;

        clearTimeout(deckSearchTimer);
        cardSelect.disabled = true;
        cardForm.querySelector('button[type="submit"], button.primary').disabled = true;
        $("#deck-search-status").textContent = "Buscando cartas…";
        deckSearchTimer = setTimeout(async () => {
            try {
                const result = await api(
                    `/cards?${new URLSearchParams({ ...candidateFilters, q: query, pageSize: 100 })}`
                );

                if (request !== deckSearchRequest || !cardForm.isConnected) {
                    return;
                }

                const matches = new Map(result.items.map((c) => [c.id, c]));

                cardSelect.innerHTML =
                    '<option value="">Selecione uma carta</option>' +
                    [...matches.values()].map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
                $("#deck-search-status").textContent =
                    `${result.total} resultados no catálogo. Exibindo até 100; refine os filtros para encontrar outras cartas.`;
                cardSelect.disabled = false;
                cardForm.querySelector("button.primary").disabled = !matches.size;
            } catch (error) {
                if (request === deckSearchRequest && cardForm.isConnected) {
                    $("#deck-search-status").textContent = error.message;
                }
            }
        }, 250);
    };

    $("#deck-card-form").onsubmit = async (event) => {
        event.preventDefault();

        const button = event.submitter;

        button.disabled = true;

        const input = Object.fromEntries(new FormData(event.target));

        try {
            const result = await api(`/decks/${id}/cards/${input.cardId}`, {
                method: "PUT",
                body: { quantity: Number(input.quantity), registerOwned: input.registerOwned === "on" }
            });

            await load();
            await openDeck(id);
            notify(
                `Cartas do deck atualizadas.${result.collectionAddedQuantity ? ` +${result.collectionAddedQuantity} cópias na coleção.` : ""}`
            );
        } catch (error) {
            if ($("#card-error")) {
                $("#card-error").textContent = error.message;
            }
        } finally {
            button.disabled = false;
        }
    };

    filterDeckCards();
}

function openListImport(deckId) {
    modal(
        "Importar lista de cartas",
        `<form id="list-import-form" class="form-grid"><p class="detail-caption">Cole uma carta por linha, com a quantidade antes do nome. Linhas repetidas serão somadas. Você pode usar o nome da frente de uma carta com duas faces.</p><label>Abrir arquivo .txt (opcional)<input id="list-file" type="file" accept=".txt,text/plain"></label><label>Lista de cartas<textarea id="list-text" rows="12" maxlength="30000" required spellcheck="false" placeholder="1 Arcane Lighthouse&#10;30 Island&#10;1 Cosima, God of the Voyage&#10;1 AEtherize"></textarea></label><p class="detail-caption">Até 1.000 linhas e 30.000 caracteres. A importação define as quantidades das cartas listadas e mantém as demais cartas do deck. Importar a mesma lista novamente não duplica as quantidades. A coleção física permanece independente.</p><p id="list-error" class="error" role="alert"></p><div class="form-actions"><button type="button" class="secondary" id="list-back">Voltar ao deck</button><button type="submit" class="secondary" id="list-preview">Conferir lista</button></div><div id="list-results" aria-live="polite"></div><button type="button" class="primary" id="list-confirm" disabled>Importar cartas no deck</button></form>`
    );

    const form = $("#list-import-form"),
        textarea = $("#list-text"),
        file = $("#list-file"),
        confirm = $("#list-confirm"),
        preview = $("#list-preview"),
        back = $("#list-back");

    [...form.querySelectorAll("p.detail-caption")].find((p) => p.textContent.startsWith("Até 1.000")).textContent =
        "Até 1.000 linhas e 30.000 caracteres. A importação define as quantidades das cartas listadas e mantém as demais. Repetir a lista não duplica as quantidades. Marque abaixo se também quiser registrar as cópias na coleção.";
    $("#list-error").insertAdjacentHTML(
        "beforebegin",
        '<label class="check-option"><input type="checkbox" id="list-register-owned"><span>Possuo todas as cartas desta lista: registrar na coleção<small>Acrescenta as cópias deste deck ao estoque atual. A mesma carta em outro deck conta como cópias adicionais. Reimportar este deck não registra as mesmas cópias de novo. Você pode ajustar o total em Minha coleção.</small></span></label>'
    );

    const registerOwned = $("#list-register-owned");
    let approvedText = null,
        approvedOwned = null,
        revision = 0,
        busy = false;

    function invalidate() {
        ++revision;
        approvedText = null;
        approvedOwned = null;
        confirm.disabled = true;
        $("#list-results").innerHTML = "";
        $("#list-error").textContent = "";
    }

    function setBusy(value) {
        busy = value;
        textarea.disabled = value;
        file.disabled = value;
        registerOwned.disabled = value;
        preview.disabled = value;
        back.disabled = value;
        confirm.disabled = value || approvedText !== textarea.value || approvedOwned !== registerOwned.checked;
    }

    textarea.oninput = invalidate;
    registerOwned.onchange = invalidate;

    file.onchange = async () => {
        const selected = file.files[0];

        if (!selected) {
            return;
        }

        invalidate();

        const current = revision;

        try {
            if (selected.size > 90000) {
                throw new Error("O arquivo deve conter no máximo 30.000 caracteres (90 KB).");
            }

            const text = await selected.text();

            if (!form.isConnected || current !== revision) {
                return;
            }
            if (text.length > 30000) {
                throw new Error("A lista deve conter no máximo 30.000 caracteres.");
            }

            textarea.value = text;
            invalidate();
        } catch (error) {
            if (form.isConnected) {
                $("#list-error").textContent = error.message;
            }
        }
    };

    back.onclick = () => openDeck(deckId).catch((error) => notify(error.message));

    form.onsubmit = async (event) => {
        event.preventDefault();

        if (busy) {
            return;
        }

        invalidate();

        const text = textarea.value;

        setBusy(true);

        try {
            const result = await api(`/decks/${deckId}/import/preview`, {
                method: "POST",
                body: { text, registerOwned: registerOwned.checked }
            });

            if (!form.isConnected) {
                return;
            }

            $("#list-results").innerHTML =
                `<div class="import-summary"><strong>${result.cards.length} cartas diferentes · ${result.totalQuantity} cópias</strong><p>${result.canImport ? "Tudo pronto. Confira as quantidades e confirme a importação." : "Corrija as linhas abaixo e confira a lista novamente. Nenhuma carta foi adicionada."}</p></div>${result.errors.length ? `<ul class="import-errors">${result.errors.map((error) => `<li><strong>${error.line ? `Linha ${error.line}: ` : ""}</strong>${escapeHtml(error.message)}</li>`).join("")}</ul>` : ""}${result.cards.length ? `<div class="import-table-wrap"><table class="import-table"><thead><tr><th scope="col">Quantidade</th><th scope="col">Carta encontrada</th><th scope="col">Linhas</th></tr></thead><tbody>${result.cards.map((card) => `<tr><td>${card.quantity}</td><td>${escapeHtml(card.name)}</td><td>${card.lines.join(", ")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;

            if (result.canImport) {
                approvedText = text;
                approvedOwned = registerOwned.checked;
                $("#list-results .import-summary").insertAdjacentHTML(
                    "beforeend",
                    `<p>${registerOwned.checked ? `${result.collectionAddedQuantity} novas cópias serão acrescentadas à coleção. Cópias já registradas por este deck não serão somadas novamente.` : "A coleção não será alterada."}</p>`
                );
            }
        } catch (error) {
            if (form.isConnected) {
                $("#list-error").textContent = error.message;
            }
        } finally {
            if (form.isConnected) {
                setBusy(false);
            }
        }
    };

    confirm.onclick = async () => {
        if (
            busy ||
            approvedText === null ||
            approvedText !== textarea.value ||
            approvedOwned !== registerOwned.checked
        ) {
            return;
        }

        setBusy(true);
        $("#list-error").textContent = "";

        try {
            const result = await api(`/decks/${deckId}/import`, {
                method: "POST",
                body: { text: approvedText, registerOwned: approvedOwned }
            });

            if (!form.isConnected) {
                return;
            }

            approvedText = null;
            await load();
            await openDeck(deckId);
            notify(
                `${result.totalQuantity} cópias de ${result.cards.length} cartas importadas!${result.collectionAddedQuantity ? ` +${result.collectionAddedQuantity} na coleção.` : ""}`
            );
        } catch (error) {
            if (form.isConnected) {
                approvedText = null;
                $("#list-error").textContent = `${error.message} Confira a lista novamente antes de tentar importar.`;
            } else {
                notify(error.message);
            }
        } finally {
            if (form.isConnected) {
                setBusy(false);
            }
        }
    };

    textarea.focus();
}

ArcaneUI.init();

if (state.token) {
    enter().catch((error) => {
        logout();
        $("#auth-error").textContent = error.message;
    });
} else {
    logout();
}

window.addEventListener("popstate", () => {
    if (!state.user) {
        return;
    }

    const match = location.hash.match(/^#deck\/([0-9a-f-]{36})$/i);

    if (match) {
        openDeck(match[1]);
    } else {
        DeckPage.leave();
        TrackingUI.leave();
        state.page = "decks";
        render();
    }
});
