import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CheckCheck, Pill, PackageOpen, CalendarClock, AlarmClockOff, Siren } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/useReminders";
import { GhostButton, GlassCard, Skeleton } from "@/components/phantom/ui";
import { stagger } from "@/lib/motion";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Phantom" },
      { name: "description", content: "Dose reminders, refill and course alerts from Phantom." },
      { property: "og:title", content: "Notifications — Phantom" },
      { property: "og:description", content: "Dose reminders, refill and course alerts from Phantom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Notifications,
});

const ICON = { dose: Pill, missed: AlarmClockOff, stock: PackageOpen, course: CalendarClock, sos: Siren } as Record<string, typeof Bell>;

function Notifications() {
  const qc = useQueryClient();
  const n = useNotifications();
  const unread = (n.data ?? []).filter((x) => !x.read).length;
  const canAsk = typeof Notification !== "undefined" && Notification.permission === "default";

  async function readAll() {
    await supabase.from("notifications").update({ read: true }).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function readOne(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Notifications</h1><p className="text-sm text-muted-foreground">{unread} unread</p></div>
        <div className="flex gap-2">
          {canAsk && <GhostButton onClick={() => Notification.requestPermission().then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))}><BellRing size={18} /> Enable alerts</GhostButton>}
          <GhostButton onClick={readAll} disabled={!unread}><CheckCheck size={18} /> Mark all read</GhostButton>
        </div>
      </header>
      {n.isLoading ? <Skeleton className="h-48" /> : (n.data ?? []).length === 0 ? (
        <GlassCard hover={false} className="py-12 text-center"><Bell size={40} className="mx-auto" /><p className="mt-3 text-muted-foreground">All quiet. Reminders will show up here.</p></GlassCard>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {n.data!.map((x) => {
              const Icon = ICON[x.kind] ?? Bell;
              return (
                <motion.button layout key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={() => readOne(x.id)} className={`glass flex w-full items-start gap-3 p-4 text-left ${x.read ? "opacity-70" : ""}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary"><Icon size={20} /></span>
                  <span className="flex-1"><span className="block font-semibold">{x.title}</span><span className="text-sm text-muted-foreground">{x.body}</span></span>
                  <span className="flex flex-col items-end gap-1 text-xs text-muted-foreground">{new Date(x.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}{!x.read && <span className="h-2.5 w-2.5 rounded-full bg-destructive" />}</span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
