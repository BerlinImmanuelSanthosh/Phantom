import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Logo, MeshBackground } from "@/components/phantom/ui";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { ease } from "@/lib/motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Phantom — AI health assistant" },
      { name: "description", content: "Your personal AI health assistant for vitals, diet, tablets and emergencies." },
      { property: "og:title", content: "Phantom — AI health assistant" },
      { property: "og:description", content: "Your personal AI health assistant for vitals, diet, tablets and emergencies." },
    ],
  }),
  component: Splash,
});

function Splash() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const profile = useProfile();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!done || loading) return;
    if (!session) return void nav({ to: "/auth", replace: true });
    if (profile.isLoading) return;
    nav({ to: profile.data?.onboarding_complete ? "/dashboard" : "/onboarding", replace: true });
  }, [done, loading, session, profile.isLoading, profile.data, nav]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <MeshBackground />
      <motion.div initial={{ scale: 0.6, opacity: 0, filter: "blur(10px)" }} animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.8, ease }}>
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
          <Logo size={96} />
        </motion.div>
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 10, letterSpacing: "0.4em" }} animate={{ opacity: 1, y: 0, letterSpacing: "0.12em" }} transition={{ delay: 0.35, duration: 0.8, ease }} className="mt-6 text-3xl font-bold text-foreground">
        PHANTOM
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-2 text-sm text-muted-foreground">
        Your quiet health companion
      </motion.p>
    </main>
  );
}
