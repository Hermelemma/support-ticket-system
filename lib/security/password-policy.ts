/**
 * Política de contraseñas basada en NIST SP 800-63B-4 (sección 3.1.1.2, "Password Verifiers").
 *
 * Resumen de lo que exige la norma y cómo se aplica aquí:
 *  - Longitud mínima de 15 caracteres cuando la contraseña es el único factor de
 *    autenticación (este sistema no usa MFA). Cada punto de código Unicode cuenta
 *    como un carácter.
 *  - Longitud máxima permitida de al menos 64 caracteres (aquí: 128). Nunca se trunca.
 *  - SIN reglas de composición (no se exigen mayúsculas, números ni símbolos).
 *  - Se aceptan todos los caracteres ASCII imprimibles, el espacio y Unicode. Se
 *    normaliza a NFC antes de calcular el hash.
 *  - Se compara la contraseña COMPLETA contra una lista de bloqueo de contraseñas
 *    comunes, esperables o comprometidas, y contra palabras del contexto (nombre
 *    del servicio, correo y nombre del usuario). Si coincide, se rechaza y se
 *    indica el motivo.
 *  - No se exige cambio periódico ni se permiten pistas (hints).
 *  - El inicio de sesión limita los intentos fallidos (ver lib/auth/session.ts).
 */

export const PASSWORD_MIN_LENGTH = 15
export const PASSWORD_MAX_LENGTH = 128

/** Texto de ayuda que se muestra junto a los campos de contraseña. */
export const PASSWORD_HINT =
  `Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Te recomendamos una frase fácil de recordar ` +
  `(por ejemplo, varias palabras con espacios). No se exigen mayúsculas, números ni símbolos.`

/** Normaliza la contraseña a Unicode NFC (NIST SP 800-63B-4 §3.1.1.2). */
export function normalizePassword(password: string): string {
  return password.normalize("NFC")
}

/** Cuenta caracteres como puntos de código Unicode (no unidades UTF-16). */
export function passwordLength(password: string): number {
  return Array.from(normalizePassword(password)).length
}

/**
 * Lista de bloqueo de contraseñas de 15+ caracteres muy usadas o filtradas.
 * Fuente principal: SecLists "100k-most-used-passwords-NCSC" (filtradas a 15+
 * caracteres, sin datos personales) y equivalentes en español. Las contraseñas
 * más cortas ya quedan rechazadas por la longitud mínima.
 */
const BLOCKLIST = new Set(
  [
    "1q2w3e4r5t6y7u8i9o0p", "123456789987654321", "123456789123456789", "1q2w3e4r5t6y7u8i",
    "1q2w3e4r5t6y7u8i9o", "12345678900987654321", "1qaz2wsx3edc4rfv", "123456789123456",
    "12345678901234567890", "1234567890qwertyuiop", "1234567891234567", "123456789qwerty",
    "qazwsxedcrfvtgb", "q1w2e3r4t5y6u7i8o9p0", "123456789101112", "qwerty123456789",
    "12345678987654321", "111111111111111", "manchesterunited", "1234567890987654321",
    "password123456789", "password12345678", "password1234567", "qwertyuiopasdfghjkl",
    "qwertyuiop12345", "qwertyuiop1234567890", "112233445566778899", "1234567890qwerty",
    "11111111111111111111", "default_password", "123456789012345", "1234567890123456",
    "000000000000000", "q1w2e3r4t5y6u7i8", "1234qwerasdfzxcv", "30secondstomars",
    "cristianoronaldo", "linkedinpassword", "qwertasdfgzxcvb", "qwertyuiopasdfghjklzxcvbnm",
    "zxcvbnm123456789", "passwordpassword", "123456789987654", "1234567899876543",
    "123456789qwertyuiop", "010203040506070809", "1qa2ws3ed4rf5tg", "1qazxsw23edcvfr4",
    "worldofwarcraft", "qwerty1234567890", "galatasaray1905", "asdfghjklzxcvbnm",
    "qwertyuiop123456789", "1122334455667788", "102030405060708090", "aaaaaaaaaaaaaaa",
    "qwertyuiopasdfg", "123456789qwertyuio", "1234567887654321", "qwertyuiop123456",
    "123451234512345", "1234567812345678", "123456789zxcvbnm", "111222333444555",
    "q1w2e3r4t5y6u7i8o9", "122333444455555", "1q2w3e4r5t6y7u8", "1qaz2wsx3edc4rfv5tgb",
    "987654321123456789", "zxcvbnmasdfghjkl", "mychemicalromance", "thisismypassword",
    "holidaysecure123", "linkedinlinkedin", "00000000000000000000", "123123123123123",
    "californication", "1324354657687980", "1234567890qwert", "12345qwertasdfg",
    "avengedsevenfold", "aaaaaaaaaaaaaaaa", "professionaltools", "555555555555555",
    "1213141516171819", "12345678qwertyui", "11223344556677889900", "qwertyuiopasdfghjkl151515",
    "iloveyouiloveyou", "correcthorsebatterystaple", "correct horse battery staple",
    "letmeinletmein", "welcomewelcome1", "administrator123", "administrador123",
    "changemechangeme", "superman123456789", "michaeljordan23", "football12345678",
    // Español
    "contraseñacontraseña", "contrasenacontrasena", "contraseña123456", "contrasena123456",
    "contraseña12345678", "contrasena12345678", "123456789contraseña", "123456789contrasena",
    "micontraseñasegura", "micontrasenasegura", "contraseñasegura123", "contrasenasegura123",
    "teamoteamoteamo", "teamomuchoteamo", "teamoconlocura", "barcelona123456789",
    "realmadrid123456", "realmadridrealmadrid", "guatemala123456789", "guatemalaguatemala",
    "holamundoholamundo", "holaholaholahola", "administrador1234", "soportetecnico123",
    "mesadeayuda12345", "usuario123456789", "bienvenido123456", "clavesecreta1234",
  ].map((p) => p.toLowerCase()),
)

