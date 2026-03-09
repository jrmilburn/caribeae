"use client";

type SummaryItem = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "danger";
};

type SecondaryItem = {
  label: string;
  value: string;
};

type FamilySummaryRowProps = {
  items: SummaryItem[];
  secondaryTitle: string;
  secondaryDescription: string;
  secondaryItems: SecondaryItem[];
};

export function FamilySummaryRow({
  items,
  secondaryTitle,
  secondaryDescription,
  secondaryItems,
}: FamilySummaryRowProps) {
  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {item.label}
            </div>
            <div
              className={[
                "mt-1 text-base font-semibold",
                item.tone === "danger"
                  ? "text-red-700"
                  : item.tone === "success"
                    ? "text-emerald-700"
                    : "text-foreground",
              ].join(" ")}
            >
              {item.value}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
          </div>
        ))}
      </div>

      <aside className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {secondaryTitle}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{secondaryDescription}</p>
        <div className="mt-3 space-y-3">
          {secondaryItems.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {item.label}
              </div>
              <div className="text-sm font-medium text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
