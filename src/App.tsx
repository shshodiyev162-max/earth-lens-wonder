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

/** Placeholder shaped like the page that is loading, so the layout doesn't jump. */
function PageLoader() {
  const { pathname } = useLocation();
  if (MAP_ROUTES.includes(pathname)) {
    return (
      <div role="status" aria-label="Loading map" className="flex h-[calc(100dvh-4rem)] bg-[#02070d]">
        <div className="hidden w-[22rem] shrink-0 space-y-5 border-r border-white/10 bg-[#07111d]/98 p-5 lg:block">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
        <div className="flex-1" />
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading page" className="max-w-7xl mx-auto px-6 py-12 space-y-8">
      <Skeleton className="h-9 w-64 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function PageError() {
  return (
    <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-6 gradient-hero">
      <div role="alert" className="glass rounded-2xl p-8 max-w-md text-center">
        <h1 className="text-xl font-display font-bold text-foreground mb-2">Something went wrong on this page</h1>
        <p className="text-sm text-muted-foreground mb-6">Reload the page to try again. If it keeps happening, check your internet connection — the maps and data come from NASA over the internet.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-display font-semibold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
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
