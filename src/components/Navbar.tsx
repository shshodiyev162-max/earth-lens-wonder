import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, Map, BarChart3, User, Menu, X, Search, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import GlobalSearch from "@/components/search/GlobalSearch";
import NavSearch, { type NavSearchHandle } from "@/components/search/NavSearch";
import { OPEN_SEARCH_EVENT } from "@/components/search/openSearch";
import { useAuth } from "@/context/AuthContext";
import { isDemoMode } from "@/lib/apiClient";
import { ACCOUNTS_ENABLED } from "@/config";

const navItems = [
  { to: "/", label: "Home", icon: Globe, match: ["/"] },
  { to: "/map", label: "Explore", icon: Map, match: ["/map", "/split", "/sync"] },
  { to: "/analysis", label: "Analysis", icon: BarChart3, match: ["/analysis"] },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navSearchRef = useRef<NavSearchHandle>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const signedIn = !isDemoMode() && Boolean(user);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Ctrl/⌘K and "/" jump to the search bar at the top (or open the search window on small screens).
  useEffect(() => {
    const openSearch = () => {
      if (window.matchMedia("(min-width: 768px)").matches && navSearchRef.current) navSearchRef.current.focus();
      else setSearchOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openSearch();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, openSearch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, openSearch);
    };
  }, []);

  const isActive = (match: string[]) => match.includes(location.pathname);

  const signOut = async () => {
    await logout();
    navigate("/");
  };

  return (
    <nav aria-label="Main" className="fixed top-0 left-0 right-0 z-[2000] glass-strong">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="TerraVision home">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg text-foreground">TerraVision</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = isActive(item.match);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="relative z-10 flex items-center gap-1.5">
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/20"
                    transition={{ type: "spring", duration: 0.5 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Search bar */}
          <NavSearch ref={navSearchRef} shortcut={isMac ? "⌘K" : "Ctrl K"} className="hidden md:block w-44 lg:w-64 xl:w-72" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Search places and layers"
          >
            <Search className="w-5 h-5" />
          </button>

          {!ACCOUNTS_ENABLED ? null : signedIn ? (
            <button
              type="button"
              onClick={signOut}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              title={user?.name || user?.email}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <Link
              to="/login"
              className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <User className="w-4 h-4" />
              Sign In
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          id="mobile-menu"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden glass-strong border-t border-border p-4 space-y-1"
        >
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive(item.match) ? "page" : undefined}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                isActive(item.match) ? "text-primary bg-primary/10" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
          {!ACCOUNTS_ENABLED ? null : signedIn ? (
            <button type="button" onClick={signOut} className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          ) : (
            <Link to="/login" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-primary">
              <User className="w-4 h-4" />
              Sign In
            </Link>
          )}
        </motion.div>
      )}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </nav>
  );
}
