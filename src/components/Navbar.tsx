import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, Map, GitCompare, BarChart3, Leaf, User, Menu, X, ChevronDown } from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/", label: "Home", icon: Globe },
  { to: "/map", label: "Earth Pulse", icon: Map },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/missions", label: "Missions", icon: Leaf },
  { to: "/tracker", label: "Eco Impact Tracker", icon: GitCompare },
];

const regions = [
  { id: "world", name: "World", bbox: null },
  { id: "uzbekistan", name: "Uzbekistan", bbox: [55, 37, 73, 46] },
  { id: "central-asia", name: "Central Asia", bbox: [45, 35, 80, 55] },
  { id: "amazon", name: "Amazon Basin", bbox: [-80, -20, -45, 8] },
];

export default function Navbar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(regions[0]);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[2000] glass-strong">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg text-foreground">WorldViewMaps</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5">
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
          {/* Region Selector */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="w-4 h-4" />
              {selectedRegion.name}
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showRegionDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
              >
                {regions.map((region) => (
                  <button
                    key={region.id}
                    onClick={() => {
                      setSelectedRegion(region);
                      setShowRegionDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/10 transition-colors ${
                      selectedRegion.id === region.id ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {region.name}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          <Link
            to="/login"
            className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <User className="w-4 h-4" />
            Sign In
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden glass-strong border-t border-border p-4 space-y-1"
        >
          {/* Region selector for mobile */}
          <div className="pb-2 mb-2 border-b border-border">
            <p className="text-xs text-muted-foreground mb-2">Select Region</p>
            <div className="flex flex-wrap gap-2">
              {regions.map((region) => (
                <button
                  key={region.id}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-3 py-1.5 rounded-lg text-xs ${
                    selectedRegion.id === region.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  {region.name}
                </button>
              ))}
            </div>
          </div>
          
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                location.pathname === item.to ? "text-primary bg-primary/10" : "text-muted-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
          <Link
            to="/login"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-primary"
          >
            <User className="w-4 h-4" />
            Sign In
          </Link>
        </motion.div>
      )}
    </nav>
  );
}

