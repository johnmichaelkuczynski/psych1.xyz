import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCurrentStudent,
  getGetCurrentStudentQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { integrityApi } from "@/lib/integrity-api";

/**
 * Renders a one-time "I understand" modal the first time a student opens
 * any module assignment page. After acknowledgment, the modal never shows
 * again for that student.
 */
export function IntegrityDisclosureGate() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentStudent()
      .then((r) => {
        if (cancelled) return;
        const s = r.student;
        // Treat null OR epoch (default value before first ack) as "not acked".
        const acked =
          s?.integrityAckAt &&
          new Date(s.integrityAckAt).getTime() > 0;
        if (s && !acked) setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAck() {
    setSubmitting(true);
    try {
      await integrityApi.ack();
      await qc.invalidateQueries({
        queryKey: getGetCurrentStudentQueryKey(),
      });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Academic Integrity
            </span>
          </div>
          <DialogTitle className="font-serif text-xl">
            How submissions are monitored in this course
          </DialogTitle>
          <DialogDescription asChild>
            <div className="mt-3 space-y-3 text-sm text-stone-700">
              <p>
                Before you start your first assignment, please read and
                acknowledge the following:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  All submissions are typed into a <strong>monitored
                  canvas</strong> — pasting from outside is disabled.
                </li>
                <li>
                  Your typing patterns and final text are analyzed using{" "}
                  <strong>GPTZero</strong> in real time.
                </li>
                <li>
                  Submissions flagged as likely AI-generated are reviewed
                  by your instructor.
                </li>
                <li>
                  The full <strong>keystroke history</strong> of every
                  submission is logged and visible to your instructor.
                </li>
                <li>
                  Students with documented accommodations may have
                  monitoring disabled — please contact your instructor.
                </li>
              </ul>
              <p>
                You will get one round of AI feedback in a separate{" "}
                <em>Draft Workshop</em> box where pasting <em>is</em>{" "}
                allowed; that draft is not your submission.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={handleAck}
            disabled={submitting}
            data-testid="button-ack-integrity"
          >
            {submitting ? "Saving…" : "I understand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
