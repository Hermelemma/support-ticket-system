import type { NextRequest } from "next/server"
import { register } from "@/lib/auth/session"
import { json, error } from "@/lib/api/respond"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.email || !body?.password) return error("Nombre, email y contraseña son obligatorios")
  const result = await register(String(body.name), String(body.email), String(body.password))
  if (!result.ok) return error(result.error, result.error.startsWith("Ya existe") ? 409 : 400)
  return json({ user: result.user }, 201)
}
