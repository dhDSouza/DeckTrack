function safeUrl(value) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            url.hostname === "cards.scryfall.io" &&
            !url.port &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}

function selectImages(images = {}) {
    const output = {};

    for (const [size, keys] of Object.entries({
        small: ["small", "thumb", "grid", "normal", "jpeg"],
        normal: ["normal", "display", "jpeg", "large", "grid"],
        art_crop: ["art_crop", "art", "display", "normal", "jpeg"]
    })) {
        const url = keys.map((key) => images[key]).find((value) => typeof value === "string" && safeUrl(value));

        if (url) {
            output[size] = url;
        }
    }

    return output;
}

function imagery(data) {
    const faces = (data.card_faces?.some((face) => face.image_uris) ? data.card_faces : [data]).map((face) => ({
        name: face.name || data.name,
        artist: face.artist || data.artist || "",
        images: selectImages(face.image_uris)
    }));

    return {
        name: data.name,
        url:
            typeof data.scryfall_uri === "string" && data.scryfall_uri.startsWith("https://scryfall.com/")
                ? data.scryfall_uri
                : "https://scryfall.com",
        faces
    };
}

module.exports = { imagery, selectImages };
