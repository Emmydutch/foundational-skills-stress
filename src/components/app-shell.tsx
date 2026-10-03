"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Executive Brief" },
  { href: "/global", label: "Global Lens" },
  { href: "/us", label: "United States" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="min-h-full">
      <header className="bg-brand-950 text-white dark:border-b dark:border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3.5">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              Foundational Skills Stress
            </Link>
            <span className="hidden text-[12px] text-brand-300 sm:inline">
              Executive Intelligence Dashboard
            </span>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                  isActive(item.href)
                    ? "bg-white/12 text-white"
                    : "text-brand-200 hover:bg-white/8 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>

      <footer className="mt-8 border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5 text-[12px] text-muted">
          <span>
            Sources: World Bank Open Data · U.S. Dept. of Education EDFacts (via
            eddatacenter.org mirror) · U.S. Census Bureau ACS
          </span>
          <span className="flex items-center gap-2.5">
            <Image
              src="/emmanuel-onuoha.jpg"
              alt="Emmanuel Onuoha"
              width={30}
              height={30}
              className="h-[30px] w-[30px] rounded-full object-cover object-[50%_28%] ring-1 ring-line"
            />
            <span>
              Developed and Designed by{" "}
              <span className="font-semibold text-ink">Emmanuel Onuoha</span>
            </span>
          </span>
          <span>Public domain / open licenses · Not an official government dashboard</span>
        </div>
      </footer>
    </div>
  );
}
