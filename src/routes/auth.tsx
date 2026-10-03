import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Field, GhostButton, Logo, MeshBackground, PrimaryButton, inputCls } from "@/components/phantom/ui";
import { useAuth } from "@/hooks/useAuth";
import { page } from "@/lib/motion";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Phantom" },
      { name: "description", content: "Sign in to Phantom, your AI health assistant." },
      { property: "og:title", content: "Sign in — Phantom" },
      { property: "og:description", content: "Sign in to Phantom, your AI health assistant." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) nav({ to: "/", replace: true });
  }, [session, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password needs at least 6 characters");
    setBusy(true);
    const { error, data } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (mode === "up" && !data.session) toast.success("Check your email to confirm your account.");
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Google sign-in failed");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <MeshBackground />
      <motion.div variants={page} initial="initial" animate="animate" className="glass w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-bold">{mode === "in" ? "Welcome back" : "Create your Phantom"}</h1>
            <p className="text-sm text-muted-foreground">Your health, quietly looked after.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
          </Field>
          <Field label="Password">
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
          </Field>
          <PrimaryButton type="submit" disabled={busy} className="pulse-glow w-full">
            <Mail /> {mode === "in" ? "Sign in" : "Sign up"}
          </PrimaryButton>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <GhostButton onClick={google} className="w-full">Continue with Google</GhostButton>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-5 w-full text-center text-sm font-medium text-foreground underline-offset-4 hover:underline">
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </motion.div>
    </main>
  );
}
