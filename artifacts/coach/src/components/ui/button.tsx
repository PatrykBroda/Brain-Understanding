import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * FRAME buttons: rounded rectangles (12-14px), never pills.
 * default = primary (gold fill, dark foreground), secondary, outline, ghost,
 * destructive, link. States: hover, pressed (scale .985 + darker fill),
 * focus-visible ring, disabled (40%), loading (data-loading spinner via index.css).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-[15px] font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,transform,opacity] duration-[180ms] ease-out active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--f-bg)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[var(--f-gold)] text-[var(--f-on-gold)] hover:bg-[#c4b084] active:bg-[var(--f-gold-pressed)]",
        destructive:
          "border border-[rgba(229,100,90,0.34)] bg-[rgba(229,100,90,0.12)] text-[var(--f-red-text)] hover:bg-[rgba(229,100,90,0.18)]",
        outline:
          "border border-[var(--f-border-strong)] bg-transparent text-foreground hover:bg-[var(--f-raised)]",
        secondary:
          "border border-[var(--f-border-strong)] bg-[var(--f-raised)] text-foreground hover:bg-[var(--f-overlay)]",
        ghost: "border border-transparent bg-transparent text-foreground hover:bg-white/[0.06]",
        link: "rounded-[8px] text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-5 py-2",
        sm: "min-h-9 rounded-[12px] px-3.5 text-[13px]",
        lg: "min-h-[52px] px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        data-loading={loading ? "true" : undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
