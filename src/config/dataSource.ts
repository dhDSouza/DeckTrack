import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";

import { User } from "../entities/User";
import { Card } from "../entities/Cards";
import { Deck } from "../entities/Deck";
import { DeckCard } from "../entities/DeckCard";
import { UserCard } from "../entities/UserCard";
import { DeckOwnedCard } from "../entities/DeckOwnedCard";
import { Activity } from "../entities/Activity";
import { DeckVersion } from "../entities/DeckVersion";

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5433),
    username: process.env.DB_USERNAME ?? "decktrack",
    password: process.env.DB_PASSWORD ?? "decktrack_dev",
    database: process.env.DB_NAME ?? "decktrack",
    synchronize: process.env.NODE_ENV !== "production",
    entities: [User, Card, Deck, DeckCard, UserCard, DeckOwnedCard, Activity, DeckVersion]
});
