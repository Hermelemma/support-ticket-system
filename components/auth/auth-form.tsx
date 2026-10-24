"use client"

import { startTransition, useActionState } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { PASSWORD_HINT } from "@/lib/security/password-policy"
import { EMAIL_DOMAIN_HINT } from "@/lib/security/email-policy"
import { loginAction, registerAction, type ActionState } from "@/lib/actions/auth"

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined)

  return (
    <form
      className="flex flex-col gap-4"
      // Envío manual: así React no borra lo escrito si el servidor devuelve un error.
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        startTransition(() => formAction(data))
      }}
    >
      {mode === "register" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nombre completo</Label>
          <Input id="name" name="name" placeholder="Ej. María González" required autoComplete="name" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tucorreo@empresa.com"
          required
          autoComplete="email"
          aria-describedby={mode === "register" ? "email-hint" : undefined}
        />
        {mode === "register" && (
          <p id="email-hint" className="text-xs text-muted-foreground">
            {EMAIL_DOMAIN_HINT}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput
          id="password"
          name="password"
          placeholder={mode === "login" ? "••••••••" : "Mínimo 15 caracteres, sin espacios"}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          aria-describedby={mode === "register" ? "password-hint" : undefined}
        />
        {mode === "register" && (
          <p id="password-hint" className="text-xs text-muted-foreground">
            {PASSWORD_HINT}
          </p>
        )}
      </div>

      {state?.error && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending ? "Procesando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-primary hover:underline">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/ingresar" className="font-medium text-primary hover:underline">
              Inicia sesión
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
