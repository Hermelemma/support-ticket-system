import "server-only"
import { sql, rowToTicket, rowToComment, rowToHistory, nextTicketCode, randomUUID } from "@/lib/db/sql"
import type {
  Channel,
  Comment,
  HistoryEvent,
  Priority,
  PublicUser,
  Status,
  Ticket,
} from "@/lib/types"
import { PRIORITY_WEIGHT, CATEGORIES, CHANNELS, PRIORITIES, STATUSES } from "@/lib/types"
import { userMap, getUserById } from "@/lib/services/users"
import { dayKey, dayLabel } from "@/lib/format"

type Row = Record<string, unknown>

// ------- View models -------

export interface TicketView extends Ticket {
  requester: PublicUser | null
  assignee: PublicUser | null
  commentCount: number
}

export interface CommentView extends Comment {
  author: PublicUser | null
}

export interface HistoryView extends HistoryEvent {
  actor: PublicUser | null
  /** Para eventos de asignación: el agente asignado (si existe). */
  target: PublicUser | null
}

/**
 * Error de validación del dominio. El mensaje es seguro para mostrar al usuario
 * (a diferencia de los errores internos de la base de datos).
 */
export class TicketError extends Error {
  constructor(
    public code: "FORBIDDEN" | "NOT_FOUND" | "INVALID",
    message: string,
  ) {
    super(message)
    this.name = "TicketError"
  }
}

export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 5000
export const COMMENT_MAX = 5000

export interface TicketDetail {
  ticket: Ticket
  requester: PublicUser | null
  assignee: PublicUser | null
  comments: CommentView[]
  history: HistoryView[]
}

export interface TicketFilters {
  status?: Status | "todos"
  priority?: Priority | "todas"
  channel?: Channel | "todos"
  assigneeId?: string | "todos" | "sin_asignar"
  search?: string
}

// ------- Helpers -------

function canManage(viewer: PublicUser): boolean {
  return viewer.role === "agente" || viewer.role === "admin"
}

function canView(viewer: PublicUser, t: Ticket): boolean {
  if (canManage(viewer)) return true
  return t.requesterId === viewer.id
}

async function addHistory(
  ticketId: string,
  actorId: string,
  ev: Omit<HistoryEvent, "id" | "ticketId" | "actorId" | "createdAt">,
) {
  await sql`
    INSERT INTO history (id, ticket_id, actor_id, type, "from", "to", note)
    VALUES (${randomUUID()}, ${ticketId}, ${actorId}, ${ev.type}, ${ev.from}, ${ev.to}, ${ev.note})
  `
}

async function findTicket(id: string): Promise<Ticket | null> {
  const rows = (await sql`SELECT * FROM tickets WHERE id = ${id} OR code = ${id} LIMIT 1`) as Row[]
  return rows[0] ? rowToTicket(rows[0]) : null
}

async function touch(id: string) {
  await sql`UPDATE tickets SET updated_at = now() WHERE id = ${id}`
}

// ------- Consultas -------

