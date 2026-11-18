window.DeckStats = (() => {
    const colors = [
        { key: "W", label: "Branco", color: "#eee1ac" },
        { key: "U", label: "Azul", color: "#8dc1dc" },
        { key: "B", label: "Preto", color: "#b1a2c1" },
        { key: "R", label: "Vermelho", color: "#e99c81" },
        { key: "G", label: "Verde", color: "#90bb86" },
        { key: "C", label: "Incolor", color: "#b6bcb5" },
        { key: "M", label: "Multicolor", color: "#d6bd78" },
        { key: "?", label: "Sem dados", color: "#48534a" }
    ];
    const indicators = [
        { key: "mana", label: "Produção de mana fora dos terrenos", pattern: /\badd\s+(?:\{[^}]+\})+/i },
        {
            key: "draw",
            label: "Texto de compra de cartas",
            pattern: /\bdraw\s+(?:an?|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+|that many)\s+cards?\b/i
        },
        { key: "search", label: "Busca no próprio grimório", pattern: /\bsearch your library\b/i },
        {
            key: "interaction",
            label: "Remoção ou anulação pontual",
            pattern:
                /\b(?:destroy|exile) target (?:artifact|creature|enchantment|permanent|planeswalker|land|nonland)\b|\bcounter target (?:spell|activated|triggered)\b/i
        },
        { key: "extraTurns", label: "Texto de turnos extras", pattern: /\btake (?:an?|two|three|\d+) extra turns?\b/i }
    ];
    const number = (value, digits = 0) => value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
    const esc = (value) =>
        String(value ?? "").replace(
            /[&<>"']/g,
            (character) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                })[character]
        );

    function cardType(item) {
        const metadata = item.card.metadata || {};
        const front = metadata.faces?.[0]?.type || metadata.type?.split("//")[0];

        if (front?.trim()) {
            return /\bLand\b/.test(front) ? "land" : "spell";
        }

        if (metadata.types?.length) {
            return metadata.types.includes("Land") ? "land" : "spell";
        }

        return "unknown";
    }

    function compute(deck, options = {}) {
        const cards = deck.cards || [];
        const scoped = cards.filter(
            (item) => !(options.excludeCommanders && deck.format === "commander" && item.isCommander)
        );
        const curve = new Map(Array.from({ length: 7 }, (_, value) => [value, 0]));
        const distribution = new Map(colors.map((color) => [color.key, 0]));
        const identity = new Set();
        let total = 0,
            lands = 0,
            commanderCopies = 0,
            manaCopies = 0,
            manaSum = 0;
        let unknownMana = 0,
            unknownTypes = 0,
            highMana = 0,
            variableMana = 0,
            colorCopies = 0,
            unknownIdentity = 0;

        for (const item of cards) {
            total += item.quantity;
            if (cardType(item) === "land") {
                lands += item.quantity;
            }
            if (deck.format === "commander" && item.isCommander) {
                commanderCopies += item.quantity;
            }
            const cardIdentity = item.card.metadata?.colorIdentity;
            if (!Array.isArray(cardIdentity)) {
                unknownIdentity += item.quantity;
            }
            for (const color of cardIdentity || []) {
                if ("WUBRG".includes(color) && color.length === 1) {
                    identity.add(color);
                }
            }
        }

        for (const item of scoped) {
            const metadata = item.card.metadata || {},
                type = cardType(item);

            if (type === "unknown") {
                unknownTypes += item.quantity;
            } else if (type === "spell") {
                const value = metadata.manaValue;
                if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
                    manaCopies += item.quantity;
                    manaSum += value * item.quantity;
                    if (value >= 7) {
                        highMana += item.quantity;
                    } else {
                        curve.set(value, (curve.get(value) || 0) + item.quantity);
                    }
                    if (/\{X\}/i.test(metadata.faces?.[0]?.manaCost || metadata.manaCost || "")) {
                        variableMana += item.quantity;
                    }
                } else {
                    unknownMana += item.quantity;
                }
            }

            if (!options.includeLandsInColors && type === "land") {
                continue;
            }

            const values = metadata[options.colorField === "colorIdentity" ? "colorIdentity" : "colors"];
            const valid =
                Array.isArray(values) &&
                values.every((color) => typeof color === "string" && color.length === 1 && "WUBRG".includes(color));
            const unique = valid ? [...new Set(values)] : [];
            const key = !valid ? "?" : !unique.length ? "C" : unique.length > 1 ? "M" : unique[0];
            distribution.set(key, distribution.get(key) + item.quantity);
            colorCopies += item.quantity;
        }

        const signals = indicators.map((indicator) => {
            const matches = cards.flatMap((item) => {
                if (indicator.key === "mana" && cardType(item) === "land") {
                    return [];
                }
                const match = (item.card.metadata?.text || "").match(indicator.pattern);
                return match ? [{ name: item.card.name, quantity: item.quantity, evidence: match[0] }] : [];
            });
            return {
                key: indicator.key,
                label: indicator.label,
                cards: matches,
                copies: matches.reduce((sum, card) => sum + card.quantity, 0)
            };
        });

        return {
            total,
            unique: cards.length,
            lands,
            commanderCopies,
            categories: window.DeckPage.group(cards, deck.format).map((category) => ({
                key: category.key,
                label: category.label,
                copies: category.cards.reduce((sum, item) => sum + item.quantity, 0)
            })),
            curve: [...curve.entries()]
                .sort(([a], [b]) => a - b)
                .map(([value, copies]) => ({ label: number(value, 2), copies }))
                .concat({ label: "7+", copies: highMana }),
            averageMana: manaCopies ? manaSum / manaCopies : null,
            manaCopies,
            unknownMana,
            unknownTypes,
            variableMana,
            colorCopies,
            colors: colors.map((color) => ({ ...color, copies: distribution.get(color.key) })),
            identity: colors.filter((color) => identity.has(color.key)),
            unknownIdentity,
            signals,
            rulesCoverage: cards.reduce((sum, item) => sum + (item.card.metadata?.text?.trim() ? item.quantity : 0), 0)
        };
    }

    function suggestPower(deck) {
        const stats = compute(deck);
        const unavailable = (reason) => ({ value: null, reason, factors: [], coverage: 0 });

        if (deck.format !== "commander") {
            return unavailable("A sugestão experimental está disponível para decks Commander.");
        }
        if (stats.total !== 100) {
            return unavailable("Complete as 100 cartas do deck para gerar uma sugestão.");
        }

        const covered = deck.cards.reduce((sum, item) => {
            const metadata = item.card.metadata || {};
            const type = cardType(item);
            const known =
                type === "land" ||
                (type === "spell" &&
                    typeof metadata.manaValue === "number" &&
                    Number.isFinite(metadata.manaValue) &&
                    metadata.manaValue >= 0 &&
                    typeof metadata.text === "string");
            return sum + (known ? item.quantity : 0);
        }, 0);
        const coverage = covered / stats.total;

        if (coverage < 0.8 || stats.averageMana === null) {
            return {
                ...unavailable(
                    "Metadados insuficientes: é necessário conhecer pelo menos 80% das cópias e a curva não terreno."
                ),
                coverage
            };
        }

        const count = (key) => stats.signals.find((signal) => signal.key === key)?.copies || 0;
        const factors = [
            {
                label: "Ponto de partida da heurística",
                delta: 3,
                detail: "Base fixa. Pesos próprios do DeckTrack, sem calibração por partidas; não é uma classificação oficial."
            }
        ];
        factors.push({
            label: "Curva de mana",
            delta: stats.averageMana <= 2.5 ? 1 : stats.averageMana <= 3.5 ? 0.5 : stats.averageMana >= 4.5 ? -0.5 : 0,
            detail: `Valor de mana médio não terreno: ${number(stats.averageMana, 2)}.`
        });
        for (const [key, label, target, weight] of [
            ["mana", "Produção de mana fora dos terrenos", 10, 0.75],
            ["draw", "Texto de compra", 10, 0.75],
            ["interaction", "Remoção e anulação pontual", 10, 0.75],
            ["search", "Busca no grimório (inclui terrenos)", 6, 0.75],
            ["extraTurns", "Texto de turnos extras", 2, 0.5]
        ]) {
            factors.push({
                label,
                delta: Math.min(count(key) / target, 1) * weight,
                detail: `${count(key)} cópias identificadas por texto; contribuição limitada a ${number(weight, 2)} ponto(s).`
            });
        }
        const landRatio = stats.lands / stats.total;
        factors.push({
            label: "Proporção de terrenos",
            delta: landRatio < 0.28 || landRatio > 0.46 ? -0.75 : 0,
            detail: `${stats.lands}% de terrenos na primeira face; a heurística desconta 0,75 fora do intervalo 28–46%. Estratégias específicas podem contrariar isso.`
        });
        const raw = factors.reduce((sum, factor) => sum + factor.delta, 0);
        const value = Math.max(2, Math.min(8, Math.round(raw)));

        return { value, raw, factors, coverage, lower: Math.max(1, value - 1), upper: Math.min(10, value + 1) };
    }

    function render(deck, options = {}) {
        const stats = compute(deck, options);
        const suggestion = suggestPower(deck);
        const selectedPower = Object.hasOwn(options, "powerDraft")
            ? options.powerDraft
            : (deck.powerLevel ?? suggestion.value);
        const percent = (count, denominator) => (denominator ? (count / denominator) * 100 : 0);
        const maximum = Math.max(1, ...stats.curve.map((bucket) => bucket.copies));
        let stop = 0;
        const segments = stats.colors
            .filter((color) => color.copies)
            .map((color) => {
                const start = stop;
                stop += percent(color.copies, stats.colorCopies);
                return `${color.color} ${start}% ${stop}%`;
            });
        const colorDescription = stats.colors.map((color) => `${color.label}: ${color.copies}`).join("; ");
        const curveDescription = stats.curve.map((bucket) => `${bucket.label}: ${bucket.copies}`).join("; ");

        return `
            <div class="deck-stats-metrics">
                <article><small>Cópias no deck</small><strong>${number(stats.total)}</strong><span>${number(stats.unique)} cartas diferentes</span></article>
                <article><small>Terrenos na primeira face</small><strong>${number(stats.lands)}</strong><span>${number(percent(stats.lands, stats.total), 1)}% do deck</span></article>
                <article><small>Valor de mana médio</small><strong>${stats.averageMana === null ? "—" : number(stats.averageMana, 2)}</strong><span>${number(stats.manaCopies)} cópias não terreno com dados</span></article>
                <article><small>Identidade do deck</small><strong class="stats-color-identity">${stats.identity.length ? stats.identity.map((color) => `<span class="color-dot color-${color.key}" title="${color.label}">${color.key}</span>`).join("") : stats.total && !stats.unknownIdentity ? '<span class="color-dot" title="Incolor">C</span>' : "—"}</strong><span>${deck.format === "commander" ? `${stats.commanderCopies} cópias marcadas como comandante` : "União das identidades conhecidas"}${stats.unknownIdentity ? ` · ${stats.unknownIdentity} cópias sem dados de identidade` : ""}</span></article>
            </div>
            <div class="deck-stats-charts">
                <section class="stats-panel"><h3>Cartas por categoria</h3><p class="detail-caption">Deck inteiro, contando cada cópia uma vez. Segue o agrupamento da lista, pela união dos tipos de todas as faces; comandantes têm categoria própria.</p><div class="stats-category-bars">${stats.categories.map((category) => `<div class="stats-category-row"><span>${esc(category.label)}</span><div class="stats-bar-track"><div style="width:${percent(category.copies, stats.total)}%"></div></div><strong>${category.copies}</strong><small>${number(percent(category.copies, stats.total), 1)}%</small></div>`).join("") || '<p class="detail-caption">Adicione cartas para ver as categorias.</p>'}</div></section>
                <section class="stats-panel"><h3>Curva de mana</h3><p class="detail-caption">Sem terrenos da primeira face${options.excludeCommanders ? " e sem comandantes" : ""}.</p><div class="stats-mana-curve" role="img" aria-label="${esc(`Curva de mana. ${curveDescription}`)}">${stats.curve.map((bucket) => `<div class="stats-mana-column"><strong>${bucket.copies}</strong><div class="stats-mana-track"><div style="height:${(bucket.copies / maximum) * 100}%"></div></div><span>${bucket.label}</span></div>`).join("")}</div><p class="detail-caption">Valor de mana da primeira face. Custos com X usam o valor do catálogo (${stats.variableMana} cópias). ${stats.unknownMana} cópias sem valor de mana e ${stats.unknownTypes} sem tipo foram excluídas.</p></section>
                <section class="stats-panel"><h3>${options.colorField === "colorIdentity" ? "Distribuição por identidade" : "Distribuição por cor"}</h3><p class="detail-caption">${stats.colorCopies} cópias${options.includeLandsInColors ? ", incluindo terrenos" : ", sem terrenos conhecidos"}${options.excludeCommanders ? ", sem comandantes" : ""}.</p><div class="stats-color-chart"><div class="stats-color-donut" style="background:${segments.length ? `conic-gradient(${segments.join(",")})` : "var(--line)"}" role="img" aria-label="${esc(colorDescription)}"><span>${stats.colorCopies}<small>cópias</small></span></div><ul class="stats-color-legend">${
                    stats.colors
                        .filter((color) => color.copies)
                        .map(
                            (color) =>
                                `<li><span style="background:${color.color}" aria-hidden="true"></span>${color.label}<strong>${color.copies}</strong><small>${number(percent(color.copies, stats.colorCopies), 1)}%</small></li>`
                        )
                        .join("") || "<li>Sem cartas neste recorte.</li>"
                }</ul></div><p class="detail-caption">Multicolor conta uma vez. “Sem dados” não é incolor. Cor usa a união das faces; identidade também considera os símbolos nas regras.</p></section>
                <section class="stats-panel stats-power"><h3>Power level e perfil do deck</h3><div class="stats-power-suggestion">${suggestion.value !== null ? `<small>SUGESTÃO EXPERIMENTAL · HEURÍSTICA V1</small><strong>${suggestion.value}<span>/10</span></strong><p>Faixa indicativa: ${suggestion.lower}–${suggestion.upper}. Confiança baixa; não é intervalo estatístico.</p><button type="button" class="secondary stats-use-suggestion">Usar sugestão</button><details><summary>Como a nota foi sugerida</summary><ul>${suggestion.factors.map((factor) => `<li><strong>${esc(factor.label)}: ${factor.delta >= 0 ? "+" : ""}${number(factor.delta, 2)}</strong><small>${esc(factor.detail)}</small></li>`).join("")}</ul><p class="detail-caption">${number(suggestion.coverage * 100)}% das cópias com dados suficientes. Soma ${number(suggestion.raw, 2)}, arredondada e limitada a 2–8. A heurística não atribui 9 ou 10 e não identifica cEDH.</p></details>` : `<p>${esc(suggestion.reason)}</p>`}</div><p class="detail-caption">A sugestão usa curva, proporção de terrenos e padrões de texto. Pode errar: não mede combos, sinergia, eficiência ou turno de vitória. Ajuste a nota para a experiência real da sua mesa.</p><form class="stats-power-form"><label>Power level informado<select name="powerLevel"><option value="">Não informado</option>${Array.from(
                    { length: 10 },
                    (_, index) => index + 1
                )
                    .map(
                        (value) =>
                            `<option value="${value}" ${selectedPower === value ? "selected" : ""}>${value}/10</option>`
                    )
                    .join(
                        ""
                    )}</select></label><button class="secondary" type="submit">Salvar nota</button></form><p class="stats-power-status detail-caption" role="status">${deck.powerLevel == null && suggestion.value !== null ? "Sugestão preenchida no campo. Ajuste e salve quando quiser registrar." : deck.powerLevel != null ? `Nota salva: ${deck.powerLevel}/10. A sugestão não substitui sua avaliação.` : ""}</p><div class="stats-signals">${stats.signals.map((signal) => `<details><summary><span>${signal.label}</span><strong>${signal.copies}</strong></summary>${signal.cards.length ? `<ul>${signal.cards.map((card) => `<li>${card.quantity}× ${esc(card.name)}<small>Trecho: ${esc(card.evidence)}</small></li>`).join("")}</ul>` : '<p class="detail-caption">Nenhum padrão encontrado.</p>'}</details>`).join("")}</div><p class="detail-caption">Indicadores por padrões no texto em inglês; podem ter falsos positivos e omissões. Uma carta pode aparecer em vários indicadores. Não detectam combos, sinergias, velocidade de vitória ou eficiência. ${stats.rulesCoverage}/${stats.total} cópias têm texto de regras não vazio; cartas sem texto podem ser válidas.</p><a class="text-button stats-official-link" href="https://magic.wizards.com/en/formats/commander#Brackets" target="_blank" rel="noopener noreferrer">Consultar Commander Brackets oficiais ↗</a><p class="detail-caption">A nota 1–10 não equivale aos brackets oficiais e os indicadores não atribuem um bracket.</p></section>
            </div>`;
    }

    function mount(root, deck, { request, onSaved } = {}) {
        root.innerHTML = `<details class="deck-statistics" open><summary>Estatísticas do deck</summary><p class="detail-caption">Análise do deck inteiro. Os filtros da lista de cartas não alteram este painel.</p><div class="stats-controls"><label><input type="checkbox" data-stats-commanders> Excluir comandantes da curva e das cores</label><label><input type="checkbox" data-stats-lands> Incluir terrenos nas cores</label><label>Cores por<select data-stats-color-field><option value="colors">Cor da carta</option><option value="colorIdentity">Identidade de cor</option></select></label></div><div class="stats-dashboard"></div></details>`;
        const dashboard = root.querySelector(".stats-dashboard");
        let powerDraft = deck.powerLevel ?? suggestPower(deck).value;

        function update() {
            const existing = dashboard.innerHTML ? dashboard.querySelector(".stats-power-form") : null;
            if (existing) {
                powerDraft = existing.elements.powerLevel.value ? Number(existing.elements.powerLevel.value) : null;
            }
            dashboard.innerHTML = render(deck, {
                excludeCommanders: root.querySelector("[data-stats-commanders]").checked,
                includeLandsInColors: root.querySelector("[data-stats-lands]").checked,
                colorField: root.querySelector("[data-stats-color-field]").value,
                powerDraft
            });

            const useSuggestion = dashboard.querySelector(".stats-use-suggestion");
            if (useSuggestion && suggestPower(deck).value !== null) {
                useSuggestion.onclick = () => {
                    powerDraft = suggestPower(deck).value;
                    dashboard.querySelector(".stats-power-form").elements.powerLevel.value = String(powerDraft);
                    dashboard.querySelector(".stats-power-status").textContent =
                        "Sugestão aplicada ao campo. Clique em Salvar nota para registrar.";
                };
            }

            dashboard.querySelector(".stats-power-form").onsubmit = async (event) => {
                event.preventDefault();
                const form = event.target;
                const button = event.submitter;
                const status = dashboard.querySelector(".stats-power-status");
                const value = form.elements.powerLevel.value;
                button.disabled = true;
                status.textContent = "Salvando…";

                try {
                    const saved = await request(`/decks/${deck.id}`, {
                        method: "PATCH",
                        body: { powerLevel: value ? Number(value) : null }
                    });
                    deck.powerLevel = saved.powerLevel;
                    powerDraft = saved.powerLevel;
                    status.textContent = "Nota salva e registrada no histórico.";
                    if (onSaved) {
                        onSaved(saved);
                    }
                } catch (error) {
                    status.textContent = error.message;
                } finally {
                    button.disabled = false;
                }
            };
        }

        root.querySelectorAll("[data-stats-commanders], [data-stats-lands], [data-stats-color-field]").forEach(
            (input) => {
                input.onchange = update;
            }
        );
        update();
    }

    return { compute, render, mount, cardType, suggestPower };
})();
