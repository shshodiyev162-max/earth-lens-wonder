import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Info, Lock, Mail, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { BrandMark } from "@/components/Navbar";

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
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 py-12 gradient-hero">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex">
            <BrandMark />
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{isSignUp ? "Save areas and analyses across devices." : "Sign in to continue exploring Earth."}</p>
        </div>

        {demo && (
          <div className="mb-4 flex gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-3 text-xs leading-relaxed text-slate-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Accounts need a backend (<code className="text-slate-200">VITE_API_BASE_URL</code>). This deployment runs without one, so everything already works and
              your areas are stored on this device. <Link to="/map" className="text-primary hover:underline">Go to the map →</Link>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass space-y-4 rounded-2xl p-8">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm text-muted-foreground">
                Name
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-muted-foreground">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-muted-foreground">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-display font-semibold text-primary-foreground transition-opacity gradient-primary hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            <ArrowRight className="h-4 w-4" />
          </button>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              <p>{error}</p>
            </div>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline">
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
