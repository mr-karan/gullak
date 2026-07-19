import * as React from "react";

import { cn } from "@/lib/utils";

// Quiet pulse on paper-3. Opacity animation only — no layout/transform.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-paper-3", className)}
      {...props}
    />
  );
}

export { Skeleton };
