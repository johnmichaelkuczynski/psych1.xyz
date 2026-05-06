import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentStudent,
  getGetCurrentStudentQueryKey,
  useLogin,
  useSaveIntro,
  getProgress,
  getGetProgressQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { BookOpen, MessagesSquare, ShieldCheck } from "lucide-react";

export default function StartHere() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: getGetCurrentStudentQueryKey(),
    queryFn: () => getCurrentStudent(),
  });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");

  const login = useLogin({
    mutation: {
      onSuccess: async () => {
        toast.success("Welcome to Psychology 101!");
        await qc.invalidateQueries({ queryKey: getGetCurrentStudentQueryKey() });
      },
      onError: (e) => toast.error(e.message),
    },
  });

  const saveIntro = useSaveIntro({
    mutation: {
      onSuccess: async () => {
        toast.success("Introduction saved");
        await qc.invalidateQueries({ queryKey: getGetProgressQueryKey() });
      },
      onError: (e) => toast.error(e.message),
    },
  });

  const progress = useQuery({
    queryKey: getGetProgressQueryKey(),
    queryFn: () => getProgress(),
    enabled: !!me.data?.student,
  });

  const student = me.data?.student;

  return (
    <PageShell
      title="Welcome to Psychology 101"
      intro="An introduction to the science of mind and behavior — how we think, learn, remember, and influence one another."
    >
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">About this course</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-stone max-w-none">
          <p>
            <strong>Psychology 101: Introduction to Psychology</strong> is a
            fully online, asynchronous college-level course. Over 13 modules
            you will encounter three foundational branches of psychology
            (cognitive, behavioral, and social), landmark studies from Pavlov
            and Skinner to Zimbardo, Milgram, and Loftus, and the tools of
            careful psychological reasoning. The course culminates in a short
            term paper analyzing a contemporary article in psychology.
          </p>
          <p>
            Your <strong>instructor of record</strong> is Dr. Lawrence Dodge,
            who authored the open-source course text used here. The{" "}
            <strong>AI Tutor</strong> on this site (Anthropic Claude Sonnet
            4.5) speaks for the instructor, asks Socratic questions, and gives
            formative feedback — but it will never write your work for you.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">How to get started</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-stone-800">
            <li>
              <strong>Sign in</strong> below with your email and name to create
              your record.
            </li>
            <li>
              Read the <Link href="/syllabus" className="underline">Syllabus</Link>
              {" "}for grading, schedule, and policies.
            </li>
            <li>
              Open <Link href="/modules" className="underline">Modules</Link>
              {" "}and begin Module 1. Modules unlock as you submit each one.
            </li>
            <li>
              Use the <Link href="/tutor/d1" className="underline">AI Tutor</Link>
              {" "}for any module to discuss the reading before you write.
            </li>
            <li>
              Track your progress in{" "}
              <Link href="/assessments" className="underline">Assessments</Link>.
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Technical requirements"
          body="Any modern browser (Chrome, Firefox, Safari, Edge) on desktop, tablet, or phone. A reliable internet connection. No software to install."
        />
        <InfoCard
          icon={<MessagesSquare className="h-5 w-5" />}
          title="Communication & Netiquette"
          body="Respectful disagreement is at the heart of psychological science. Argue with the evidence, not the person. Use clear, civil language in your AI Tutor sessions and submissions."
        />
        <InfoCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Academic integrity & AI policy"
          body="You may discuss any module with the AI Tutor. You must write your own submissions. Do not paste AI-generated text into your assignments — submissions are timestamped and reviewed."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Meet your instructor</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-stone max-w-none">
          <p>
            Dr. Lawrence Dodge has taught introductory psychology at the
            college level for over two decades. His teaching emphasises the
            Socratic method: progress comes not from being told the right
            answer but from being asked the right questions. The AI Tutor on
            this site is configured to teach in his voice and style.
          </p>
        </CardContent>
      </Card>

      <Card id="signin">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {student ? `You're signed in, ${student.name}` : "Sign in to begin"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!student ? (
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!email.trim() || !name.trim()) {
                  toast.error("Please enter both your email and your name.");
                  return;
                }
                login.mutate({ data: { email, name } });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={login.isPending}
                  data-testid="button-login"
                >
                  {login.isPending ? "Signing in…" : "Sign in / Register"}
                </Button>
                <p className="mt-2 text-xs text-stone-500">
                  We use a single signed cookie to remember your session — no
                  password.
                </p>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link href="/syllabus">
                <Button data-testid="button-go-syllabus">
                  Continue to Syllabus
                </Button>
              </Link>
              <Link href="/modules">
                <Button variant="outline" data-testid="button-go-modules">
                  Go to Modules
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {student && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Introduce yourself
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-stone-700">
              Tell the class (and your AI Tutor) a bit about yourself — what
              brought you to psychology, and what you hope to get out of this
              course. Your tutor will use this to personalise its questions.
            </p>
            <Textarea
              rows={5}
              placeholder="I'm a sophomore studying biology, and I've always wondered…"
              value={intro || progress.data?.intro || ""}
              onChange={(e) => setIntro(e.target.value)}
              data-testid="input-intro"
            />
            <Button
              onClick={() =>
                saveIntro.mutate({
                  data: { intro: intro || progress.data?.intro || "" },
                })
              }
              disabled={saveIntro.isPending}
              data-testid="button-save-intro"
            >
              {saveIntro.isPending ? "Saving…" : "Save introduction"}
            </Button>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2 text-stone-900">
          {icon}
          <h3 className="font-serif text-base font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-stone-700">{body}</p>
      </CardContent>
    </Card>
  );
}
