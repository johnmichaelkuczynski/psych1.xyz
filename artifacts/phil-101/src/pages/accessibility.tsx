import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/page-shell";

export default function Accessibility() {
  return (
    <PageShell
      title="Accessibility"
      intro="We are committed to making this course usable by everyone, including students with disabilities."
    >
      <Section title="Statement of commitment">
        <p>
          Psychology 101 is designed to conform with the Web Content
          Accessibility Guidelines (WCAG) 2.1 Level AA. We treat
          accessibility as a continuous process and welcome feedback so we
          can improve.
        </p>
      </Section>

      <Section title="What we have done">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            All interactive controls (buttons, inputs, dialogs, menus) are
            built on Radix UI primitives, which provide ARIA semantics out
            of the box.
          </li>
          <li>
            Pages use semantic HTML (<code>&lt;header&gt;</code>,{" "}
            <code>&lt;nav&gt;</code>, <code>&lt;main&gt;</code>,{" "}
            <code>&lt;footer&gt;</code>) and one <code>&lt;h1&gt;</code> per
            page.
          </li>
          <li>
            Color contrast meets or exceeds 4.5:1 for body text and 3:1 for
            large text and UI components.
          </li>
          <li>
            All form fields have visible <code>&lt;label&gt;</code>{" "}
            elements; required fields are marked.
          </li>
          <li>
            The site is fully keyboard navigable. Focus rings are visible
            on all interactive elements.
          </li>
          <li>
            Page content reflows on viewports as narrow as 320 px without
            horizontal scrolling.
          </li>
          <li>
            The AI Tutor's streaming output is announced as it grows, and
            the chat input accepts Enter / Cmd-Enter for sending.
          </li>
        </ul>
      </Section>

      <Section title="Keyboard navigation map">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 text-xs">Tab</kbd>{" "}
            and{" "}
            <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 text-xs">Shift+Tab</kbd>{" "}
            move between interactive elements.
          </li>
          <li>
            <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 text-xs">Enter</kbd>{" "}
            activates buttons and links;{" "}
            <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 text-xs">Space</kbd>{" "}
            toggles checkboxes and switches.
          </li>
          <li>
            On the AI Tutor:{" "}
            <kbd className="rounded border bg-stone-100 px-1.5 py-0.5 text-xs">⌘/Ctrl+Enter</kbd>{" "}
            sends a message.
          </li>
          <li>
            Dialogs trap focus until dismissed and restore focus to the
            element that opened them.
          </li>
        </ul>
      </Section>

      <Section title="Assistive technology compatibility">
        <p>
          Tested with current versions of NVDA, JAWS, and VoiceOver in
          Chrome, Firefox, and Safari. If you encounter a problem with
          another assistive technology, please contact us so we can address
          it.
        </p>
      </Section>

      <Section title="Vendor accessibility statements">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Anthropic (AI Tutor):{" "}
            <a
              className="underline"
              href="https://www.anthropic.com/legal/accessibility"
            >
              anthropic.com/legal/accessibility
            </a>
          </li>
          <li>
            Radix UI (interactive primitives):{" "}
            <a
              className="underline"
              href="https://www.radix-ui.com/primitives/docs/overview/accessibility"
            >
              radix-ui.com/primitives/docs/overview/accessibility
            </a>
          </li>
        </ul>
      </Section>

      <Section title="Academic integrity & monitoring disclosure">
        <p>
          Every assignment in this course uses a two-box workflow: a{" "}
          <strong>Draft Workshop</strong> (where pasting and AI feedback
          are allowed) and a <strong>Submission Canvas</strong> (where
          your final answer is composed). Before you can submit, please
          understand:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Submissions are typed into a <strong>monitored canvas</strong>.
            Pasting from outside the canvas is disabled. You can still cut,
            copy, and rearrange text you typed yourself.
          </li>
          <li>
            Typing patterns and the final submitted text are analyzed by{" "}
            <strong>GPTZero</strong>. A traffic-light bar shows you the
            current AI-likelihood score in real time.
          </li>
          <li>
            Submissions flagged as likely AI-generated are reviewed by
            your instructor. You may always submit; flagged work is not
            blocked, but the flag is sent to the instructor with your
            submission.
          </li>
          <li>
            The complete <strong>keystroke history</strong> of every
            submission is logged, along with the live score history and an
            automated activity report. Your instructor can replay how the
            submission was composed.
          </li>
          <li>
            Students with documented accommodations may have monitoring
            disabled. Contact your instructor (or the disability services
            office below).
          </li>
        </ul>
        <p className="mt-3">
          The first time you open any module's assignment you will be
          asked to acknowledge this disclosure with a one-time{" "}
          <em>“I understand”</em> prompt.
        </p>
      </Section>

      <Section title="Requesting accommodations or alternative formats">
        <p>
          To request an accommodation, an accessible alternative format
          (e.g., a plain-text or large-print version of any reading), or to
          report an accessibility barrier, contact our disability services
          office at <strong>(555) 555-0145</strong> or{" "}
          <a className="underline" href="mailto:access@example.edu">
            access@example.edu
          </a>
          . We aim to respond within two business days.
        </p>
      </Section>
    </PageShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="prose prose-stone max-w-none text-stone-800">
        {children}
      </CardContent>
    </Card>
  );
}
