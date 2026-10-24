import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto"
import { normalizePassword } from "@/lib/security/password-policy"

/** Genera un hash seguro de contraseña usando scrypt + salt aleatorio. */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt ?? randomBytes(16).toString("hex")
  // NIST SP 800-63B-4: normalizar a NFC antes del hash; la contraseña nunca se trunca.
  const hash = scryptSync(normalizePassword(password), useSalt, 64).toString("hex")
  return { hash, salt: useSalt }
}

/** Verifica una contraseña contra un hash almacenado en tiempo constante. */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = scryptSync(normalizePassword(password), salt, 64)
  const stored = Buffer.from(hash, "hex")
  if (derived.length !== stored.length) return false
  return timingSafeEqual(derived, stored)
}

const SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret-cambiar-en-produccion"

/** Firma un valor (id de usuario) para usarlo como cookie de sesión. */
export function signSession(userId: string): string {
  const payload = Buffer.from(userId).toString("base64url")
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

/** Verifica y decodifica una cookie de sesión firmada. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return Buffer.from(payload, "base64url").toString("utf8")
}
