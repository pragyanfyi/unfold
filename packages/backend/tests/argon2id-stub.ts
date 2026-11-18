// Test-only stand-in for `password-hash-wasm/argon2id`, whose wasm cannot load under Vitest.
// It is not a hash and never runs outside the unit tests (see vitest.config.ts).
export async function hashPassword(input: string | { password: string }): Promise<string> {
  return `stub$${typeof input === "string" ? input : input.password}`;
}

export async function verifyPassword(
  input: string | { password: string; hash: string },
  hash?: string,
): Promise<boolean> {
  const [password, stored] =
    typeof input === "string" ? [input, hash] : [input.password, input.hash];
  return stored === `stub$${password}`;
}
