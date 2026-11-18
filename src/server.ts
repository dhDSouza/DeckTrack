import "dotenv/config";

import { app } from "./app";
import { AppDataSource } from "./config/dataSource";
import { jwtSecret } from "./config/auth";
import { seedCatalog } from "./catalog";
import { cardImages } from "./services/CardImages";

async function start() {
    jwtSecret();
    await AppDataSource.initialize();
    await seedCatalog();
    await cardImages.ready();
    app.listen(process.env.PORT || 3000, () => console.log("DeckTrack iniciado."));
}

start().catch(async (error) => {
    console.error("Falha ao iniciar:", error);

    if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
    }

    process.exitCode = 1;
});
