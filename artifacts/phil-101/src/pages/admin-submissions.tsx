import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getCurrentStudent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageShell } from "@/components/page-shell";
import { integrityApi } from "@/lib/integrity-api";
import { Eye, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

function fmtScore(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(0)}%`;
}

function scoreBadge(n: number | null): string {
  if (n == null) return "bg-stone-200 text-stone-700";
  if (n >= 0.7) return "bg-red-100 text-red-800";
  if (n >= 0.3) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export default function AdminSubmissions() {
  const me = useQuery({
    queryKey: ["me-admin"],
    queryFn: () => getCurrentStudent(),
  });
  const [bootstrapping, setBootstrapping] = useState(false);

  const subs = useQuery({
    queryKey: ["admin", "submissions"],
    queryFn: () => integrityApi.listSubmissions(),
    enabled: !!me.data?.student?.isAdmin,
  });
  const students = useQuery({
    queryKey: ["admin", "students"],
    queryFn: () => integrityApi.listStudents(),
    enabled: !!me.data?.student?.isAdmin,
  });

  if (me.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-stone-600">
        Loading…
      </div>
    );
  }

  if (!me.data?.student) {
    return (
      <PageShell title="Admin" intro="Please sign in.">
        <p>
          <Link href="/" className="underline">
            Go to Start Here
          </Link>
        </p>
      </PageShell>
    );
  }

  if (!me.data.student.isAdmin) {
    return (
      <PageShell
        title="Instructor dashboard"
        intro="This area is for instructors only."
      >
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-stone-700">
              You are signed in as a student. If you are the course
              instructor and no admin has been claimed yet, you may promote
              yourself once.
            </p>
            <Button
              onClick={async () => {
                setBootstrapping(true);
                try {
                  await integrityApi.becomeAdmin();
                  toast.success("Admin access granted. Reloading…");
                  setTimeout(() => window.location.reload(), 600);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                } finally {
                  setBootstrapping(false);
                }
              }}
              disabled={bootstrapping}
              data-testid="button-become-admin"
            >
              <ShieldAlert className="mr-1 h-4 w-4" />
              Promote me to admin
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Instructor dashboard"
      intro="Review every submission, replay how it was written, and manage student accommodations."
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {subs.isLoading ? (
            <div className="flex items-center gap-2 text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : subs.data?.submissions.length === 0 ? (
            <p className="text-sm text-stone-600">No submissions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-testid="table-submissions"
              >
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Module</th>
                    <th className="py-2 pr-3">AI</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {subs.data?.submissions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-stone-100"
                      data-testid={`row-submission-${s.id}`}
                    >
                      <td className="py-2 pr-3 text-stone-600">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-stone-900">
                          {s.studentName ?? "—"}
                        </div>
                        <div className="text-xs text-stone-500">
                          {s.studentEmail ?? ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {s.moduleId}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${scoreBadge(s.aiScore)}`}
                        >
                          {fmtScore(s.aiScore)}
                        </span>
                        {s.flaggedOnSubmit && (
                          <Badge variant="destructive" className="ml-1">
                            flagged
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 capitalize text-stone-700">
                        {s.reviewStatus}
                      </td>
                      <td className="py-2 pr-3">
                        <Link href={`/admin/submissions/${s.id}`}>
                          <Button size="sm" variant="outline">
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Open
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">
            Students & accommodations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {students.isLoading ? (
            <div className="text-stone-500">Loading…</div>
          ) : (
            <div className="space-y-2">
              {students.data?.students.map((s) => (
                <StudentRow key={s.id} student={s} onChange={students.refetch} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function StudentRow({
  student,
  onChange,
}: {
  student: {
    id: number;
    name: string;
    email: string;
    isAdmin: boolean;
    accommodated: boolean;
  };
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [val, setVal] = useState(student.accommodated);
  useEffect(() => setVal(student.accommodated), [student.accommodated]);
  return (
    <div
      className="flex items-center justify-between rounded-md border border-stone-200 p-2"
      data-testid={`row-student-${student.id}`}
    >
      <div>
        <div className="font-medium text-stone-900">
          {student.name}
          {student.isAdmin && (
            <Badge variant="outline" className="ml-2">
              admin
            </Badge>
          )}
        </div>
        <div className="text-xs text-stone-500">{student.email}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-600">Accommodated</span>
        <Switch
          checked={val}
          disabled={pending}
          onCheckedChange={async (v) => {
            setVal(v);
            setPending(true);
            try {
              await integrityApi.setAccommodated(student.id, v);
              onChange();
            } catch (e) {
              setVal(student.accommodated);
              toast.error(e instanceof Error ? e.message : "Failed");
            } finally {
              setPending(false);
            }
          }}
          data-testid={`switch-accommodated-${student.id}`}
        />
      </div>
    </div>
  );
}
