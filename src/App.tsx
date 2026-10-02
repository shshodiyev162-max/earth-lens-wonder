import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
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

const MAP_ROUTES = ["/map", "/split", "/sync"];

/** Skeleton shaped like the page that is loading, so the layout doesn't jump. */
function PageLoader() {
  const { pathname } = useLocation();
  if (MAP_ROUTES.includes(pathname)) {
    return (
      <div role="status" aria-label="Loading map" className="flex h-[calc(100dvh-4rem)] bg-space-deep">
        <div className="hidden w-[23rem] shrink-0 space-y-5 border-r border-border/60 p-5 panel lg:block">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="relative flex-1 gradient-hero">
          <div className="absolute inset-0 m-auto h-40 w-40 rounded-full bg-primary/5 blur-3xl animate-pulse-glow" />
        </div>
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading page" className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="grid gap-4 md:grid-cols-[22rem,1fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

function PageError() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 gradient-hero">
      <div role="alert" className="max-w-md rounded-2xl p-8 text-center glass">
        <h1 className="mb-2 font-display text-xl font-semibold text-foreground">Something went wrong on this page</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">Reload the page to try again. If it keeps happening, check your internet connection — the maps and data come from NASA over the internet.</p>
        <button type="button" onClick={() => window.location.reload()} className="btn-primary">
          Reload the page
        </button>
      </div>
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
