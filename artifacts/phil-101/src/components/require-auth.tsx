import { type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  getCurrentStudent,
  getGetCurrentStudentQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useQuery({
    queryKey: getGetCurrentStudentQueryKey(),
    queryFn: () => getCurrentStudent(),
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
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="space-y-4 p-8">
            <h2 className="font-serif text-xl font-semibold text-stone-900">
              Please sign in to continue
            </h2>
            <p className="text-stone-700">
              This part of the course is only available to enrolled students.
              Visit the Start Here page to register or sign in.
            </p>
            <Link href="/">
              <Button data-testid="button-go-start">Go to Start Here</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
