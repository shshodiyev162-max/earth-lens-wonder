import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./context/AuthContext";
import { RegionProvider } from "./context/RegionContext";
import Landing from "./pages/Landing";
import ExplorePage from "./pages/Explore";
import SplitView from "./pages/SplitView";
import SyncView from "./pages/SyncView";
import Analysis from "./pages/Analysis";
import Missions from "./pages/Missions";
import Tracker from "./pages/Tracker";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <RegionProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Landing />} />
                <Route
                  path="/map"
                  element={
                    <RequireAuth>
                      <ExplorePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/split"
                  element={
                    <RequireAuth>
                      <SplitView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/sync"
                  element={
                    <RequireAuth>
                      <SyncView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/analysis"
                  element={
                    <RequireAuth>
                      <Analysis />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/missions"
                  element={
                    <RequireAuth>
                      <Missions />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/tracker"
                  element={
                    <RequireAuth>
                      <Tracker />
                    </RequireAuth>
                  }
                />
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RegionProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
