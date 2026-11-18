import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

export type CardMetadata = {
    colors?: string[];
    colorIdentity?: string[];
    types?: string[];
    type?: string;
    text?: string;
    manaCost?: string;
    manaValue?: number | null;
    keywords?: string[];
    printings?: string[];
    legalities?: Record<string, string>;
    faces?: { name: string; type: string; text: string; manaCost: string; manaValue: number | null; side: string }[];
};

@Entity("cards")
export class Card {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 200 })
    name: string;

    @Column({ type: "varchar", length: 100, nullable: true, unique: true })
    externalId: string | null;

    @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
    metadata: CardMetadata;
}
