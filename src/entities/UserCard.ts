import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique, Check } from "typeorm";

import { Card } from "./Cards";
import { User } from "./User";

@Entity("user_cards")
@Unique(["userId", "cardId"])
@Check('"quantity" > 0')
export class UserCard {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "uuid" })
    cardId: string;

    @Column({ type: "integer" })
    quantity: number;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    owner: User;

    @ManyToOne(() => Card, { onDelete: "CASCADE" })
    @JoinColumn({ name: "cardId" })
    card: Card;
}
