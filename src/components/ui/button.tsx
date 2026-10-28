import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "control-feedback neo-control neo-push inline-flex shrink-0 items-center justify-center gap-2 text-sm font-bold whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-charcoal active:bg-charcoal",
        destructive:
          "bg-destructive text-white",
        outline:
          "bg-card text-card-foreground hover:bg-sage active:bg-sage",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-yellow active:bg-yellow",
        ghost:
          "bg-charcoal text-white hover:bg-primary active:bg-primary",
        link: "bg-card text-primary underline underline-offset-4 hover:bg-sage active:bg-sage",
      },
      size: {
        default: "min-h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-11 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "min-h-14 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
