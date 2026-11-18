declare module "*.css";
declare module "*.webp";
declare module "*.png";
declare module "*.jpg";

// Minimal Telegram WebApp typing — only the surface the game uses.
// The full @telegram-apps/sdk is intentionally NOT a dependency:
// the game reads initData (validated server-side) and calls
// ready()/expand(), nothing else. window.Telegram is absent in a
// plain browser, so every access is guarded at runtime.
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
    };
  };
  ready: () => void;
  expand: () => void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
