window.CardFilterUI = (() => {
    let sequence = 0,
        optionsPromise;
    const sets = new Map();
    const esc = (value) =>
        String(value ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        );
    const colorLabels = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde", C: "Incolor" };

    function mount(root, { request, onApply, initial = {}, includeName = false }) {
        const prefix = `card-filter-${++sequence}`;

        root.innerHTML = `<details class="advanced-filters"><summary>Filtros avançados <span class="filter-count"></span></summary><div class="advanced-grid">${includeName ? '<label>Nome da carta<input data-filter="q" maxlength="200" placeholder="Ex.: Sol Ring"></label>' : ""}<label>Tipo / subtipo<input data-filter="type" maxlength="100" list="${prefix}-types" placeholder="Ex.: Creature, Merfolk, Legendary"><datalist id="${prefix}-types"></datalist></label><label>Texto de regras / efeito<input data-filter="text" maxlength="200" placeholder="Ex.: draw a card"></label><label>Palavra-chave<input data-filter="keyword" maxlength="100" list="${prefix}-keywords" placeholder="Ex.: Flying"><datalist id="${prefix}-keywords"></datalist></label><label>Edição em que foi publicada<input data-filter="set" maxlength="20" list="${prefix}-sets" placeholder="Código, ex.: KHM"><datalist id="${prefix}-sets"></datalist></label><fieldset class="color-filter"><legend>Cores</legend><div>${Object.entries(
            colorLabels
        )
            .map(
                ([value, label]) =>
                    `<label><input type="checkbox" data-color="${value}"><span class="color-dot color-${value}">${value}</span>${label}</label>`
            )
            .join(
                ""
            )}</div></fieldset><label>Considerar<select data-filter="colorField"><option value="colors">Cor da carta (todas as faces)</option><option value="colorIdentity">Identidade de cor</option></select></label><label>Combinar cores<select data-filter="colorMode"><option value="any">Qualquer uma das selecionadas</option><option value="all">Todas as selecionadas</option><option value="exact">Exatamente as selecionadas</option></select></label><label>Valor de mana mínimo<input type="number" data-filter="manaMin" min="0" max="1000000" step="any" placeholder="Sem mínimo"></label><label>Valor de mana máximo<input type="number" data-filter="manaMax" min="0" max="1000000" step="any" placeholder="Sem máximo"></label><label>Legal sem restrições em<select data-filter="legalFormat"><option value="">Qualquer formato</option>${["commander", "pauper", "standard", "modern", "pioneer", "legacy", "vintage"].map((format) => `<option value="${format}">${format[0].toUpperCase() + format.slice(1)}</option>`).join("")}</select></label></div><p class="detail-caption">Dados e termos em inglês. Edição indica onde a carta foi publicada; não identifica a versão que você possui. Valor de mana considera a primeira face.</p><p class="error filter-error" role="alert"></p><div class="filter-actions"><button type="button" class="secondary filter-clear">Limpar filtros</button><button type="button" class="primary filter-apply">Aplicar filtros</button></div></details>`;

        function read() {
            const values = {};

            root.querySelectorAll("[data-filter]").forEach((input) => {
                if (input.value.trim()) {
                    values[input.dataset.filter] = input.value.trim();
                }
            });

            const colors = [...root.querySelectorAll("[data-color]:checked")].map((input) => input.dataset.color);

            if (colors.length) {
                values.colors = colors.join(",");
            }

            return values;
        }

        function set(values) {
            root.querySelectorAll("[data-filter]").forEach(
                (input) =>
                    (input.value =
                        values[input.dataset.filter] ??
                        (input.dataset.filter === "colorMode"
                            ? "any"
                            : input.dataset.filter === "colorField"
                              ? "colors"
                              : ""))
            );
            root.querySelectorAll("[data-color]").forEach(
                (input) => (input.checked = (values.colors || "").split(",").includes(input.dataset.color))
            );
        }

        function apply() {
            root.querySelector(".filter-error").textContent = "";

            if ([...root.querySelectorAll("input")].some((input) => !input.reportValidity())) {
                return;
            }

            const values = read();

            if (values.colors?.includes("C") && values.colors !== "C") {
                root.querySelector(".filter-error").textContent = "Selecione Incolor sozinho.";

                return;
            }
            if (
                values.manaMin !== undefined &&
                values.manaMax !== undefined &&
                Number(values.manaMin) > Number(values.manaMax)
            ) {
                root.querySelector(".filter-error").textContent = "O mínimo de mana deve ser menor ou igual ao máximo.";

                return;
            }
            if (values.set && !/^[a-z0-9_]+$/i.test(values.set)) {
                root.querySelector(".filter-error").textContent = "Use o código da edição, como KHM.";

                return;
            }

            const count = Object.keys(values).filter((key) => !["colorMode", "colorField"].includes(key)).length;

            root.querySelector(".filter-count").textContent = count ? `· ${count} ativos` : "";
            onApply(values);
        }

        root.querySelector(".filter-apply").onclick = apply;

        root.querySelector(".filter-clear").onclick = () => {
            set({});
            apply();
        };

        root.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && event.target.tagName === "INPUT") {
                event.preventDefault();
                apply();
            }
        });
        set(initial);

        if (!optionsPromise) {
            optionsPromise = request("/cards/filters").catch((error) => {
                optionsPromise = null;
                throw error;
            });
        }

        optionsPromise
            .then((options) => {
                if (!root.isConnected) {
                    return;
                }

                options.sets.forEach((set) => sets.set(set.code, set.name));
                root.querySelector(`#${prefix}-sets`).innerHTML = options.sets
                    .map((set) => `<option value="${esc(set.code)}">${esc(set.name)}</option>`)
                    .join("");

                for (const key of ["types", "keywords"]) {
                    root.querySelector(`#${prefix}-${key}`).innerHTML = options[key]
                        .map((value) => `<option value="${esc(value)}"></option>`)
                        .join("");
                }
            })
            .catch(() => {
                if (root.isConnected) {
                    root.querySelector(".filter-error").textContent =
                        "Sugestões indisponíveis. Você ainda pode digitar os filtros.";
                }
            });

        return { read, set, apply };
    }

    function summary(card) {
        const meta = card.metadata || {};

        return `<small class="card-meta">${esc(meta.type || "Tipo não informado")}${meta.manaValue != null ? ` · VM ${meta.manaValue}` : ""}${meta.manaCost ? ` · ${esc(meta.manaCost)}` : ""}</small>`;
    }

    function details(card) {
        const meta = card.metadata || {},
            faces = meta.faces || [];

        if (!Object.keys(meta).length) {
            return '<small class="detail-caption">Metadados não disponíveis para esta carta.</small>';
        }

        return `<details class="card-details"><summary>Ver regras e edições</summary><div>${faces.length ? faces.map((face) => `<section><strong>${esc(face.name)}</strong><p class="detail-caption">${esc(face.type)} ${esc(face.manaCost)}</p><p class="rules-text">${esc(face.text || "Sem texto de regras.")}</p></section>`).join("") : `<p class="rules-text">${esc(meta.text || "Sem texto de regras.")}</p>`}<p><strong>Cores:</strong> ${(meta.colors || []).map((color) => colorLabels[color] || color).join(", ") || "Incolor"} · <strong>Identidade:</strong> ${(meta.colorIdentity || []).map((color) => colorLabels[color] || color).join(", ") || "Incolor"}</p><p><strong>Palavras-chave:</strong> ${esc((meta.keywords || []).join(", ") || "Nenhuma")}</p><p><strong>Edições (${meta.printings?.length || 0}):</strong> ${esc((meta.printings || []).map((code) => (sets.has(code) ? `${code} — ${sets.get(code)}` : code)).join("; ") || "Não informadas")}</p><p class="detail-caption">As edições indicam publicações da carta, sem distinguir suas cópias físicas.</p></div></details>`;
    }

    return { mount, summary, details };
})();
