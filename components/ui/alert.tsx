import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:size-4 [&>svg]:shrink-0 flex gap-3 items-start",
  {
    variants: {
      variant: {
        default: "bg-card border-border text-foreground",
        destructive: "bg-destructive/5 border-destructive/30 text-destructive",
        warning: "bg-warning/10 border-warning/30 text-warning-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div role="alert" className={cn(alertVariants({ variant, className }))} {...props} />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("font-medium leading-none mb-1", className)} {...props} />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("text-sm [&_p]:leading-relaxed opacity-90", className)} {...props} />
  );
}

export { Alert, AlertTitle, AlertDescription };
