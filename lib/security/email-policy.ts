/**
 * Política de correos: solo se pueden registrar cuentas de los dominios
 * autorizados de la organización.
 */
export const ALLOWED_EMAIL_DOMAINS = ["empresa.com", "soporte.dev"] as const

/** Texto de ayuda para los campos de correo en formularios de alta. */
export const EMAIL_DOMAIN_HINT = `Solo se aceptan correos ${ALLOWED_EMAIL_DOMAINS.map((d) => "@" + d).join(" o ")}.`

/**
 * Valida el formato y el dominio de un correo (ya normalizado a minúsculas).
 * Devuelve null si es válido o un mensaje en español con el motivo.
 */
export function validateEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return "El correo no tiene un formato válido."
  }
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1)
  if (!(ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return EMAIL_DOMAIN_HINT
  }
  return null
}
