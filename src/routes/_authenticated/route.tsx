import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { LayoutDashboard, MessageCircle, ChefHat, Pill, Settings } from "lucide-react";
import { Logo, MeshBackground, Skeleton } from "@/components/phantom/ui";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { page } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Shell,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/food", label: "Food Maker", icon: ChefHat },
  { to: "/tablets", label: "Tablets", icon: Pill },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Shell() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { session, loading } = useAuth();
  const profile = useProfile();

  useEffect(() => {
    if (!loading && !session) nav({ to: "/", replace: true });
    else if (profile.data && !profile.data.onboarding_complete) nav({ to: "/onboarding", replace: true });
  }, [loading, session, profile.data, nav]);

  const ready = session && profile.data?.onboarding_complete;

  return (
    <div className="min-h-screen md:pl-64">
      <MeshBackground />
      <aside className="glass fixed inset-y-4 left-4 z-30 hidden w-56 flex-col p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <Logo size={34} />
          <span className="font-display text-lg font-bold tracking-wide">PHANTOM</span>
        </div>
        <nav className="space-y-1" aria-label="Main">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium">
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-cyan/50 bg-secondary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <n.icon size={20} className="relative" />
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-10">
        {ready ? (
          <AnimatePresence mode="wait">
            <motion.div key={pathname} variants={page} initial="initial" animate="animate" exit="exit">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-12 w-64" />
            <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
            <Skeleton className="h-64" />
          </div>
        )}
      </main>

      <nav aria-label="Main" className="glass fixed inset-x-3 bottom-3 z-30 flex justify-around px-2 py-2 md:hidden">
        {NAV.map((n) => {
          const active = pathname.startsWith(n.to);
          return (
            <Link key={n.to} to={n.to} aria-label={n.label} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium">
              {active && <motion.span layoutId="nav-active-m" className="absolute inset-0 rounded-xl bg-secondary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <n.icon size={20} className="relative" />
              <span className={cn("relative", !active && "text-muted-foreground")}>{n.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
