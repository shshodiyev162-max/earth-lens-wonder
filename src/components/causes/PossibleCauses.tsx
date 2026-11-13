import { useId } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { usePossibleCauses } from "@/hooks/usePossibleCauses";
import type { CauseLoaders } from "@/lib/causes/gather";
import type { CauseSetup } from "@/lib/causes/requests";
import type { Cause, Strength } from "@/lib/causes/rules";
import { cn } from "@/lib/utils";

const LOOKS = {
  panel: { strong: "text-panel-foreground", soft: "text-panel-soft", muted: "text-panel-muted", line: "border-panel-line", bar: "bg-panel-foreground", empty: "bg-panel-line" },
  page: { strong: "text-foreground", soft: "text-muted-foreground", muted: "text-muted-foreground", line: "border-border", bar: "bg-foreground", empty: "bg-border" },
};

const STRENGTH_WORDS: Record<Strength, string> = { strong: "Strong evidence", some: "Some evidence", weak: "Weak evidence" };
const STRENGTH_BARS: Record<Strength, number> = { strong: 3, some: 2, weak: 1 };

function orList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join("; ")}; or ${items[items.length - 1]}`;
}

function StrengthTag({ strength, look }: { strength: Strength; look: (typeof LOOKS)[keyof typeof LOOKS] }) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide", look.muted)}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-2 w-1 rounded-sm", i < STRENGTH_BARS[strength] ? look.bar : look.empty)} />
        ))}
      </span>
      {STRENGTH_WORDS[strength]}
    </span>
  );
}

function CauseItem({ cause, look }: { cause: Cause; look: (typeof LOOKS)[keyof typeof LOOKS] }) {
  return (
    <li className={cn("border-t pt-2.5", look.line)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={cn("font-editorial text-[1.2rem] leading-tight", look.strong)}>{cause.title}</h3>
        <StrengthTag strength={cause.strength} look={look} />
      </div>
      <ul className={cn("mt-1.5 space-y-1 text-xs leading-relaxed", look.soft)}>
        {cause.because.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {cause.fitsWith && (
        <p className={cn("mt-1.5 text-xs leading-relaxed", look.soft)}>
          <span className={look.strong}>From what the land was here{cause.landYear ? ` in ${cause.landYear}` : ""}, it could be</span> {orList(cause.fitsWith)}. NASA's data can't show which.
        </p>
      )}
    </li>
  );
}

interface PossibleCausesProps {
  setup: CauseSetup;
  look?: keyof typeof LOOKS;
  /** For tests: NASA stand-ins. */
  loaders?: CauseLoaders;
  className?: string;
}

/**
 * "What may be behind it": on request, checks NASA's weather, fire and population records for the
 * place, and lists the causes that fit, strongest evidence first, with what was checked and what
 * this site can't measure. Possible causes, never proof.
 */
export default function PossibleCauses({ setup, look: lookName = "panel", loaders, className }: PossibleCausesProps) {
  const look = LOOKS[lookName];
  const { state, look: lookForCauses } = usePossibleCauses(setup.request, loaders);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <p id={headingId} className={cn("eyebrow", look.muted)}>
        What may be behind it
      </p>

      {!setup.request && <p className={cn("text-xs leading-relaxed", look.soft)}>{setup.unavailable}</p>}

      {setup.request && state.status === "idle" && (
        <>
          <p className={cn("text-xs leading-relaxed", look.soft)}>Checks NASA's weather, fire and population records for this place and lists the causes that fit. Possible causes, not proof.</p>
          <button type="button" onClick={lookForCauses} className="btn-line">
            <Search className="h-3.5 w-3.5" aria-hidden /> Look for possible causes
          </button>
        </>
      )}

      {state.status === "running" && (
        <p role="status" className={cn("flex items-center gap-2 text-xs", look.soft)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking the weather, fires and people here…
        </p>
      )}

      {state.status === "error" && (
        <div role="alert" className={cn("space-y-2 text-xs", look.soft)}>
          <p>{state.message}</p>
          <button type="button" onClick={lookForCauses} className="btn-line">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
          </button>
        </div>
      )}

      {state.status === "done" && (
        <div className="space-y-3" aria-live="polite">
          {state.report.causes.length > 0 ? (
            <ol aria-label="Possible causes, strongest evidence first" className="space-y-3">
              {state.report.causes.map((cause) => (
                <CauseItem key={cause.id} cause={cause} look={look} />
              ))}
            </ol>
          ) : (
            <p className={cn("border-t pt-2.5 text-xs leading-relaxed", look.line, look.soft)}>No cause stands out: none of the checks below points to one.</p>
          )}
          <details className={cn("rounded-lg border p-3", look.line)}>
            <summary className={cn("flex cursor-pointer items-center text-xs font-medium pointer-coarse:min-h-11", look.soft)}>What was checked</summary>
            <dl className="mt-2.5 space-y-2 text-xs leading-relaxed">
              {state.report.checks.map((check) => (
                <div key={check.id}>
                  <dt className={cn("font-medium", look.strong)}>{check.label}</dt>
                  <dd className={look.soft}>{check.result}</dd>
                </div>
              ))}
            </dl>
          </details>
          <p className={cn("text-[11px] leading-relaxed", look.muted)}>
            Not measured here: {state.report.notMeasured}. These are causes that fit NASA's data, not proof of what happened.
          </p>
        </div>
      )}
    </section>
  );
}
