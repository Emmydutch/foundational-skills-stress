import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Foundational Skills Stress — Executive Dashboard",
  description:
    "Live-feed executive view of foundational skills and their stressors across global, national, state, and district levels, with a composite Stress Index.",
};

// Runs before the first paint so the persisted theme lands with zero flash.
// Kept inline (not a module) on purpose — it must execute synchronously.
const THEME_BOOT = `try{var s=localStorage.getItem("fss-theme");var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
