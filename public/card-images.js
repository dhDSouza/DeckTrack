window.CardImageUI = (() => {
    const esc = (value) =>
        String(value ?? "").replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        );
    const registry = new Map();

    function register(card) {
        if (card.imagery) {
            if (registry.size >= 4000) {
                registry.delete(registry.keys().next().value);
            }

            registry.set(card.id, card.imagery);
        }
    }

    function url(id, size = "small", face = 0) {
        const images = registry.get(id)?.faces?.[face]?.images;
        const keys =
            size === "small"
                ? ["small", "thumb", "grid", "normal", "jpeg", "large"]
                : size === "art_crop"
                  ? ["art_crop", "art", "display", "normal", "jpeg"]
                  : ["normal", "display", "jpeg", "large", "small"];

        const direct = keys
            .map((key) => images?.[key])
            .find((value) => {
                try {
                    const target = new URL(value);

                    return (
                        target.protocol === "https:" &&
                        target.hostname === "cards.scryfall.io" &&
                        !target.port &&
                        !target.username &&
                        !target.password
                    );
                } catch {
                    return false;
                }
            });

        return direct || `/media/cards/${encodeURIComponent(id)}/${size}/${face}`;
    }

    function thumbnail(card, size = "small", action = "image") {
        register(card);

        const attribute = action === "details" ? "data-card-details" : "data-image-card";
        const label = action === "details" ? "Ver detalhes de" : "Ampliar imagem de";

        return `<button type="button" class="card-thumbnail" ${attribute}="${esc(card.id)}" data-image-name="${esc(card.name)}" aria-label="${label} ${esc(card.name)}"><img src="${esc(url(card.id, size))}" alt="${esc(card.name)}" width="74" height="104" loading="lazy" decoding="async"></button>`;
    }

    function art(card) {
        if (!card) {
            return "";
        }

        register(card);

        return `<img class="cover-art" src="${esc(url(card.id, "art_crop"))}" alt="" loading="lazy" decoding="async"><img class="cover-full-card" src="${esc(url(card.id))}" alt="${esc(card.name)}" loading="lazy" decoding="async"><span class="cover-caption">${esc(card.name)}</span>`;
    }

    function hero(card) {
        if (!card) {
            return "";
        }

        register(card);

        return `<section class="deck-showcase"><img class="cover-art" src="${esc(url(card.id, "art_crop"))}" alt="" decoding="async"><div class="showcase-text"><span class="eyebrow">CARTA EM DESTAQUE</span><h3>${esc(card.name)}</h3><small>Imagem via Scryfall · Arte © Wizards of the Coast</small></div>${thumbnail(card)}</section>`;
    }

    document.addEventListener(
        "error",
        (event) => {
            const image = event.target;
            const src = image.tagName === "IMG" ? image.getAttribute("src") : "";

            if (src?.startsWith("/media/cards/") || src?.startsWith("https://cards.scryfall.io/")) {
                image.src = "/card-placeholder.svg";
                image.classList.add("image-unavailable");
                image.title = "Imagem indisponível no momento";
            }
        },
        true
    );

    const viewer = document.createElement("dialog");

    viewer.className = "image-viewer";
    viewer.innerHTML =
        '<div class="image-viewer-heading"><h2></h2><button type="button" class="icon-button" aria-label="Fechar imagem">×</button></div><img class="large-card-image" alt=""><div class="image-viewer-actions"><button type="button" class="secondary flip-image" hidden>Ver outra face</button><a target="_blank" rel="noopener noreferrer" class="secondary scryfall-link" href="https://scryfall.com">Ver no Scryfall ↗</a></div><p class="detail-caption image-credit">Imagens via Scryfall · Arte © Wizards of the Coast</p>';
    document.body.append(viewer);

    viewer.querySelector(".icon-button").onclick = () => viewer.close();

    viewer.addEventListener("click", (event) => {
        if (event.target === viewer) {
            const rect = viewer.getBoundingClientRect();

            if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
            ) {
                viewer.close();
            }
        }
    });

    let request = 0;

    document.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-image-card]");

        if (!target) {
            return;
        }

        const current = ++request,
            id = target.dataset.imageCard,
            name = target.dataset.imageName;
        let face = 0,
            faces = [];
        const image = viewer.querySelector(".large-card-image"),
            flip = viewer.querySelector(".flip-image"),
            link = viewer.querySelector(".scryfall-link");

        viewer.querySelector("h2").textContent = name;
        image.alt = name;
        image.src = url(id, "normal");
        image.classList.remove("image-unavailable");
        flip.hidden = true;
        flip.onclick = null;
        link.href = `https://scryfall.com/search?${new URLSearchParams({ q: `!"${name}"` })}`;
        viewer.querySelector(".image-credit").textContent = "Imagens via Scryfall · Arte © Wizards of the Coast";

        if (!viewer.open) {
            viewer.showModal();
        }

        function showFace() {
            const info = faces[face];

            image.src = url(id, "normal", face);
            image.alt = info.name;
            image.classList.remove("image-unavailable");
            viewer.querySelector("h2").textContent = info.name;
            viewer.querySelector(".image-credit").textContent =
                `${info.artist ? `Arte: ${info.artist} · ` : ""}© Wizards of the Coast · Imagem via Scryfall`;
        }

        try {
            let info = registry.get(id);

            if (!info) {
                const response = await fetch(`/media/cards/${encodeURIComponent(id)}/info`);

                if (!response.ok) {
                    return;
                }

                info = await response.json();
                registry.set(id, info);
            }
            if (current !== request || !viewer.open) {
                return;
            }

            faces = info.faces;
            link.href = info.url;

            if (faces.length) {
                showFace();
                flip.hidden = faces.length < 2;

                flip.onclick = () => {
                    face = (face + 1) % faces.length;
                    showFace();
                };
            }
        } catch {}
    });

    const footer = document.querySelector("footer");

    if (footer) {
        footer.insertAdjacentHTML(
            "beforeend",
            '<a class="image-attribution" href="https://scryfall.com" target="_blank" rel="noopener noreferrer">Imagens: Scryfall · Arte © Wizards of the Coast</a>'
        );
    }

    return { url, thumbnail, art, hero };
})();
