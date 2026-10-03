"use client";

/**
 * Light/dark switch for the header. The icon is picked with the `dark`
 * variant (CSS), so it is correct on first paint even before hydration —
 * no state, no flash. The click flips the class on <html> and persists the
 * choice under the same key the boot script in layout.tsx reads.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("fss-theme", next);
    } catch {
      // Private mode / storage disabled — the class flip still works for this page.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      title="Toggle light / dark theme"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand-200 transition-colors hover:bg-white/8 hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[15px] w-[15px] dark:hidden"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="hidden h-[15px] w-[15px] dark:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    </button>
  );
}
