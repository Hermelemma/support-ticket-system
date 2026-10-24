"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Select } from "@/components/ui/field"
import {
  STATUSES,
  PRIORITIES,
  STATUS_LABEL,
  PRIORITY_LABEL,
  type Priority,
  type Status,
  type PublicUser,
} from "@/lib/types"
import {
  updateStatusAction,
  updatePriorityAction,
  assignTicketAction,
  type ActionResult,
} from "@/lib/actions/tickets"

interface Props {
  ticketId: string
  status: Status
  priority: Priority
  assigneeId: string | null
  agents: PublicUser[]
}

export function TicketControls({ ticketId, status, priority, assigneeId, agents }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Si el agente asignado ya no aparece en la lista (p. ej. fue desactivado),
  // se muestra igualmente para no aparentar que el ticket está "Sin asignar".
  const assigneeMissing = assigneeId !== null && !agents.some((a) => a.id === assigneeId)

  function run(fn: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await fn()
        if (result?.error) setError(result.error)
      } catch {
        setError("No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo.")
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Estado</label>
        <Select
          value={status}
          disabled={pending}
          onChange={(e) => run(() => updateStatusAction(ticketId, e.target.value as Status))}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Prioridad</label>
        <Select
          value={priority}
          disabled={pending}
          onChange={(e) => run(() => updatePriorityAction(ticketId, e.target.value as Priority))}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Agente asignado</label>
        <Select
          value={assigneeId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => assignTicketAction(ticketId, e.target.value || null))}
        >
          <option value="">Sin asignar</option>
          {assigneeMissing && (
            <option value={assigneeId ?? ""} disabled>
              Agente inactivo
            </option>
          )}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
