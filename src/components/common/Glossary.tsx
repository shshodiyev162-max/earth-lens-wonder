import { BookOpen } from "lucide-react";
import { TERMS } from "@/lib/glossary";
import { cn } from "@/lib/utils";

const LOOKS = {
  panel: { box: "rounded-xl border border-panel-line bg-panel-tint p-3", summary: "text-panel-soft", term: "text-panel-foreground", meaning: "text-panel-muted" },
  page: { box: "glass rounded-2xl p-6", summary: "text-muted-foreground", term: "text-foreground", meaning: "text-muted-foreground" },
};

/** "Words used here": the statistics terms in plain language, folded away until asked for. */
export default function Glossary({ look = "panel", className }: { look?: keyof typeof LOOKS; className?: string }) {
  const style = LOOKS[look];
  return (
    <details className={cn(style.box, className)}>
      <summary className={cn("flex cursor-pointer items-center gap-2 text-xs font-semibold pointer-coarse:min-h-11", style.summary)}>
        <BookOpen className="h-3.5 w-3.5 text-accent-cyan" aria-hidden /> Words used here
      </summary>
      <dl className="mt-3 space-y-2 text-xs leading-relaxed">
        {TERMS.map(({ term, meaning }) => (
          <div key={term}>
            <dt className={cn("font-semibold", style.term)}>{term}</dt>
            <dd className={style.meaning}>{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
