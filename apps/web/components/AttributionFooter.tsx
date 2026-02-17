import Link from "next/link";

export function AttributionFooter() {
  return (
    <footer className="mt-8 pb-6 text-center text-[13px] leading-5 text-muted-foreground sm:text-sm">
      <span className="whitespace-nowrap">
        Software by{" "}
        <Link
          href="https://studioparallel.au"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center px-0.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Studio Parallel
        </Link>
      </span>
    </footer>
  );
}
