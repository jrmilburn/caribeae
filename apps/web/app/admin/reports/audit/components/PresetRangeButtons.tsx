import { Button } from "@/components/ui/button";

export type PresetRanges = {
  thisMonth: { from: Date; to: Date };
  lastMonth: { from: Date; to: Date };
  last7: { from: Date; to: Date };
  thisWeek: { from: Date; to: Date };
};

export default function PresetRangeButtons({ presets, onSelect }: { presets: PresetRanges; onSelect: (range: { from: Date; to: Date }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => onSelect(presets.thisMonth)}>
        This month
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onSelect(presets.lastMonth)}>
        Last month
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onSelect(presets.last7)}>
        Last 7 days
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onSelect(presets.thisWeek)}>
        This week
      </Button>
    </div>
  );
}
