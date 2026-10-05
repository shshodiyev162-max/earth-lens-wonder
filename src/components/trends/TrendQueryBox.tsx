import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { EXAMPLE_QUERIES } from "@/lib/query/examples";

interface TrendQueryBoxProps {
  value: string;
  onSubmit: (text: string) => void;
  busy: boolean;
  showExamples: boolean;
}

/** Ask a question in plain words, or pick one of the examples. */
export default function TrendQueryBox({ value, onSubmit, busy, showExamples }: TrendQueryBoxProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) onSubmit(text.trim());
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2" role="search" aria-label="Ask about environmental change">
        <label htmlFor="trend-question" className="text-xs font-semibold uppercase tracking-wider text-panel-muted">
          Ask about a change
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-panel-line bg-panel-tint px-3 focus-within:border-cyan-400/60">
          <Search className="h-4 w-4 shrink-0 text-panel-muted" aria-hidden />
          <input
            id="trend-question"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. where did vegetation decline in Uzbekistan since 2015"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-panel-foreground outline-none placeholder:text-panel-muted"
          />
        </div>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          Find changes
        </button>
      </form>
      {showExamples && (
        <div>
          <p className="mb-2 text-xs text-panel-muted">Try one of these:</p>
          <ul className="space-y-1.5">
            {EXAMPLE_QUERIES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => onSubmit(example)}
                  className="w-full rounded-lg border border-panel-line bg-panel-tint px-3 py-2 text-left text-xs leading-relaxed text-panel-soft transition hover:border-cyan-400/40 hover:text-panel-foreground"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
