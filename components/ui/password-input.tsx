"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/field"
import { cn } from "@/lib/utils"

/**
 * Campo de contraseña conforme a NIST SP 800-63B-4:
 *  - permite pegar y usar gestores de contraseñas (no se bloquea paste/autofill);
 *  - ofrece mostrar la contraseña para evitar errores de escritura;
 *  - no usa maxLength (la contraseña nunca se trunca; el servidor valida el largo).
 */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
