import Link from "next/link";

export function AttributionFooter() {
  return (
    <footer className="mt-8 pb-6 text-center text-xs text-muted-foreground">
      <span className="whitespace-nowrap">
        Software by{" "}
        <Link
          href="https://studioparallel.au"
          target="_blank"
          rel="noreferrer noopener"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Studio Parallel
        </Link>
      </span>
    </footer>
  );
}