/** Palabras del contexto del servicio (NIST: nombre del servicio y derivados). */
const SERVICE_WORDS = ["mesaviva", "mesa viva", "mesadeayuda", "mesa de ayuda", "soporte", "tickets", "ticket"]

const SEQUENCES = [
  "0123456789012345678901234567890",
  "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",
  "qwertyuiopasdfghjklzxcvbnmqwertyuiop",
  "qwertzuiopasdfghjklyxcvbnm",
  "azertyuiopqsdfghjklmwxcvbn",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
]

function stripForCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos
    .replace(/[\s._\-@!¡?¿*#$%&/\\|+=,;:'"`~^()[\]{}<>]/g, "")
}

/** ¿La contraseña es solo una secuencia (abcdef…, 123456…, qwerty…) o su inversa? */
function isSequence(p: string): boolean {
  for (const seq of SEQUENCES) {
    if (seq.includes(p)) return true
    if (seq.split("").reverse().join("").includes(p)) return true
  }
  return false
}

/** ¿La contraseña es la repetición de un bloque corto? (aaaa…, abcabc…, 121212…) */
function isRepetition(p: string): boolean {
  const chars = Array.from(p)
  for (let size = 1; size <= Math.floor(chars.length / 2); size++) {
    if (chars.length % size !== 0) continue
    const block = chars.slice(0, size).join("")
    if (block.repeat(chars.length / size) === p) return true
  }
  return false
}

export interface PasswordContext {
  email?: string
  name?: string
}

/**
 * Valida una contraseña nueva según NIST SP 800-63B-4.
 * Devuelve null si es aceptable o un mensaje en español con el motivo del rechazo.
 */
export function validatePassword(password: string, ctx: PasswordContext = {}): string | null {
  const normalized = normalizePassword(password)
  const length = Array.from(normalized).length

  if (length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres (tiene ${length}). Una frase de varias palabras es una buena opción.`
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`
  }
  // Caracteres de control (no imprimibles) no son válidos.
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    return "La contraseña contiene caracteres no válidos (saltos de línea o caracteres de control)."
  }

  const lower = normalized.toLowerCase()
  const compact = stripForCompare(normalized)

  if (BLOCKLIST.has(lower) || BLOCKLIST.has(compact)) {
    return "Esa contraseña aparece en listas de contraseñas comunes o filtradas. Elige otra."
  }
  if (isRepetition(compact) || isRepetition(lower)) {
    return "La contraseña no puede ser un mismo carácter o bloque repetido (por ejemplo «aaaa…» o «abcabc…»)."
  }
  if (isSequence(compact)) {
    return "La contraseña no puede ser una secuencia predecible (por ejemplo «123456…», «abcdef…» o «qwerty…»)."
  }

  // Palabras del contexto: nombre del servicio, correo y nombre del usuario.
  const contextWords = new Set<string>(SERVICE_WORDS.map(stripForCompare))
  if (ctx.email) {
    const email = ctx.email.trim().toLowerCase()
    contextWords.add(stripForCompare(email))
    contextWords.add(stripForCompare(email.split("@")[0] ?? ""))
  }
  if (ctx.name) {
    contextWords.add(stripForCompare(ctx.name))
  }
  contextWords.delete("")

  // Se compara la contraseña completa (sin dígitos finales) contra cada palabra
  // del contexto y sus repeticiones, como pide la norma (no se buscan subcadenas).
  const withoutTrailingDigits = compact.replace(/\d+$/, "")
  for (const word of contextWords) {
    if (!word) continue
    if (compact === word || withoutTrailingDigits === word) {
      return "La contraseña no puede ser tu nombre, tu correo ni el nombre del sistema."
    }
    if (isRepetition(compact) && compact.startsWith(word)) {
      return "La contraseña no puede ser tu nombre, tu correo ni el nombre del sistema."
    }
    if (word.length >= 4 && compact.length % word.length === 0 && word.repeat(compact.length / word.length) === compact) {
      return "La contraseña no puede ser tu nombre, tu correo ni el nombre del sistema repetido."
    }
  }

  return null
}
