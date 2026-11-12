import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Info, Lock, Mail, User } from "lucide-react";
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
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-8">
          <p className="eyebrow">Account</p>
          <h1 className="mt-3 font-editorial text-[clamp(2.75rem,6vw,3.75rem)] leading-[1.03] tracking-[-0.012em] text-foreground">{isSignUp ? "Create an account." : "Welcome back."}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{isSignUp ? "Join TerraScope to save your areas across devices" : "Sign in to continue exploring Earth"}</p>
        </div>

        {demo && (
          <div className="mb-5 flex gap-2 rounded-lg border border-border p-3.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>
              Accounts need a backend (<code className="text-foreground">VITE_API_BASE_URL</code>). This deployment runs without one, so everything already works and your
              areas are stored on this device.{" "}
              <Link to="/map" className="text-foreground underline underline-offset-4">
                Go to the map →
              </Link>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="field-label mb-2 block">
                Name
              </label>
              <div className="flex items-center gap-2 rounded-md border border-panel-line-strong px-3.5 py-2.5 transition-colors focus-within:border-panel-foreground/70">
                <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
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
            <label htmlFor="email" className="field-label mb-2 block">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-md border border-panel-line-strong px-3.5 py-2.5 transition-colors focus-within:border-panel-foreground/70">
              <Mail className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
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
            <label htmlFor="password" className="field-label mb-2 block">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-md border border-panel-line-strong px-3.5 py-2.5 transition-colors focus-within:border-panel-foreground/70">
              <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
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
            className="btn-solid group mt-2 w-full"
          >
            {submitting ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </button>

          {error && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-foreground underline underline-offset-4">
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
