// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      // Pre-bundle heavy deps so Vite doesn't re-transform them on every cold-start request.
      include: [
        "lucide-react",
        "framer-motion",
        "recharts",
        "react-markdown",
        "tesseract.js",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "@supabase/supabase-js",
        "clsx",
        "tailwind-merge",
        "date-fns",
        "sonner",
      ],
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy vendor chunks so the browser can cache them independently
          // and parallel-download them. This avoids one giant bundle slowing down
          // initial page load.
          manualChunks(id) {
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
              return "vendor-charts";
            }
            if (id.includes("node_modules/framer-motion")) {
              return "vendor-motion";
            }
            if (id.includes("node_modules/tesseract.js")) {
              return "vendor-tesseract";
            }
            if (
              id.includes("node_modules/react-markdown") ||
              id.includes("node_modules/remark") ||
              id.includes("node_modules/rehype") ||
              id.includes("node_modules/unified") ||
              id.includes("node_modules/micromark")
            ) {
              return "vendor-markdown";
            }
            if (
              id.includes("node_modules/@radix-ui") ||
              id.includes("node_modules/cmdk") ||
              id.includes("node_modules/vaul")
            ) {
              return "vendor-radix";
            }
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")
            ) {
              return "vendor-react";
            }
          },
        },
      },
    },
  },
});
