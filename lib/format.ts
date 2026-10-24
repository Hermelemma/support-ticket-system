import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Zona horaria de la mesa de ayuda. Todas las fechas se muestran en esta zona,
 * tanto en el servidor (Vercel corre en UTC) como en el navegador, para que el
 * HTML del servidor y el del cliente coincidan (evita errores de hidratación).
 * Se puede cambiar con la variable de entorno NEXT_PUBLIC_APP_TIMEZONE.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/Guatemala"

const dateTimeFmt = new Intl.DateTimeFormat("es", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const fullDateFmt = new Intl.DateTimeFormat("es", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const shortDateFmt = new Intl.DateTimeFormat("es", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
})

const dayMonthFmt = new Intl.DateTimeFormat("es", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "short",
})

// en-CA produce el formato AAAA-MM-DD, útil como clave de día.
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function relativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es })
}

export function fullDate(iso: string): string {
  return fullDateFmt.format(new Date(iso))
}

/** Fecha y hora legible (usada en detalle, comentarios e historial). */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

export function shortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso))
}

/** Clave AAAA-MM-DD del día calendario en la zona horaria de la app. */
export function dayKey(date: Date | string | number): string {
  return dayKeyFmt.format(new Date(date))
}

/** Etiqueta corta "22 oct" de un día en la zona horaria de la app. */
export function dayLabel(date: Date | string | number): string {
  return dayMonthFmt.format(new Date(date))
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}
