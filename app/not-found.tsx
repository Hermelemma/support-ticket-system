import Link from "next/link"
import { SearchX } from "lucide-react"

export const metadata = { title: "Página no encontrada · MesaViva" }

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-16 text-center">
      <SearchX className="size-12 text-muted-foreground/60" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Puede que el enlace sea incorrecto, que el ticket no exista o que no tengas permiso para verlo.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/panel"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ir al panel
        </Link>
        <Link href="/" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
          Página principal
        </Link>
      </div>
    </div>
  )
}
