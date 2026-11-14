import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";

const TITLES: Record<string, string> = {
  "/": "TerraScope — What is changing on Earth, and is it real?",
  "/map": "Explore · TerraScope",
  "/split": "Compare · TerraScope",
  "/sync": "Side by side · TerraScope",
  "/analysis": "Area analysis · TerraScope",
  "/trends": "Trends · TerraScope",
  "/atlas": "Atlas · TerraScope",
};

export default function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = TITLES[pathname] ?? "Page not found · TerraScope";
  }, [pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[3000] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <Navbar />
      {/* On the home page the planet runs up behind the navigation bar. */}
      <main id="main" tabIndex={-1} className={`relative min-h-screen bg-background outline-none print:min-h-0 print:pt-0 ${pathname === "/" ? "" : "pt-16"}`}>
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
    </>
  );
}
