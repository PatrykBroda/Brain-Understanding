import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-12 w-full rounded-[14px] border border-[var(--f-border-strong)] bg-[var(--f-surface)] px-4 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--f-text-3)] focus-visible:border-[rgba(185,164,119,0.5)] focus-visible:bg-[var(--f-raised)] focus-visible:outline-none aria-[invalid=true]:border-[rgba(229,100,90,0.5)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
