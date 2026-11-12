import { cn } from "@/lib/utils";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LOOKS = {
  panel: { on: "border-panel-foreground bg-panel-foreground text-panel", off: "border-panel-line-strong text-panel-soft hover:border-panel-foreground/50 hover:text-panel-foreground" },
  page: { on: "border-panel-foreground bg-panel-foreground text-panel", off: "border-panel-line-strong text-panel-soft hover:border-panel-foreground/50 hover:text-panel-foreground" },
};

interface MonthTogglesProps {
  /** Calendar months picked (1–12). */
  value: number[];
  /** Called with the new list, sorted; never empty (the last month can't be switched off). */
  onChange: (months: number[]) => void;
  look?: keyof typeof LOOKS;
  label?: string;
}

/** Twelve toggle buttons, one per month. */
export default function MonthToggles({ value, onChange, look = "panel", label = "Months" }: MonthTogglesProps) {
  const style = LOOKS[look];
  return (
    <div className="grid grid-cols-6 gap-1" role="group" aria-label={label}>
      {MONTH_ABBR.map((name, i) => {
        const month = i + 1;
        const on = value.includes(month);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? value.filter((m) => m !== month) : [...value, month].sort((a, b) => a - b);
              if (next.length) onChange(next);
            }}
            className={cn("rounded-full border px-1 py-1 text-[11px] transition-colors pointer-coarse:min-h-11", on ? style.on : style.off)}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
