import type { ReactNode } from "react";

/** Page-level masthead: title, description, and a meta strip (chips). */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5">
      <div className="label-xs">{eyebrow}</div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] leading-8 font-semibold tracking-tight text-ink">{title}</h1>
        {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-muted">{description}</p>
    </header>
  );
}
