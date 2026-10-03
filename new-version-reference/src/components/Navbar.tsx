import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart3, Globe2, LogOut, Map as MapIcon, Menu, Search, User, X } from "lucide-react";
import GlobalSearch from "@/components/search/GlobalSearch";
import { useAuth } from "@/context/AuthContext";
import { isDemoMode } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/map", label: "Explore", icon: MapIcon, match: ["/map", "/split", "/sync"] },
  { to: "/analysis", label: "Analysis", icon: BarChart3, match: ["/analysis"] },
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shadow-lg shadow-primary/20">
        <Globe2 className="h-5 w-5 text-primary-foreground" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        Terra<span className="text-primary">Vision</span>
      </span>
    </span>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (match: string[]) => match.includes(location.pathname);
  const showAccount = !isDemoMode();

  return (
    <>
      <nav className="fixed left-0 right-0 top-0 z-[2000] border-b border-white/[0.06] bg-[#050b13]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="TerraVision home">
            <BrandMark />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.match);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <span className="relative z-10 flex items-center gap-1.5">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {active && (
                    <motion.span layoutId="nav-indicator" className="absolute inset-0 rounded-lg border border-primary/20 bg-primary/10" transition={{ type: "spring", duration: 0.45 }} />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-400 transition hover:border-primary/40 hover:text-white sm:flex"
              aria-label="Search places and layers"
            >
              <Search className="h-4 w-4" />
              <span className="hidden lg:inline">Search places…</span>
              <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 lg:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <button type="button" onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:text-foreground sm:hidden" aria-label="Search">
              <Search className="h-5 w-5" />
            </button>

            {showAccount &&
              (user ? (
                <div className="hidden items-center gap-2 md:flex">
                  <span className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-300">
                    <User className="h-4 w-4 text-primary" /> {user.name || user.email}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      navigate("/");
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              ) : (
                <Link to="/login" className="hidden items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:flex">
                  <User className="h-4 w-4" /> Sign in
                </Link>
              ))}

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1 border-t border-white/10 bg-[#050b13]/95 p-4 md:hidden">
            {[{ to: "/", label: "Home", icon: Globe2, match: ["/"] }, ...NAV_ITEMS].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn("flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm", isActive(item.match) ? "bg-primary/10 text-primary" : "text-muted-foreground")}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            {showAccount &&
              (user ? (
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
                >
                  <LogOut className="h-4 w-4" /> Sign out ({user.name || user.email})
                </button>
              ) : (
                <Link to="/login" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-primary">
                  <User className="h-4 w-4" /> Sign in
                </Link>
              ))}
          </motion.div>
        )}
      </nav>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
