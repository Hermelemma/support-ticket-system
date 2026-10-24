import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import type { PublicUser } from "@/lib/types"
import { TicketError } from "@/lib/services/tickets"

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/** Resuelve el usuario autenticado o devuelve una respuesta 401. */
export async function withAuth(): Promise<{ user: PublicUser } | { response: NextResponse }> {
  const user = await getCurrentUser()
  if (!user) return { response: error("No autenticado", 401) }
  return { user }
}

/** Traduce errores a respuestas HTTP sin filtrar detalles internos de la base de datos. */
export function fromError(e: unknown) {
  if (e instanceof TicketError) {
    if (e.code === "FORBIDDEN") return error(e.message, 403)
    if (e.code === "NOT_FOUND") return error(e.message, 404)
    return error(e.message, 400)
  }
  console.error("[api] error inesperado", e)
  return error("Error interno del servidor", 500)
}
