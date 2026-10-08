import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Profile } from "@/lib/health";

export function useProfile() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ["profile", uid],
    enabled: !!uid,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.timeout(8_000);
      const requestSignal = AbortSignal.any([signal, timeout]);
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid!).abortSignal(requestSignal).maybeSingle();
      if (error) throw error;
      return (data as unknown as Profile) ?? null;
    },
  });
}

export function useInvalidateProfile() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["profile"] });
}

export type Medicine = {
  id: string;
  name: string;
  dosage: string | null;
  form: string | null;
  times_per_day: number | null;
  specific_times: string[] | null;
  meal_relation: string | null;
  start_date: string | null;
  end_date: string | null;
  total_stock: number | null;
  notes: string | null;
  source: string | null;
};

export function useMedicines() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["medicines", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("medicines").select("*").order("created_at");
      if (error) throw error;
      return data as Medicine[];
    },
  });
}

export function useTodayDoses() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["doses-today", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from("dose_logs").select("*").gte("scheduled_at", start.toISOString());
      if (error) throw error;
      return data;
    },
  });
}
