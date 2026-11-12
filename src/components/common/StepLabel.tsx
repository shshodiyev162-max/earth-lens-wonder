import type { ReactNode } from "react";

/** "01 What to measure": the numbered steps of a form, as in the home page's "How an answer is made". */
export default function StepLabel({ number, htmlFor, id, children }: { number: number; htmlFor?: string; id?: string; children: ReactNode }) {
  const content = (
    <>
      <span aria-hidden className="tabular-nums">
        {String(number).padStart(2, "0")}
      </span>
      <span className="text-foreground">{children}</span>
    </>
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className="field-label flex items-baseline gap-2.5">
      {content}
    </label>
  ) : (
    <p id={id} className="field-label flex items-baseline gap-2.5">
      {content}
    </p>
  );
}
