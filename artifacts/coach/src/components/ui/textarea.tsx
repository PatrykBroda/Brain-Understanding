import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-[14px] border border-[var(--f-border-strong)] bg-[var(--f-surface)] px-4 py-3 text-base leading-6 transition-colors placeholder:text-[var(--f-text-3)] focus-visible:border-[rgba(185,164,119,0.5)] focus-visible:bg-[var(--f-raised)] focus-visible:outline-none aria-[invalid=true]:border-[rgba(229,100,90,0.5)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
