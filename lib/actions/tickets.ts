"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import {
  createTicket,
  updateStatus,
  updatePriority,
  assignTicket,
  addComment,
  TicketError,
} from "@/lib/services/tickets"
import type { Channel, Priority, Status } from "@/lib/types"

export type FormState = { error?: string; ok?: boolean } | undefined
export type ActionResult = { error?: string }

/** Convierte errores del dominio en mensajes seguros para la interfaz. */
function toMessage(e: unknown): string {
  if (e instanceof TicketError) return e.message
  console.error("[tickets] error inesperado", e)
  return "Ocurrió un error inesperado. Inténtalo de nuevo."
}

function revalidateTicket(id: string) {
  revalidatePath("/panel/tickets/[id]", "page")
  revalidatePath(`/panel/tickets/${id}`)
  revalidatePath("/panel/tickets")
  revalidatePath("/panel")
}

export async function createTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const channel = String(formData.get("channel") ?? "web") as Channel
  const priority = String(formData.get("priority") ?? "media") as Priority
  const requesterId = formData.get("requesterId") ? String(formData.get("requesterId")) : undefined

  if (!title || !description || !category) {
    return { error: "Completa título, descripción y categoría." }
  }

  let code: string
  try {
    const ticket = await createTicket(user, { title, description, category, channel, priority, requesterId })
    code = ticket.code
  } catch (e) {
    return { error: toMessage(e) }
  }
  revalidatePath("/panel/tickets")
  revalidatePath("/panel")
  redirect(`/panel/tickets/${code}`)
}

export async function updateStatusAction(id: string, status: Status, note?: string): Promise<ActionResult> {
  const user = await requireUser()
  try {
    await updateStatus(user, id, status, note)
  } catch (e) {
    return { error: toMessage(e) }
  }
  revalidateTicket(id)
  return {}
}

export async function updatePriorityAction(id: string, priority: Priority): Promise<ActionResult> {
  const user = await requireUser()
  try {
    await updatePriority(user, id, priority)
  } catch (e) {
    return { error: toMessage(e) }
  }
  revalidateTicket(id)
  return {}
}

export async function assignTicketAction(id: string, assigneeId: string | null): Promise<ActionResult> {
  const user = await requireUser()
  try {
    await assignTicket(user, id, assigneeId)
  } catch (e) {
    return { error: toMessage(e) }
  }
  revalidateTicket(id)
  return {}
}

export async function addCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const id = String(formData.get("ticketId") ?? "")
  const body = String(formData.get("body") ?? "").trim()
  const internal = formData.get("internal") === "on"
  if (!body) return { error: "El comentario no puede estar vacío." }
  try {
    await addComment(user, id, body, internal)
  } catch (e) {
    return { error: toMessage(e) }
  }
  revalidateTicket(id)
  return { ok: true }
}
