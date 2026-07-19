import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Restyled per the law: a badge is a rare, honest status marker with a real
// hairline border and a solid tonal surface — never a sprayed-on tinted pill.
// Reserve it for genuine states, not for wrapping every noun.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-rule bg-paper-3 text-ink-2",
        pos: "border-transparent bg-[color-mix(in_oklch,var(--pos)_16%,var(--paper))] text-pos",
        neg: "border-transparent bg-[color-mix(in_oklch,var(--neg)_14%,var(--paper))] text-neg",
        warn: "border-transparent bg-[color-mix(in_oklch,var(--warn)_18%,var(--paper))] text-[color-mix(in_oklch,var(--warn)_70%,black)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
