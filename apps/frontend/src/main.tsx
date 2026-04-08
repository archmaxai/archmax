import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import {
  CircleCheck,
  Info,
  TriangleAlert,
  OctagonX,
  Loader2,
} from "lucide-react";
import { routeTree } from "./routeTree.gen";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-center"
        icons={{
          success: <CircleCheck className="size-4" />,
          info: <Info className="size-4" />,
          warning: <TriangleAlert className="size-4" />,
          error: <OctagonX className="size-4" />,
          loading: <Loader2 className="size-4 animate-spin" />,
        }}
        style={{
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties}
      />
    </QueryClientProvider>
  </StrictMode>,
);
