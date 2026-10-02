import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";

const TITLES: Record<string, string> = {
  "/": "TerraVision — Explore and analyze Earth with NASA data",
  "/map": "Explore · TerraVision",
  "/split": "Compare · TerraVision",
  "/sync": "Side by side · TerraVision",
  "/analysis": "Area analysis · TerraVision",
  "/login": "Sign in · TerraVision",
};

export default function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = TITLES[pathname] ?? "Page not found · TerraVision";
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
      <main id="main" tabIndex={-1} className="relative min-h-screen bg-background pt-16 outline-none">
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
    </>
  );
}
