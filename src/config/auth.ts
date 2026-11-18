export function jwtSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("JWT_SECRET deve ter pelo menos 32 caracteres.");
    }

    return secret;
}
