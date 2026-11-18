import { AppDataSource } from "../config/dataSource";

import { User } from "../entities/User";
import { Card } from "../entities/Cards";
import { Deck } from "../entities/Deck";
import { DeckCard } from "../entities/DeckCard";
import { UserCard } from "../entities/UserCard";

export const repositories = {
    get users() {
        return AppDataSource.getRepository(User);
    },
    get cards() {
        return AppDataSource.getRepository(Card);
    },
    get decks() {
        return AppDataSource.getRepository(Deck);
    },
    get deckCards() {
        return AppDataSource.getRepository(DeckCard);
    },
    get userCards() {
        return AppDataSource.getRepository(UserCard);
    }
};
