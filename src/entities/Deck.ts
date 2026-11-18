import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Check } from "typeorm";

import { User } from "./User";
import { Card } from "./Cards";

export const FORMATS = ["commander", "pauper", "standard", "free"] as const;

@Entity("decks")
@Check('"powerLevel" IS NULL OR "powerLevel" BETWEEN 1 AND 10')
export class Deck {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 100 })
    name: string;

    @Column({ type: "enum", enum: [...FORMATS] })
    format: (typeof FORMATS)[number];

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "uuid", nullable: true })
    coverCardId: string | null;

    @Column({ type: "smallint", nullable: true })
    powerLevel: number | null;

    @ManyToOne(() => Card, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "coverCardId" })
    coverCard: Card | null;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
