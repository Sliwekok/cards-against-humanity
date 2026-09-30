import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karty dżentelmenów",
  description: "Imprezowa gra karciana dla kilku osób – każdy na swoim urządzeniu.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#18181b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="inline-block h-6 w-4 rounded-sm bg-zinc-900" />
              <span className="-ml-3 inline-block h-6 w-4 rotate-12 rounded-sm border border-zinc-300 bg-white" />
              Karty dżentelmenów
            </Link>
            <nav className="text-sm text-zinc-600">
              <Link href="/wyniki" className="hover:text-zinc-900">
                Tablica wyników
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
