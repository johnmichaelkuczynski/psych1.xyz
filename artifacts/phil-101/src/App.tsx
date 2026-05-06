import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/page-shell";
import { RequireAuth } from "@/components/require-auth";
import StartHere from "@/pages/start-here";
import Syllabus from "@/pages/syllabus";
import Modules from "@/pages/modules";
import ModuleDetail from "@/pages/module-detail";
import Tutor from "@/pages/tutor";
import Assessments from "@/pages/assessments";
import Support from "@/pages/support";
import Accessibility from "@/pages/accessibility";
import AdminSubmissions from "@/pages/admin-submissions";
import AdminSubmissionDetail from "@/pages/admin-submission-detail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Routes() {
  return (
    <Switch>
      <Route path="/" component={StartHere} />
      <Route path="/syllabus">
        <RequireAuth>
          <Syllabus />
        </RequireAuth>
      </Route>
      <Route path="/modules">
        <RequireAuth>
          <Modules />
        </RequireAuth>
      </Route>
      <Route path="/modules/:id">
        <RequireAuth>
          <ModuleDetail />
        </RequireAuth>
      </Route>
      <Route path="/tutor/:moduleId">
        <RequireAuth>
          <Tutor />
        </RequireAuth>
      </Route>
      <Route path="/assessments">
        <RequireAuth>
          <Assessments />
        </RequireAuth>
      </Route>
      <Route path="/support" component={Support} />
      <Route path="/accessibility" component={Accessibility} />
      <Route path="/admin/submissions">
        <RequireAuth>
          <AdminSubmissions />
        </RequireAuth>
      </Route>
      <Route path="/admin/submissions/:id">
        <RequireAuth>
          <AdminSubmissionDetail />
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
            <Nav />
            <main className="flex-1">
              <Routes />
            </main>
            <Footer />
          </div>
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
