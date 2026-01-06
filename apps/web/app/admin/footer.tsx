import Link from "next/link";
import { cn } from "@/lib/utils";

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t bg-background", className)}>
      <div className="mx-auto flex h-10 max-w-screen-2xl items-center justify-between px-4 text-xs text-muted-foreground">
        <div>
          © {new Date().getFullYear()} Caribeae
        </div>

        <div className="flex items-center gap-2">
          <span>Powered by</span>
          <Link
            href="https://www.studioparallel.au"
            target="_blank"
            rel="noreferrer"
            className="text-foreground/80 hover:text-foreground transition"
          >
            Studio Parallel
          </Link>
        </div>
      </div>
    </footer>
  );
}
