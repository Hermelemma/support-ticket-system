import type { NextRequest } from "next/server"
import { withAuth, json, error, fromError } from "@/lib/api/respond"
import { listTickets, createTicket, type TicketFilters } from "@/lib/services/tickets"
import { CHANNELS, PRIORITIES, STATUSES } from "@/lib/types"

export async function GET(req: NextRequest) {
  const auth = await withAuth()
  if ("response" in auth) return auth.response
  const sp = req.nextUrl.searchParams
  const status = sp.get("status")
  const priority = sp.get("priority")
  const channel = sp.get("channel")
  if (status && status !== "todos" && !STATUSES.includes(status as never)) return error("Estado inválido")
  if (priority && priority !== "todas" && !PRIORITIES.includes(priority as never)) return error("Prioridad inválida")
  if (channel && channel !== "todos" && !CHANNELS.includes(channel as never)) return error("Canal inválido")
  const filters: TicketFilters = {
    status: (status as TicketFilters["status"]) ?? undefined,
    priority: (priority as TicketFilters["priority"]) ?? undefined,
    channel: (channel as TicketFilters["channel"]) ?? undefined,
    assigneeId: sp.get("assigneeId") ?? undefined,
    search: sp.get("search") ?? undefined,
  }
  const tickets = await listTickets(auth.user, filters)
  return json({ tickets })
}

export async function POST(req: NextRequest) {
  const auth = await withAuth()
  if ("response" in auth) return auth.response
  const body = await req.json().catch(() => null)
  if (!body?.title || !body?.description || !body?.category) {
    return error("title, description y category son obligatorios")
  }
  const channel = body.channel ?? "web"
  const priority = body.priority ?? "media"
  try {
    const ticket = await createTicket(auth.user, {
      title: String(body.title),
      description: String(body.description),
      category: String(body.category),
      channel,
      priority,
      requesterId: body.requesterId ? String(body.requesterId) : undefined,
    })
    return json({ ticket }, 201)
  } catch (e) {
    return fromError(e)
  }
}
