import { compare, hash } from 'bcryptjs';

/**
 * bcryptjs es JavaScript puro, así que la variante síncrona bloquearía el event loop
 * durante todo el hasheo. Acá solo se usa la API async.
 */

// Hash de descarte con el que se compara cuando el email no existe, para que un login
// fallido tarde lo mismo exista o no el usuario y no se pueda enumerar la base.
// Tiene que ser un hash bcrypt válido: contra uno mal formado, compare() corta enseguida
// y el trabajo de igualar los tiempos no se hace.
const DUMMY_HASH = '$2b$10$4wfpEu5JuU2OmrYouCqNzOHiCcNSywzYfUbUUfnKGt8GE09Pc9uiG';

export function hashPassword(plain: string, saltRounds: number): Promise<string> {
  return hash(plain, saltRounds);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}

/** Quema el mismo tiempo que una verificación real, sin revelar que el usuario no existe. */
export async function burnPasswordComparison(plain: string): Promise<void> {
  await compare(plain, DUMMY_HASH).catch(() => false);
}
