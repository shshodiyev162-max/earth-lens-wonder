import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Globe, Info, Lock, Mail, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, error, demo } = useAuth();

  const from = (location.state as { from?: string } | null)?.from ?? "/map";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (isSignUp) await register(name, email, password);
      else await login(email, password);
      navigate(from, { replace: true });
    } catch {
      /* error is shown from context */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-12 gradient-hero">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6" aria-label="TerraVision home">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary-foreground" />
            </div>
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground">{isSignUp ? "Create Account" : "Welcome Back"}</h1>
          <p className="text-muted-foreground text-sm mt-2">{isSignUp ? "Join TerraVision to save your areas across devices" : "Sign in to continue exploring Earth"}</p>
        </div>

        {demo && (
          <div className="mb-4 flex gap-2 rounded-xl glass p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Accounts need a backend (<code className="text-foreground">VITE_API_BASE_URL</code>). This deployment runs without one, so everything already works and your
              areas are stored on this device.{" "}
              <Link to="/map" className="text-primary hover:underline">
                Go to the map →
              </Link>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="text-sm text-muted-foreground mb-1.5 block">
                Name
              </label>
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 focus-within:ring-1 focus-within:ring-primary/50">
                <User className="w-4 h-4 text-muted-foreground" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="bg-transparent flex-1 min-w-0 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="text-sm text-muted-foreground mb-1.5 block">
              Email
            </label>
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 focus-within:ring-1 focus-within:ring-primary/50">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="bg-transparent flex-1 min-w-0 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="text-sm text-muted-foreground mb-1.5 block">
              Password
            </label>
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 focus-within:ring-1 focus-within:ring-primary/50">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="bg-transparent flex-1 min-w-0 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-display font-semibold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity mt-2"
          >
            {submitting ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
            <ArrowRight className="w-4 h-4" />
          </button>

          {error && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline">
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
