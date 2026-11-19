import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LanguageProvider } from "./i18n";
import "./theme.css";

// Telegram Mini App: tell Telegram the app is ready and ask for the
// full-height view. Guarded — in a plain browser window.Telegram is
// absent and the game runs exactly as before.
try {
  const tg = window.Telegram?.WebApp;
  tg?.ready();
  tg?.expand();
} catch {
  // Bukan di dalam Telegram — abaikan.
}

// Standalone build (no Muse SDK): a plain shared QueryClient.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The game state is polled every 5s by the app anyway; a failed
      // poll should not spam retries on top of that.
      retry: 1,
      staleTime: 2000,
    },
  },
});

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <div className="hatch-space-root" data-hatch-space-root>
          <App />
        </div>
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
);
