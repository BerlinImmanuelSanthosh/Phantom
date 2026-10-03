import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Logo, MeshBackground } from "@/components/phantom/ui";
import { generateInsight } from "@/lib/insight.functions";
import { ease } from "@/lib/motion";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Setting up your Phantom" },
      { name: "description", content: "Phantom is preparing your personalised health dashboard." },
      { property: "og:title", content: "Setting up your Phantom" },
      { property: "og:description", content: "Phantom is preparing your personalised health dashboard." },
    ],
  }),
  component: Setup,
});

const STEPS = ["Analysing your vitals", "Calculating BMI & calorie target", "Preparing your diet engine", "Loading your medicine schedule", "Connecting your assistant"];

function Setup() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const gen = useServerFn(generateInsight);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const insight = gen().catch(() => null);
    let i = 0;
    const t = setInterval(async () => {
      i++;
      if (i < STEPS.length) return setDone(i);
      clearInterval(t);
      await insight;
      setDone(STEPS.length);
      await qc.invalidateQueries({ queryKey: ["profile"] });
      setTimeout(() => nav({ to: "/dashboard", replace: true }), 500);
    }, 750);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <MeshBackground />
      <div className="glass w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rounded-full p-2 pulse-glow">
            <Logo size={64} />
          </motion.div>
          <h1 className="mt-5 text-2xl font-bold">Setting up your Phantom…</h1>
        </div>
        <ul className="mt-8 space-y-4">
          {STEPS.map((s, i) => {
            const ok = i < done;
            const active = i === done;
            return (
              <motion.li key={s} initial={{ opacity: 0, x: -10 }} animate={{ opacity: i <= done ? 1 : 0.4, x: 0 }} transition={{ delay: i * 0.08, ease }} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${ok ? "border-cyan bg-secondary" : "border-indigo/20"}`}>
                  {ok ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4"><motion.path d="M5 12l5 5 9-10" fill="none" stroke="var(--indigo)" strokeWidth={3} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} /></svg>
                  ) : active ? (
                    <motion.span className="h-3 w-3 rounded-full bg-cyan" animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                  ) : null}
                </span>
                <span className="font-medium">{s}</span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
