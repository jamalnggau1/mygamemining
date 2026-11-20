declare module "*.css";
declare module "*.webp";
declare module "*.png";
declare module "*.jpg";

// Minimal Telegram WebApp typing — only the surface the game uses.
// The full @telegram-apps/sdk is intentionally NOT a dependency:
// the game reads initData (validated server-side), calls
// ready()/expand(), and opens t.me links via openTelegramLink.
// window.Telegram is absent in a plain browser, so every access is
// guarded at runtime.
interface TelegramWebApp {
  /** Signed initData query string — sent to /api/game with every
   *  call so the server can identify the player. Empty outside
   *  Telegram. */
  initData: string;
  initDataUnsafe?: {
    user?: {
      id?: number;
      username?: string;
      first_name?: string;
      /** Telegram UI language, e.g. "id" / "en" / "ru" — used only
       *  to pick the game's initial language (i18n.ts). */
      language_code?: string;
    };
  };
  ready: () => void;
  expand: () => void;
  /** Open a t.me link inside Telegram (channel, group, bot). */
  openTelegramLink: (url: string) => void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
  Adsgram?: {
    init: (params: { blockId: string }) => AdsgramAdController;
  };
}

// Minimal AdsGram SDK typing — only the Rewarded surface the game
// uses (docs.adsgram.ai/publisher/reward-interstitial-integration).
// window.Adsgram is absent if the SDK script fails to load, so every
// access is guarded at runtime in client/src/ads.ts.
interface AdsgramShowResult {
  /** true only when the user watched the ad till the end (Rewarded). */
  done: boolean;
  description: string;
  state: "load" | "render" | "playing" | "destroy";
  /** true if the event was emitted due to an error. */
  error: boolean;
}

interface AdsgramAdController {
  show: () => Promise<AdsgramShowResult>;
}
