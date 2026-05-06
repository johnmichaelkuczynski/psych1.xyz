import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";
import { LifeBuoy, BookMarked, Bot, HeartHandshake } from "lucide-react";

export default function Support() {
  return (
    <PageShell
      title="Student Support"
      intro="Resources and contacts to keep you on track in this course and across your studies."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          icon={<LifeBuoy className="h-5 w-5" />}
          title="Technical support"
        >
          <ul className="space-y-2 text-sm text-stone-800">
            <li>
              Email:{" "}
              <a
                className="underline"
                href="mailto:support@example.edu"
                data-testid="link-support-email"
              >
                support@example.edu
              </a>{" "}
              (response within one business day)
            </li>
            <li>Phone: (555) 555-0190 — Mon–Fri 8am–6pm</li>
            <li>
              Browser tips: clear cache, disable browser extensions that
              block cookies (this course uses one signed cookie to keep you
              signed in), and use the latest version of Chrome, Firefox,
              Safari, or Edge.
            </li>
            <li>
              If the AI Tutor will not load, check that your network allows
              long-lived HTTP responses (Server-Sent Events).
            </li>
          </ul>
        </Panel>

        <Panel
          icon={<BookMarked className="h-5 w-5" />}
          title="Academic support"
        >
          <ul className="space-y-2 text-sm text-stone-800">
            <li>
              <strong>Tutoring center</strong> — drop-in help with course
              writing. (Placeholder — link to your institution's tutoring
              center.)
            </li>
            <li>
              <strong>Writing center</strong> — feedback on essay drafts.
              (Placeholder.)
            </li>
            <li>
              <strong>Library</strong> — research databases, psychology
              encyclopedia subscriptions, citation help. (Placeholder.)
            </li>
            <li>
              <strong>Academic advising</strong> — questions about
              prerequisites, transferring credit, or major requirements.
            </li>
          </ul>
        </Panel>

        <Panel
          icon={<Bot className="h-5 w-5" />}
          title="Using the AI Tutor effectively"
        >
          <ul className="space-y-2 text-sm text-stone-800">
            <li>
              <strong>Do</strong> ask the tutor to explain a concept, push
              back on your draft thesis, or steel-man an opposing view.
            </li>
            <li>
              <strong>Do</strong> share what you've already read and what
              specifically confuses you — the tutor responds best to
              concrete questions.
            </li>
            <li>
              <strong>Do not</strong> ask the tutor to write your submission.
              It is system-prompted to refuse and will pivot to questions.
            </li>
            <li>
              All tutor messages are stored so the human instructor of
              record can review your engagement.
            </li>
          </ul>
        </Panel>

        <Panel
          icon={<HeartHandshake className="h-5 w-5" />}
          title="Counseling & wellness"
        >
          <ul className="space-y-2 text-sm text-stone-800">
            <li>
              Crisis support (24/7): call or text <strong>988</strong>{" "}
              (Suicide & Crisis Lifeline).
            </li>
            <li>
              Campus counseling: (555) 555-0123 — confidential
              appointments.
            </li>
            <li>
              Disability services: (555) 555-0145 — accommodations and
              accessibility coordination.
            </li>
            <li>
              Financial aid & food pantry: (555) 555-0167.
            </li>
          </ul>
        </Panel>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Privacy & data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-stone-800">
          <p>
            We store your email, name, optional self-introduction, your
            module submissions, and your AI Tutor messages in a Postgres
            database. We use one HTTP-only signed cookie to keep you signed
            in.
          </p>
          <p>
            We do not share your data with third parties beyond the
            Anthropic API used to power the AI Tutor (which receives the
            content of each tutor message and the relevant module context).
            See <a className="underline" href="https://www.anthropic.com/legal/privacy">Anthropic's privacy policy</a>.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
