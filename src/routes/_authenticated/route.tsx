import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LayoutDashboard, MessageCircle, ChefHat, Pill, Settings, Bell, Languages } from "lucide-react";
import { toast } from "sonner";
import { Logo, MeshBackground, Skeleton } from "@/components/phantom/ui";
import { CallProvider, SosButton } from "@/components/phantom/CallProvider";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useNotifications, useReminderEngine } from "@/hooks/useReminders";
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
    <CallProvider>
      <div className="min-h-screen md:pl-64">
        <MeshBackground />
        {ready && <ReminderEngine />}
        <aside className="glass fixed inset-y-4 left-4 z-30 hidden w-56 flex-col p-4 md:flex">
          <div className="mb-8 flex items-center gap-2 px-2">
            <Logo size={34} />
            <span className="font-display text-lg font-bold tracking-wide">PHANTOM</span>
          </div>
          <nav className="space-y-1" aria-label="Main">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors hover:bg-muted">
                  {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-cyan/50 bg-secondary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <n.icon size={20} className="relative" />
                  <span className="relative">{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <p className="mt-auto px-2 text-xs text-muted-foreground">Phantom is not a substitute for a doctor.</p>
        </aside>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:px-8 md:pb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 md:invisible"><Logo size={30} /><span className="font-display font-bold tracking-wide">PHANTOM</span></div>
            {ready && (
              <div className="flex items-center gap-3">
                <LanguageButton />
                <BellLink />
                <SosButton />
              </div>
            )}
          </div>
          {ready ? (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={pathname}
              variants={page}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ willChange: "opacity, transform" }}
            >
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
    </CallProvider>
  );
}

function ReminderEngine() {
  useReminderEngine();
  return null;
}

function BellLink() {
  const n = useNotifications();
  const unread = (n.data ?? []).filter((x) => !x.read).length;
  return (
    <Link to="/notifications" aria-label={`Notifications, ${unread} unread`} className="glass relative flex h-12 w-12 items-center justify-center rounded-full">
      <Bell size={22} />
      <AnimatePresence>
        {unread > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

function LanguageButton() {
  const [lang, setLang] = useState<"en" | "ta">("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("phantom-language");
      if (saved === "ta") setLang("ta");
    } catch {}

    if (!document.getElementById("google-translate-script")) {
      const gtDiv = document.createElement("div");
      gtDiv.id = "google_translate_element";
      gtDiv.style.display = "none";
      document.body.appendChild(gtDiv);

      const style = document.createElement("style");
      style.innerHTML = `
        iframe.goog-te-banner-frame { display: none !important; visibility: hidden !important; }
        .goog-te-banner-frame { display: none !important; }
        .skiptranslate > iframe { display: none !important; }
        html, body { top: 0px !important; }
        .goog-tooltip, #goog-gt-tt, .VIpgJd-yAWNEb-VIpgJd-fmcmS-sn54Q { display: none !important; }
        .goog-tooltip:hover { display: none !important; }
        .goog-text-highlight { background-color: transparent !important; border: none !important; box-shadow: none !important; }
      `;
      document.head.appendChild(style);

      ;(window as any).googleTranslateElementInit = () => {
        new (window as any).google.translate.TranslateElement(
          { pageLanguage: 'en', includedLanguages: 'ta,en', autoDisplay: false },
          'google_translate_element'
        );
      };

      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      document.body.appendChild(script);
    }
  }, []);

  function toggle() {
    const newLang = lang === "en" ? "ta" : "en";
    setLang(newLang);
    try {
      localStorage.setItem("phantom-language", newLang);
      if (newLang === "ta") {
        document.cookie = "googtrans=/en/ta; path=/";
        document.cookie = "googtrans=/en/ta; domain=" + window.location.hostname + "; path=/";
      } else {
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=" + window.location.hostname + "; path=/;";
        document.cookie = "googtrans=/en/en; path=/";
        document.cookie = "googtrans=/en/en; domain=" + window.location.hostname + "; path=/";
      }
    } catch {}
    toast.success(newLang === "ta" ? "Translating to Tamil..." : "Restoring English...");
    setTimeout(() => window.location.reload(), 500);
  }

  return (
    <button onClick={toggle} aria-label={`Switch to ${lang === "en" ? "Tamil" : "English"}`} className="glass flex h-12 w-12 items-center justify-center rounded-full font-bold text-sm text-foreground hover:bg-muted transition-colors notranslate">
      {lang === "en" ? "EN" : "தமிழ்"}
    </button>
  );
}
