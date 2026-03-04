import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-md border border-border/60 bg-muted/65 motion-safe:animate-[pulse_2s_ease-in-out_infinite] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
