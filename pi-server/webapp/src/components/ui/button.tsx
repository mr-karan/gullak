import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Art-directed per the anti-slop law: NO default shadow, NO transform on hover,
// transition color/opacity only (never `all`). Primary is a solid brand fill
// that darkens ~6% on hover. Secondaries are ghost/text — we never pair a
// filled button with an outlined one.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary)_94%,black)] active:bg-[color-mix(in_oklch,var(--primary)_88%,black)] aria-pressed:bg-[color-mix(in_oklch,var(--primary)_88%,black)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[color-mix(in_oklch,var(--destructive)_92%,black)] active:bg-[color-mix(in_oklch,var(--destructive)_86%,black)]",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted active:bg-paper-3",
        ghost: "bg-transparent text-foreground hover:bg-muted active:bg-paper-3",
        link: "text-primary underline-offset-4 hover:underline active:opacity-80 p-0 h-auto",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md px-3 text-[13px] has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
