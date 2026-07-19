import { Toaster as SonnerToaster } from "sonner";

// Toasts on the paper surface: honest solid card, hairline border, no glow.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-card !text-card-foreground !border-rule !rounded-md !font-sans !text-sm !shadow-none",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-foreground",
          error: "!text-neg",
          success: "!text-pos",
        },
      }}
    />
  );
}

export { toast } from "sonner";
