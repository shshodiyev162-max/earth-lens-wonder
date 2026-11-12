import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Menu, X, Search, LogOut, Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import GlobalSearch from "@/components/search/GlobalSearch";
import NavSearch, { type NavSearchHandle } from "@/components/search/NavSearch";
import { OPEN_SEARCH_EVENT } from "@/components/search/openSearch";
import { useAuth } from "@/context/AuthContext";
import { isDemoMode } from "@/lib/apiClient";
import { ACCOUNTS_ENABLED } from "@/config";
import { useTheme } from "@/context/theme";

const navItems = [
  { to: "/", label: "Home", match: ["/"] },
  { to: "/map", label: "Explore", match: ["/map", "/split", "/sync"] },
  { to: "/trends", label: "Trends", match: ["/trends"] },
  { to: "/analysis", label: "Analysis", match: ["/analysis"] },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navSearchRef = useRef<NavSearchHandle>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const signedIn = !isDemoMode() && Boolean(user);

  // Over the home page's planet the bar uses the dark colours whatever the theme, and is clear at the very top.
  const [overPlanet, setOverPlanet] = useState<"top" | "scrolled" | null>(() => (location.pathname === "/" ? "top" : null));
  useEffect(() => {
    if (location.pathname !== "/") {
      setOverPlanet(null);
      return;
    }
    const update = () => {
      const story = document.getElementById("planet-story");
      const over = story ? story.getBoundingClientRect().bottom > 64 : true;
      setOverPlanet(over ? (window.scrollY < 24 ? "top" : "scrolled") : null);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [location.pathname]);

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
    <nav
      aria-label="Main"
      className={`fixed top-0 left-0 right-0 z-[2000] transition-colors duration-300 ${
        overPlanet === "top" && !mobileOpen
          ? "dark border-b border-transparent bg-transparent"
          : overPlanet
            ? "dark border-b border-white/10 bg-black/55 backdrop-blur-xl"
            : "border-b border-border bg-background/80 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-16 items-center justify-between gap-3 px-4 md:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 pointer-coarse:min-h-11" aria-label="TerraScope home">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="h-[26px] w-[26px] text-foreground">
            <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3.5 16c4.2 3.4 8.4 5 12.5 5s8.3-1.6 12.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
            <circle cx="21.5" cy="10.5" r="2.2" fill="currentColor" />
          </svg>
          <span className="font-editorial text-[1.4rem] leading-none tracking-[-0.005em] text-foreground">TerraScope</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center md:flex">
          {navItems.map((item) => {
            const active = isActive(item.match);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 items-center px-3.5 text-sm transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
                {active && <motion.span layoutId="nav-indicator" aria-hidden className="absolute inset-x-3.5 bottom-[-1px] h-px bg-foreground" transition={{ type: "spring", duration: 0.5 }} />}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 pointer-coarse:gap-0">
          {/* Search bar */}
          <NavSearch ref={navSearchRef} shortcut={isMac ? "⌘K" : "Ctrl K"} className="hidden w-44 md:block lg:w-64 xl:w-72" />
          <button type="button" onClick={() => setSearchOpen(true)} className="rounded-full p-2 text-muted-foreground hover:text-foreground md:hidden pointer-coarse:p-3" aria-label="Search places and layers">
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </button>

          {/* Light / dark mode */}
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground pointer-coarse:p-[13px]"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.5} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} />}
          </button>

          {!ACCOUNTS_ENABLED ? null : signedIn ? (
            <button
              type="button"
              onClick={signOut}
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex"
              title={user?.name || user?.email}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              Sign Out
            </button>
          ) : (
            <Link to="/login" className="hidden items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/85 md:flex">
              <User className="h-4 w-4" strokeWidth={1.5} />
              Sign In
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground md:hidden pointer-coarse:p-3"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div id="mobile-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive(item.match) ? "page" : undefined}
              className={`flex min-h-11 items-center border-b border-border font-editorial text-[1.5rem] last:border-b-0 ${isActive(item.match) ? "text-foreground" : "text-muted-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
          {!ACCOUNTS_ENABLED ? null : signedIn ? (
            <button type="button" onClick={signOut} className="flex min-h-11 w-full items-center gap-2 text-sm text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          ) : (
            <Link to="/login" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <User className="h-4 w-4" />
              Sign In
            </Link>
          )}
        </motion.div>
      )}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </nav>
  );
}
