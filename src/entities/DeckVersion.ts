import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Unique } from "typeorm";

import { User } from "./User";

@Entity("deck_versions")
@Unique(["userId", "deckId", "tag"])
export class DeckVersion {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    // No deck FK: saved versions survive deletion of the deck.
    @Column({ type: "uuid" })
    deckId: string;

    @Column({ type: "varchar", length: 40 })
    tag: string;

    @Column({ type: "varchar", length: 500 })
    note: string;

    @Column({ type: "integer" })
    changeCount: number;

    @Column({ type: "jsonb" })
    snapshot: Record<string, any>;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
