import { demoAttr } from "@/lib/demo/scripts";
import { TERMS } from "@/lib/glossary";
import { cn } from "@/lib/utils";

const LOOKS = {
  panel: { box: "rounded-lg border border-panel-line p-3.5", summary: "text-panel-soft", term: "text-panel-foreground", meaning: "text-panel-muted" },
  line: { box: "rounded-lg border border-border p-4", summary: "text-muted-foreground", term: "text-foreground", meaning: "text-muted-foreground" },
};

/** "Words used here": the statistics terms in plain language, folded away until asked for. */
export default function Glossary({ look = "panel", className }: { look?: keyof typeof LOOKS; className?: string }) {
  const style = LOOKS[look];
  return (
    <details {...demoAttr("glossary")} className={cn(style.box, className)}>
      <summary className={cn("flex cursor-pointer items-center text-xs font-medium pointer-coarse:min-h-11", style.summary)}>
        Words used here
      </summary>
      <dl className="mt-3 space-y-2 text-xs leading-relaxed">
        {TERMS.map(({ term, meaning }) => (
          <div key={term}>
            <dt className={cn("font-medium", style.term)}>{term}</dt>
            <dd className={style.meaning}>{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
