import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
    Index
} from "typeorm";

import { User } from "./User";

@Entity("activities")
@Unique(["userId", "operationId"])
@Index(["userId", "createdAt"])
export class Activity {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "uuid", nullable: true })
    operationId: string | null;

    @Column({ type: "varchar", length: 60 })
    action: string;

    @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
    deckIds: string[];

    @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
    cardIds: string[];

    @Column({ type: "jsonb" })
    payload: Record<string, any>;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
