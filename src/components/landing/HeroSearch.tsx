import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles } from "lucide-react";
import { paramsForText } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

/** Ask a trend question straight from the landing page; it opens the Trends page. */
export default function HeroSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = text.trim() || "where did vegetation decline in Uzbekistan since 2015";
    navigate(`/trends?${paramsForText(question)}`);
  };
  return (
    <form onSubmit={submit} role="search" aria-label="Ask where Earth is changing" className={cn("pointer-events-auto mx-auto flex w-full max-w-xl items-center gap-2 rounded-2xl p-1.5 glass", className)}>
      <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor="hero-question" className="sr-only">
        Your question
      </label>
      <input
        id="hero-question"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="e.g. vegetation decline in Uzbekistan since 2015"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground sm:text-base"
      />
      <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-display font-semibold gradient-primary text-primary-foreground hover:opacity-90">
        <Sparkles className="h-4 w-4" aria-hidden />
        Ask
      </button>
    </form>
  );
}
