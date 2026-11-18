import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique, Check } from "typeorm";

import { Card } from "./Cards";
import { Deck } from "./Deck";

@Entity("deck_cards")
@Unique(["deckId", "cardId"])
@Check('"quantity" > 0')
export class DeckCard {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    deckId: string;

    @Column({ type: "uuid" })
    cardId: string;

    @Column({ type: "integer" })
    quantity: number;

    @Column({ type: "boolean", default: false })
    isCommander: boolean;

    @ManyToOne(() => Deck, { onDelete: "CASCADE" })
    @JoinColumn({ name: "deckId" })
    owner: Deck;

    @ManyToOne(() => Card, { onDelete: "CASCADE" })
    @JoinColumn({ name: "cardId" })
    card: Card;
}
