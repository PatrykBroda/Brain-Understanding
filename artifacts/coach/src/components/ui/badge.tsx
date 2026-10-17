import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** Badges are compact status/chips: the one place the pill shape is correct. Always give them a text label. */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default:
          "border-[rgba(185,164,119,0.28)] bg-[rgba(185,164,119,0.1)] text-[var(--f-gold)]",
        secondary:
          "border-[var(--f-border)] bg-[var(--f-raised)] text-[var(--f-text-2)]",
        destructive:
          "border-[rgba(229,100,90,0.3)] bg-[rgba(229,100,90,0.1)] text-[var(--f-red-text)]",
        outline: "border-[var(--f-border-strong)] text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
