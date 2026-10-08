import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Preload route chunks + data when user hovers/focuses a link.
    // By the time they click, the JS chunk is already in cache — no network wait.
    defaultPreload: "intent",
    defaultPendingMinMs: 0,
  });

  return router;
};
