"use client";

type SummaryItem = {
  label: string;
  value: string;
  detail: string;
};

type StudentSummaryRowProps = {
  items: SummaryItem[];
  familyBalanceLabel: string;
  familyBalanceValue: string;
  familyBalanceDetail: string;
  familyMeta?: string | null;
};

export function StudentSummaryRow({
  items,
  familyBalanceLabel,
  familyBalanceValue,
  familyBalanceDetail,
  familyMeta,
}: StudentSummaryRowProps) {
  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/70 bg-background/80 px-4 py-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {item.label}
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">{item.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
          </div>
        ))}
      </div>

      <aside className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Family account
        </div>
        <div className="mt-1 text-base font-semibold text-foreground">
          {familyBalanceLabel}: {familyBalanceValue}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{familyBalanceDetail}</div>
        {familyMeta ? <div className="mt-2 text-xs text-muted-foreground">{familyMeta}</div> : null}
      </aside>
    </section>
  );
}
