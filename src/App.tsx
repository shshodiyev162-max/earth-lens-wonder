import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "./components/Layout";
import PlanetLimb from "./components/common/PlanetLimb";
import ErrorBoundary from "./components/ErrorBoundary";
import { RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./context/AuthContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { ThemeProvider } from "./context/ThemeProvider";
import { useTheme } from "./context/theme";
import { ACCOUNTS_ENABLED } from "./config";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

const Explore = lazy(() => import("./pages/Explore"));
const SplitView = lazy(() => import("./pages/SplitView"));
const SyncView = lazy(() => import("./pages/SyncView"));
const Analysis = lazy(() => import("./pages/Analysis"));
const Trends = lazy(() => import("./pages/Trends"));
const Atlas = lazy(() => import("./pages/Atlas"));
const Login = lazy(() => import("./pages/Login"));

const queryClient = new QueryClient();

const MAP_ROUTES = ["/map", "/split", "/sync", "/trends"];

/** Placeholder shaped like the page that is loading, so the layout doesn't jump. */
function PageLoader() {
  const { pathname } = useLocation();
  if (MAP_ROUTES.includes(pathname)) {
    return (
      <div role="status" aria-label="Loading map" className="flex h-[calc(100dvh-4rem)] bg-[#03040a]">
        <div className="hidden w-[24rem] shrink-0 space-y-5 border-r border-panel-line bg-panel px-6 pt-7 lg:block">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-20 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex-1" />
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading page" className="flex min-h-[calc(100dvh-4rem)]">
      <div className="hidden w-[24rem] shrink-0 space-y-5 border-r border-border px-6 pt-7 lg:block">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-20 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-72 w-full rounded-none" />
      </div>
    </div>
  );
}

function PageError() {
  return (
    <div className="dark relative flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden px-6 md:px-12">
      <PlanetLimb />
      <div role="alert" className="relative mx-auto w-full max-w-[1400px] pb-[18vh]">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">Error</p>
        <h1 className="mt-5 max-w-3xl font-editorial text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] tracking-[-0.015em] text-white">Something went wrong on this page</h1>
        <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/80">Reload the page to try again. If it keeps happening, check your internet connection: the maps and data come from NASA over the internet.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-9 inline-flex min-h-12 items-center rounded-full bg-white px-7 py-3 text-[15px] font-medium text-black transition-colors hover:bg-white/85">
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
  return protectedRoute && ACCOUNTS_ENABLED ? <RequireAuth>{content}</RequireAuth> : content;
}

function Notifications() {
  const { theme } = useTheme();
  return <Sonner theme={theme} position="bottom-right" richColors closeButton />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider delayDuration={250}>
      <Notifications />
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
                <Route path="/trends" element={<Page protectedRoute><Trends /></Page>} />
                <Route path="/atlas" element={<Page protectedRoute><Atlas /></Page>} />
                {ACCOUNTS_ENABLED && <Route path="/login" element={<Page><Login /></Page>} />}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
