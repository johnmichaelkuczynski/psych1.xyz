import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCurrentStudent,
  getGetCurrentStudentQueryKey,
  useLogout,
} from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";

const links = [
  { href: "/", label: "Start Here" },
  { href: "/syllabus", label: "Syllabus" },
  { href: "/modules", label: "Modules" },
  { href: "/tutor/d1", label: "General Tutor" },
  { href: "/assessments", label: "Assessments" },
  { href: "/support", label: "Support" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/diagnostic", label: "Diagnostic" },
];

export function Nav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [studentName, setStudentName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentStudent()
      .then((r) => {
        if (cancelled) return;
        setStudentName(r.student?.name ?? null);
        setIsAdmin(!!r.student?.isAdmin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location]);

  const logout = useLogout({
    mutation: {
      onSuccess: async () => {
        setStudentName(null);
        await qc.invalidateQueries({ queryKey: getGetCurrentStudentQueryKey() });
        window.location.href = import.meta.env.BASE_URL;
      },
    },
  });

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="font-serif text-lg font-semibold tracking-tight text-stone-900 hover:text-stone-700"
          data-testid="link-home"
        >
          Psychology 101
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active =
              location === l.href ||
              (l.href !== "/" && location.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-stone-900 text-stone-50"
                    : "text-stone-700 hover:bg-stone-200"
                }`}
                data-testid={`link-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAdmin && (
            <Link
              href="/admin/submissions"
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                location.startsWith("/admin")
                  ? "bg-stone-900 text-stone-50"
                  : "text-stone-700 hover:bg-stone-200"
              }`}
              data-testid="link-nav-admin"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </Link>
          )}
          {studentName ? (
            <>
              <span className="text-sm text-stone-600" data-testid="text-student-name">
                {studentName}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                data-testid="button-logout"
              >
                <LogOut className="mr-1 h-3.5 w-3.5" />
                Sign out
              </Button>
            </>
          ) : null}
        </div>

        <button
          className="md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          data-testid="button-mobile-menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-stone-200 bg-stone-50 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-stone-800 hover:bg-stone-200"
              >
                {l.label}
              </Link>
            ))}
            {studentName && (
              <button
                onClick={() => {
                  setOpen(false);
                  logout.mutate();
                }}
                className="rounded-md px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-200"
              >
                Sign out ({studentName})
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
