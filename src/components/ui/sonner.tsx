"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Toasts on the same paper as everything else; the site has one theme. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--paper-2)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--border-radius": "10px",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "font-sans shadow-[inset_0_0_0_1.5px_var(--line)]" } }}
      {...props}
    />
  )
}

export { Toaster }
