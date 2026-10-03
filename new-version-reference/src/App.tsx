import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import { RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./context/AuthContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

const Explore = lazy(() => import("./pages/Explore"));
const SplitView = lazy(() => import("./pages/SplitView"));
const SyncView = lazy(() => import("./pages/SyncView"));
const Analysis = lazy(() => import("./pages/Analysis"));
const Login = lazy(() => import("./pages/Login"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-[#02070d]">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
    </div>
  );
}

function PageError() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold text-white">Something went wrong on this page</h1>
      <p className="max-w-md text-sm text-slate-400">Reload the page to try again. If it keeps happening, check your internet connection — the maps and data come live from NASA.</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Reload
      </button>
    </div>
  );
}

function Page({ children, protectedRoute }: { children: ReactNode; protectedRoute?: boolean }) {
  const content = (
    <ErrorBoundary fallback={<PageError />}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
  return protectedRoute ? <RequireAuth>{content}</RequireAuth> : content;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={250}>
      <Sonner theme="dark" position="bottom-right" richColors closeButton />
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Landing />} />
                <Route path="/map" element={<Page protectedRoute><Explore /></Page>} />
                <Route path="/split" element={<Page protectedRoute><SplitView /></Page>} />
                <Route path="/sync" element={<Page protectedRoute><SyncView /></Page>} />
                <Route path="/analysis" element={<Page protectedRoute><Analysis /></Page>} />
                <Route path="/login" element={<Page><Login /></Page>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
