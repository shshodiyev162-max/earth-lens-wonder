import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import { EXAMPLE_QUERIES } from "@/lib/query/examples";

interface TrendQueryBoxProps {
  /** The current search in words (rewritten whenever a choice changes). */
  value: string;
  onSubmit: (text: string) => void;
  showExamples: boolean;
}

/** Ask a question in plain words (it fills in the form below), or pick one of the examples. */
export default function TrendQueryBox({ value, onSubmit, showExamples }: TrendQueryBoxProps) {
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
        <div className="flex items-center gap-2 rounded-xl border border-panel-line bg-panel-tint pl-3 pr-1 focus-within:border-cyan-400/60">
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
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Read my question and find changes"
            title="Read my question and find changes"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-accent-cyan transition hover:bg-panel-tint-strong disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="text-[11px] text-panel-muted">Press Enter: your words fill in the choices below, and you can change any of them.</p>
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
