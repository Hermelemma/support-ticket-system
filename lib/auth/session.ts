import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { sql, rowToUser, randomUUID } from "@/lib/db/sql"
import { hashPassword, verifyPassword, signSession, verifySession } from "@/lib/crypto"
import { validatePassword } from "@/lib/security/password-policy"
import { validateEmail } from "@/lib/security/email-policy"
import type { PublicUser, Role, User } from "@/lib/types"

const COOKIE_NAME = "ticket_session"
const MAX_AGE = 60 * 60 * 24 * 7 // 7 días

/**
 * Límite de intentos fallidos (NIST SP 800-63B-4 §3.2.2): como máximo 100
 * intentos fallidos consecutivos antes de bloquear la cuenta. Además, a partir
 * de THROTTLE_AFTER fallos se exige una espera entre intentos.
 */
export const MAX_FAILED_LOGINS = 100
const THROTTLE_AFTER = 5
const THROTTLE_SECONDS = 30

function toPublic(u: User): PublicUser {
  const { passwordHash, salt, ...rest } = u
  return rest
}

async function findByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase()
  const rows = (await sql`SELECT * FROM users WHERE lower(email) = ${normalized} LIMIT 1`) as Record<string, unknown>[]
  return rows[0] ? rowToUser(rows[0]) : null
}

async function findById(id: string): Promise<User | null> {
  const rows = (await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`) as Record<string, unknown>[]
  return rows[0] ? rowToUser(rows[0]) : null
}

/** Devuelve el usuario autenticado actual o null. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  const userId = verifySession(token)
  if (!userId) return null
  const user = await findById(userId)
  if (!user || !user.active) return null
  return toPublic(user)
}

/** Exige un usuario autenticado; lanza si no hay sesión. */
export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error("NO_AUTH")
  return user
}

/**
 * Exige un usuario autenticado en un Server Component y redirige a /ingresar
 * si no hay sesión. Necesario porque el redirect del layout no impide que las
 * páginas hijas se rendericen en paralelo.
 */
export async function requireUserOrRedirect(): Promise<PublicUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/ingresar")
  return user
}

/** Exige que el usuario tenga uno de los roles permitidos. */
export async function requireRole(...roles: Role[]): Promise<PublicUser> {
  const user = await requireUser()
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN")
  return user
}

export type AuthResult = { ok: true; user: PublicUser } | { ok: false; error: string }

/** Inicia sesión validando credenciales y establece la cookie firmada. */
export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await findByEmail(email)
  if (!user) {
    return { ok: false, error: "Correo o contraseña incorrectos." }
  }

  const [attempts] = (await sql`
    SELECT failed_logins, last_failed_login_at FROM users WHERE id = ${user.id}
  `) as { failed_logins: number; last_failed_login_at: string | Date | null }[]
  const failed = Number(attempts?.failed_logins ?? 0)

  if (failed >= MAX_FAILED_LOGINS) {
    return {
      ok: false,
      error: "Tu cuenta se bloqueó por demasiados intentos fallidos. Pide al administrador que restablezca tu contraseña.",
    }
  }
  if (failed >= THROTTLE_AFTER && attempts?.last_failed_login_at) {
    const elapsed = (Date.now() - new Date(attempts.last_failed_login_at).getTime()) / 1000
    if (elapsed < THROTTLE_SECONDS) {
      const wait = Math.ceil(THROTTLE_SECONDS - elapsed)
      return { ok: false, error: `Demasiados intentos fallidos. Espera ${wait} segundos e inténtalo de nuevo.` }
    }
  }

  if (!verifyPassword(password, user.passwordHash, user.salt)) {
    await sql`
      UPDATE users SET failed_logins = failed_logins + 1, last_failed_login_at = now() WHERE id = ${user.id}
    `
    return { ok: false, error: "Correo o contraseña incorrectos." }
  }
  if (!user.active) {
    return { ok: false, error: "Tu cuenta está desactivada. Contacta al administrador." }
  }
  if (failed > 0) {
    await sql`UPDATE users SET failed_logins = 0, last_failed_login_at = NULL WHERE id = ${user.id}`
  }
  await setSessionCookie(user.id)
  return { ok: true, user: toPublic(user) }
}

/** Registra un nuevo usuario (rol cliente por defecto) e inicia sesión. */
export async function register(name: string, email: string, password: string, role: Role = "cliente"): Promise<AuthResult> {
  const cleanName = name.trim()
  const normalized = email.trim().toLowerCase()
  if (!cleanName) {
    return { ok: false, error: "Escribe tu nombre completo." }
  }
  if (cleanName.length > 100) {
    return { ok: false, error: "El nombre no puede superar 100 caracteres." }
  }
  const emailError = validateEmail(normalized)
  if (emailError) {
    return { ok: false, error: emailError }
  }
  const passwordError = validatePassword(password, { email: normalized, name: cleanName })
  if (passwordError) {
    return { ok: false, error: passwordError }
  }
  const existing = await findByEmail(normalized)
  if (existing) {
    return { ok: false, error: "Ya existe una cuenta con ese correo." }
  }
  const { hash, salt } = hashPassword(password)
  const id = randomUUID()
  await sql`
    INSERT INTO users (id, name, email, role, password_hash, salt, active)
    VALUES (${id}, ${cleanName}, ${normalized}, ${role}, ${hash}, ${salt}, true)
  `
  await setSessionCookie(id)
  const user = await findById(id)
  return { ok: true, user: toPublic(user!) }
}

export async function logout(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, signSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  })
}
