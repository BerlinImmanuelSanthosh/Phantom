import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type Notice = { id: string; kind: string; title: string; body: string | null; read: boolean; created_at: string };

export function useNotifications() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["notifications", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as Notice[];
    },
  });
}

function browserNotify(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch {
      /* some browsers need a service worker */
    }
  }
}

/** Checks every minute for due doses, missed doses, low stock and ending courses. */
export function useReminderEngine() {
  const { session } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function push(kind: string, key: string, title: string, body: string) {
      const { error } = await supabase.from("notifications").insert({ kind, title, body, dedupe_key: key });
      if (error) return; // duplicate → already notified
      toast(title, { description: body });
      browserNotify(title, body);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }

    async function check() {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const [{ data: meds }, { data: logs }] = await Promise.all([
        supabase.from("medicines").select("*"),
        supabase.from("dose_logs").select("medicine_id,scheduled_at").gte("scheduled_at", start.toISOString()),
      ]);
      if (cancelled || !meds) return;
      for (const m of meds) {
        for (const t of m.specific_times ?? []) {
          const [h, mi] = t.split(":").map(Number);
          const due = new Date(now);
          due.setHours(h ?? 0, mi ?? 0, 0, 0);
          const mins = (now.getTime() - due.getTime()) / 60000;
          const taken = (logs ?? []).some((l) => l.medicine_id === m.id && new Date(l.scheduled_at).toTimeString().slice(0, 5) === t);
          if (taken) continue;
          if (mins >= 0 && mins < 30) await push("dose", `dose-${m.id}-${day}-${t}`, `Time for ${m.name}`, `${m.dosage ?? ""} · ${m.meal_relation} food (${t})`);
          if (mins >= 30 && mins < 240) await push("missed", `missed-${m.id}-${day}-${t}`, `Missed: ${m.name}`, `Your ${t} dose hasn't been marked taken yet.`);
        }
        if (m.total_stock != null && m.total_stock <= 3) await push("stock", `stock-${m.id}-${m.total_stock}`, `Running low: ${m.name}`, `Only ${m.total_stock} doses left — time to refill.`);
        if (m.end_date) {
          const left = Math.ceil((new Date(m.end_date).getTime() - now.getTime()) / 86400000);
          if (left >= 0 && left <= 2) await push("course", `course-${m.id}-${m.end_date}`, `Course ending: ${m.name}`, `Your course finishes in ${left} day${left === 1 ? "" : "s"}.`);
        }
      }
    }

    check();
    const t = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session, qc]);
}
