import { type ReactNode } from "react";
import { Link } from "wouter";

export function PageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 border-b border-stone-200 pb-6">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-3 max-w-2xl text-stone-700">{intro}</p>
        )}
      </header>
      <div className="space-y-8">{children}</div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-stone-50">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-stone-600 md:flex-row md:items-center">
        <div>
          © {new Date().getFullYear()} Psychology 101 — Course shell built to
          Quality Matters Higher Ed Rubric (7th ed.).
        </div>
        <div className="flex gap-4">
          <Link href="/accessibility" className="hover:text-stone-900">
            Accessibility
          </Link>
          <Link href="/support" className="hover:text-stone-900">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
