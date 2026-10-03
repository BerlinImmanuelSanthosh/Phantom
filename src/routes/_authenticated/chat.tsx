import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { ComingNext } from "@/components/phantom/ComingNext";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Phantom" },
      { name: "description", content: "Talk to Phantom, your AI health assistant." },
      { property: "og:title", content: "Chat — Phantom" },
      { property: "og:description", content: "Talk to Phantom, your AI health assistant." },
    ],
  }),
  component: () => (
    <ComingNext icon={MessageCircle} title="Chat" text="Your AI health assistant is being prepared and will know your profile, vitals and tablets."
      points={["Streaming answers", "Prescription scan to tablets", "Emergency calling", "Voice input"]} />
  ),
});
