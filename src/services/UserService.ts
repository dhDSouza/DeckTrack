import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { repositories as db } from "../repositories";
import { AppError } from "../errors/AppError";
import { jwtSecret } from "../config/auth";

import { User } from "../entities/User";

const publicUser = (user: User) => ({ id: user.id, username: user.username, email: user.email });

export class UserService {
    async register(input: { username: string; email: string; password: string }) {
        return publicUser(
            await db.users.save(db.users.create({ ...input, password: await bcrypt.hash(input.password, 12) }))
        );
    }

    async login(email: string, password: string) {
        const user = await db.users
            .createQueryBuilder("user")
            .addSelect("user.password")
            .where("user.email = :email", { email })
            .getOne();

        if (!user || !(await bcrypt.compare(password, user.password))) {
            throw new AppError(401, "Credenciais inválidas.");
        }

        return {
            user: publicUser(user),
            token: jwt.sign({}, jwtSecret(), { subject: user.id, expiresIn: "1d", algorithm: "HS256" })
        };
    }

    async me(id: string) {
        const user = await db.users.findOneBy({ id });

        if (!user) {
            throw new AppError(401, "Usuário não encontrado.");
        }

        return publicUser(user);
    }
}
