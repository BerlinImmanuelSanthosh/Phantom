import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "./ui";
import { stagger } from "@/lib/motion";

export function ComingNext({ icon: Icon, title, text, points }: { icon: LucideIcon; title: string; text: string; points: string[] }) {
  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <h1 className="text-3xl font-bold">{title}</h1>
      <GlassCard hover={false} className="py-10 text-center">
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }} className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary glow-cyan">
          <Icon size={36} />
        </motion.div>
        <p className="mx-auto mt-5 max-w-md text-muted-foreground">{text}</p>
        <ul className="mx-auto mt-6 grid max-w-lg gap-2 text-left text-sm sm:grid-cols-2">
          {points.map((p) => <li key={p} className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan" />{p}</li>)}
        </ul>
      </GlassCard>
    </motion.div>
  );
}
