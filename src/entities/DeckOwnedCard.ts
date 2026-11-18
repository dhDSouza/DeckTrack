import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique, Check } from "typeorm";

import { Deck } from "./Deck";
import { Card } from "./Cards";

// Retained even when a card leaves the deck: removing a card does not mean losing it.
@Entity("deck_owned_cards")
@Unique(["deckId", "cardId"])
@Check('"quantity" > 0')
export class DeckOwnedCard {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    deckId: string;

    @Column({ type: "uuid" })
    cardId: string;

    @Column({ type: "integer" })
    quantity: number;

    @ManyToOne(() => Deck, { onDelete: "CASCADE" })
    @JoinColumn({ name: "deckId" })
    deck: Deck;

    @ManyToOne(() => Card, { onDelete: "CASCADE" })
    @JoinColumn({ name: "cardId" })
    card: Card;
}
