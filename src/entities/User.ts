import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("users")
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 25, nullable: false, unique: true })
    username: string;

    @Column({ type: "varchar", length: 255, nullable: false, select: false })
    password: string;

    @Column({ type: "varchar", length: 100, nullable: false, unique: true })
    email: string;
}