export async function listTickets(viewer: PublicUser, filters: TicketFilters = {}): Promise<TicketView[]> {
  const ticketRows = (
    canManage(viewer)
      ? await sql`SELECT * FROM tickets`
      : await sql`SELECT * FROM tickets WHERE requester_id = ${viewer.id}`
  ) as Row[]

  let rows = ticketRows.map(rowToTicket)

  if (filters.status && filters.status !== "todos") rows = rows.filter((t) => t.status === filters.status)
  if (filters.priority && filters.priority !== "todas") rows = rows.filter((t) => t.priority === filters.priority)
  if (filters.channel && filters.channel !== "todos") rows = rows.filter((t) => t.channel === filters.channel)
  if (filters.assigneeId && filters.assigneeId !== "todos") {
    if (filters.assigneeId === "sin_asignar") rows = rows.filter((t) => !t.assigneeId)
    else rows = rows.filter((t) => t.assigneeId === filters.assigneeId)
  }
  if (filters.search) {
    const q = filters.search.toLowerCase()
    rows = rows.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    )
  }

  // Orden: primero abiertos por prioridad, luego por actualización reciente
  rows.sort((a, b) => {
    const openA = a.status === "cerrado" || a.status === "resuelto" ? 1 : 0
    const openB = b.status === "cerrado" || b.status === "resuelto" ? 1 : 0
    if (openA !== openB) return openA - openB
    const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
    if (pw !== 0) return pw
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const [users, counts] = await Promise.all([userMap(), commentCounts()])

  return rows.map((t) => ({
    ...t,
    requester: users.get(t.requesterId) ?? null,
    assignee: t.assigneeId ? (users.get(t.assigneeId) ?? null) : null,
    commentCount: counts.get(t.id) ?? 0,
  }))
}

async function commentCounts(): Promise<Map<string, number>> {
  const rows = (await sql`SELECT ticket_id, count(*)::int AS n FROM comments GROUP BY ticket_id`) as Row[]
  return new Map(rows.map((r) => [r.ticket_id as string, Number(r.n)]))
}

export async function getTicketDetail(viewer: PublicUser, id: string): Promise<TicketDetail | null> {
  const ticket = await findTicket(id)
  if (!ticket || !canView(viewer, ticket)) return null

  const manage = canManage(viewer)
  const users = await userMap()

  const commentRows = (await sql`
    SELECT * FROM comments WHERE ticket_id = ${ticket.id} ORDER BY created_at ASC
  `) as Row[]
  const comments: CommentView[] = commentRows
    .map(rowToComment)
    .filter((c) => manage || !c.internal) // los clientes no ven notas internas
    .map((c) => ({ ...c, author: users.get(c.authorId) ?? null }))

  const historyRows = (await sql`
    SELECT * FROM history WHERE ticket_id = ${ticket.id} ORDER BY created_at ASC
  `) as Row[]
  const history: HistoryView[] = historyRows
    .map(rowToHistory)
    // los clientes tampoco ven en el historial que se agregó una nota interna
    .filter((h) => manage || !(h.type === "comentario" && h.note === "Nota interna"))
    .map((h) => ({
      ...h,
      actor: users.get(h.actorId) ?? null,
      target: h.type === "asignacion" && h.to ? (users.get(h.to) ?? null) : null,
    }))

  return {
    ticket,
    requester: users.get(ticket.requesterId) ?? null,
    assignee: ticket.assigneeId ? (users.get(ticket.assigneeId) ?? null) : null,
    comments,
    history,
  }
}

// ------- Mutaciones -------

export interface CreateTicketInput {
  title: string
  description: string
  category: string
  channel: Channel
  priority: Priority
  requesterId?: string // solo agentes/admin pueden crear en nombre de otro
}

export async function createTicket(viewer: PublicUser, input: CreateTicketInput): Promise<Ticket> {
  const title = String(input.title ?? "").trim()
  const description = String(input.description ?? "").trim()
  const category = String(input.category ?? "").trim()
  if (!title || !description || !category) {
    throw new TicketError("INVALID", "Completa título, descripción y categoría.")
  }
  if (Array.from(title).length > TITLE_MAX) {
    throw new TicketError("INVALID", `El título no puede superar ${TITLE_MAX} caracteres.`)
  }
  if (Array.from(description).length > DESCRIPTION_MAX) {
    throw new TicketError("INVALID", `La descripción no puede superar ${DESCRIPTION_MAX} caracteres.`)
  }
  if (!CATEGORIES.includes(category)) throw new TicketError("INVALID", "Categoría no válida.")
  if (!CHANNELS.includes(input.channel)) throw new TicketError("INVALID", "Canal no válido.")
  if (!PRIORITIES.includes(input.priority)) throw new TicketError("INVALID", "Prioridad no válida.")

  let requesterId = viewer.id
  if (canManage(viewer) && input.requesterId) {
    // Solo se puede crear a nombre de un cliente activo que exista.
    const requester = await getUserById(input.requesterId)
    if (!requester || !requester.active || requester.role !== "cliente") {
      throw new TicketError("INVALID", "El solicitante seleccionado no es un cliente activo.")
    }
    requesterId = requester.id
  }

  // El código se reserva solo después de validar todo, para no dejar huecos.
  const id = randomUUID()
  const code = await nextTicketCode()
  const rows = (await sql`
    INSERT INTO tickets (id, code, title, description, category, channel, priority, status, requester_id, assignee_id)
    VALUES (
      ${id}, ${code}, ${title}, ${description}, ${category},
      ${input.channel}, ${input.priority}, 'abierto', ${requesterId}, NULL
    )
    RETURNING *
  `) as Row[]
  const ticket = rowToTicket(rows[0])
  await addHistory(ticket.id, viewer.id, {
    type: "creado",
    from: null,
    to: null,
    note: `Creado por canal ${input.channel}`,
  })
  return ticket
}

export async function updateStatus(viewer: PublicUser, id: string, status: Status, note?: string): Promise<Ticket> {
  if (!STATUSES.includes(status)) throw new TicketError("INVALID", "Estado no válido.")
  const t = await requireManageableTicket(viewer, id)
  if (t.status === status) return t
  const from = t.status
  const reopened =
    (from === "resuelto" || from === "cerrado") && (status === "abierto" || status === "en_progreso")
  const closedAt = status === "cerrado" ? new Date().toISOString() : null
  const rows = (await sql`
    UPDATE tickets SET status = ${status}, closed_at = ${closedAt}, updated_at = now()
    WHERE id = ${t.id} RETURNING *
  `) as Row[]
  await addHistory(t.id, viewer.id, {
    type: reopened ? "reabierto" : "estado",
    from,
    to: status,
    note: note ? String(note).slice(0, 500) : null,
  })
  return rowToTicket(rows[0])
}

export async function updatePriority(viewer: PublicUser, id: string, priority: Priority): Promise<Ticket> {
  if (!PRIORITIES.includes(priority)) throw new TicketError("INVALID", "Prioridad no válida.")
  const t = await requireManageableTicket(viewer, id)
  if (t.priority === priority) return t
  const from = t.priority
  const rows = (await sql`
    UPDATE tickets SET priority = ${priority}, updated_at = now() WHERE id = ${t.id} RETURNING *
  `) as Row[]
  await addHistory(t.id, viewer.id, { type: "prioridad", from, to: priority, note: null })
  return rowToTicket(rows[0])
}

export async function assignTicket(viewer: PublicUser, id: string, assigneeId: string | null): Promise<Ticket> {
  const t = await requireManageableTicket(viewer, id)
  if (assigneeId) {
    // Solo se puede asignar a agentes o administradores activos.
    const agent = await getUserById(assigneeId)
    if (!agent || !agent.active || (agent.role !== "agente" && agent.role !== "admin")) {
      throw new TicketError("INVALID", "Solo se puede asignar a un agente o administrador activo.")
    }
  }
  if ((assigneeId ?? null) === (t.assigneeId ?? null)) return t
  const from = t.assigneeId
  const newStatus: Status = assigneeId && t.status === "abierto" ? "en_progreso" : t.status
  const rows = (await sql`
    UPDATE tickets SET assignee_id = ${assigneeId}, status = ${newStatus}, updated_at = now()
    WHERE id = ${t.id} RETURNING *
  `) as Row[]
  await addHistory(t.id, viewer.id, { type: "asignacion", from, to: assigneeId, note: null })
  if (newStatus !== t.status) {
    // El cambio automático de estado también queda en el historial.
    await addHistory(t.id, viewer.id, {
      type: "estado",
      from: t.status,
      to: newStatus,
      note: "Cambio automático al asignar un agente",
    })
  }
  return rowToTicket(rows[0])
}

export async function addComment(viewer: PublicUser, id: string, body: string, internal = false): Promise<Comment> {
  const text = String(body ?? "").trim()
  if (!text) throw new TicketError("INVALID", "El comentario no puede estar vacío.")
  if (Array.from(text).length > COMMENT_MAX) {
    throw new TicketError("INVALID", `El comentario no puede superar ${COMMENT_MAX} caracteres.`)
  }
  const ticket = await findTicket(id)
  if (!ticket || !canView(viewer, ticket)) throw new TicketError("NOT_FOUND", "Ticket no encontrado")
  const isInternal = canManage(viewer) ? internal : false // clientes no crean notas internas
  const rows = (await sql`
    INSERT INTO comments (id, ticket_id, author_id, body, internal)
    VALUES (${randomUUID()}, ${ticket.id}, ${viewer.id}, ${text}, ${isInternal})
    RETURNING *
  `) as Row[]
  await touch(ticket.id)
  await addHistory(ticket.id, viewer.id, {
    type: "comentario",
    from: null,
    to: null,
    note: isInternal ? "Nota interna" : null,
  })
  return rowToComment(rows[0])
}

async function requireManageableTicket(viewer: PublicUser, id: string): Promise<Ticket> {
  if (viewer.role !== "agente" && viewer.role !== "admin") throw new TicketError("FORBIDDEN", "No autorizado")
  const t = await findTicket(id)
  if (!t) throw new TicketError("NOT_FOUND", "Ticket no encontrado")
  return t
}

// ------- Reportes -------

export interface ReportData {
  total: number
  abiertos: number
  sinAsignar: number
  resueltosUltimos7: number
  porEstado: { key: Status; label: string; value: number }[]
  porPrioridad: { key: Priority; label: string; value: number }[]
  porCanal: { key: Channel; label: string; value: number }[]
  porAgente: { name: string; activos: number; resueltos: number }[]
  tendencia: { fecha: string; creados: number; resueltos: number }[]
  tiempoPromedioResolucionHoras: number | null
}

export async function getReports(viewer: PublicUser): Promise<ReportData> {
  const { PRIORITY_LABEL, STATUS_LABEL, CHANNEL_LABEL } = await import("@/lib/types")

  const ticketRows = (
    viewer.role === "cliente"
      ? await sql`SELECT * FROM tickets WHERE requester_id = ${viewer.id}`
      : await sql`SELECT * FROM tickets`
  ) as Row[]
  const tickets = ticketRows.map(rowToTicket)

  const count = <T extends string>(keys: T[], pick: (t: Ticket) => T, label: Record<T, string>) =>
    keys.map((key) => ({ key, label: label[key], value: tickets.filter((t) => pick(t) === key).length }))

  const now = Date.now()
  const resueltosUltimos7 = tickets.filter(
    (t) =>
      (t.status === "resuelto" || t.status === "cerrado") &&
      now - new Date(t.updatedAt).getTime() < 7 * 86_400_000,
  ).length

  // Tendencia últimos 7 días (días calendario en la zona horaria de la app)
  const tendencia: ReportData["tendencia"] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000)
    const key = dayKey(day)
    tendencia.push({
      fecha: dayLabel(day),
      creados: tickets.filter((t) => dayKey(t.createdAt) === key).length,
      resueltos: tickets.filter(
        (t) => (t.status === "resuelto" || t.status === "cerrado") && dayKey(t.updatedAt) === key,
      ).length,
    })
  }

  // Por agente
  const agentRows = (await sql`
    SELECT * FROM users WHERE role IN ('agente', 'admin')
  `) as Row[]
  const porAgente = agentRows
    .map((a) => ({
      name: a.name as string,
      activos: tickets.filter(
        (t) => t.assigneeId === a.id && t.status !== "cerrado" && t.status !== "resuelto",
      ).length,
      resueltos: tickets.filter(
        (t) => t.assigneeId === a.id && (t.status === "cerrado" || t.status === "resuelto"),
      ).length,
    }))
    .filter((a) => a.activos + a.resueltos > 0)

  // Tiempo promedio de resolución
  const resueltos = tickets.filter((t) => t.closedAt)
  const avg =
    resueltos.length > 0
      ? resueltos.reduce(
          (acc, t) => acc + (new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime()),
          0,
        ) /
        resueltos.length /
        3_600_000
      : null

  return {
    total: tickets.length,
    abiertos: tickets.filter((t) => t.status !== "cerrado" && t.status !== "resuelto").length,
    sinAsignar: tickets.filter((t) => !t.assigneeId && t.status !== "cerrado").length,
    resueltosUltimos7,
    porEstado: count(STATUSES, (t) => t.status, STATUS_LABEL),
    porPrioridad: count(PRIORITIES, (t) => t.priority, PRIORITY_LABEL),
    porCanal: count(CHANNELS, (t) => t.channel, CHANNEL_LABEL),
    porAgente,
    tendencia,
    tiempoPromedioResolucionHoras: avg !== null ? Math.round(avg * 10) / 10 : null,
  }
}
