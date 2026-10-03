import Link from "next/link";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

/** Drill-down breadcrumb trail: United States / California / Los Angeles USD. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 ? (
            <span className="text-muted" aria-hidden>
              /
            </span>
          ) : null}
          {item.href ? (
            <Link href={item.href} className="font-medium text-brand-600 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-muted">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
