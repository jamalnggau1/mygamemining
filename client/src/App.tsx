import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getTelegramSessionInfo, type ApiResponse } from "./api";
import { isAdsConfigured, showRewardedAd } from "./ads";
import {
  connectWallet,
  getConnectedWalletAddress,
  isTonConnectAvailable,
  sendGramPayment,
} from "./tonconnect";
import { fmt, fmtDate, fmtDateLong, fmtDateTime, fmtDur, LanguagePicker, t, trich, useLang } from "./i18n.js";
import { ensureMusic, musicEnabled, playClaim, playClick, playCoin, playDrill, playError, playScan, playSuccess, setMusicEnabled, setSoundEnabled, soundEnabled, stopMusic } from "./sound.js";
import { ExpandableText } from "./ExpandableText";
import heroImg from "./assets/hero.webp";
import asteroidImg from "./assets/asteroid.webp";
import sectorRingsImg from "./assets/sector-rings.webp";
import oresImg from "./assets/ores.webp";
import stationImg from "./assets/station.webp";
import moonImg from "./assets/map-moon.webp";
import psycheImg from "./assets/map-psyche.webp";
import kuiperImg from "./assets/map-kuiper.webp";
import ktLogoImg from "./assets/kt-logo.webp";
import droneAttackImg from "./assets/drone-serbu.webp";
import droneDefenseImg from "./assets/drone-perisai.webp";

const MAP_IMAGES: Record<string, string> = {
  hero: heroImg,
  asteroid: asteroidImg,
  moon: moonImg,
  psyche: psycheImg,
  kuiper: kuiperImg,
};

type GameState = ApiResponse<typeof api, "getGameState">;
type Wd = GameState["withdrawals"][number];
// i18n: every user-visible string (and the KT/date/duration
// formatting) lives in client/src/i18n.ts — Indonesian + English
// dictionaries. The local fmt/fmtDate/fmtDur helpers were deleted so
// the two languages can never drift apart.
function statusLabel(status: Wd["status"]): string {
  switch (status) {
    case "pending": return t("wdStatusPending");
    case "approved": return t("wdStatusApproved");
    case "paid": return t("wdStatusPaid");
    case "rejected": return t("wdStatusRejected");
    default: return t("wdStatusCancelled");
  }
}
function statusClass(status: Wd["status"]): string {
  switch (status) {
    case "pending": return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "approved": return "bg-sky-500/20 text-sky-300 border-sky-500/40";
    case "paid": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "rejected": return "bg-red-500/20 text-red-300 border-red-500/40";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}
/** Ticks once per second while `active` so job countdowns stay live. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// ---------------------------------------------------------------------------
// Inline SVG icons (no emoji anywhere in the UI)
// ---------------------------------------------------------------------------

const RARE_ORE_IDS = new Set(["platinum", "iridium", "helium3", "zamrud", "rubi", "safir", "berlian", "opales", "voidium"]);

/** Distinct mineral artwork per ore id, tinted with the ore's own color. */
export function OreIcon({ id, color, size = 26 }: { id: string; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const, focusable: false as const };
  switch (id) {
    case "regolith": // irregular grey rock with craters
      return (
        <svg {...common}>
          <path d="M4 15 L6 7 L11 4 L17 6 L20 12 L18 18 L10 20 L5 19 Z" fill={color} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          <circle cx="10" cy="10" r="2" fill="rgba(0,0,0,0.28)" />
          <circle cx="15.5" cy="14.5" r="1.4" fill="rgba(0,0,0,0.25)" />
          <circle cx="8.5" cy="15.5" r="1" fill="rgba(255,255,255,0.22)" />
        </svg>
      );
    case "kondrit": // dark chondrite rock with embedded chondrule dots
      return (
        <svg {...common}>
          <path d="M5 16 L7 6 L13 3.5 L19 7 L20 14 L16 19.5 L8 19 Z" fill={color} stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
          <circle cx="10" cy="9" r="1.5" fill="#cbb98a" />
          <circle cx="15" cy="11" r="1.1" fill="#9fb4d8" />
          <circle cx="11.5" cy="14.5" r="1.3" fill="#d8c491" />
          <circle cx="16.5" cy="16" r="0.9" fill="#cbb98a" />
          <circle cx="8" cy="12.5" r="0.8" fill="#8ea0b8" />
        </svg>
      );
    case "besinikel": // metallic iron-nickel hexagon chunk
      return (
        <svg {...common}>
          <path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" fill={color} stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
          <path d="M12 3 L12 12 L20 7.5 M12 12 L4 7.5 M12 12 L12 21" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="0.9" />
          <path d="M7.5 8.5 L12 6 L12 10.5 L7.5 12.5 Z" fill="rgba(255,255,255,0.28)" />
        </svg>
      );
    case "kobalt": // blue crystal cluster
      return (
        <svg {...common}>
          <path d="M9 21 L10.5 7 L12 3.5 L13.5 7 L15 21 Z" fill={color} stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" />
          <path d="M14.5 21 L16.5 10 L19 21 Z" fill={color} opacity="0.75" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7" />
          <path d="M5 21 L7 12.5 L9.5 21 Z" fill={color} opacity="0.6" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7" />
          <path d="M12 3.5 L12 21" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
        </svg>
      );
    case "platinum": // bright faceted gem shard
      return (
        <svg {...common}>
          <path d="M7 4 L17 4 L21 9.5 L12 20.5 L3 9.5 Z" fill={color} stroke="rgba(255,255,255,0.65)" strokeWidth="0.9" />
          <path d="M3 9.5 L21 9.5 M7 4 L9.8 9.5 L12 20.5 M17 4 L14.2 9.5 L12 20.5 M9.8 9.5 L14.2 9.5" fill="none" stroke="rgba(70,90,120,0.55)" strokeWidth="0.8" />
        </svg>
      );
    case "iridium": // golden nugget / star chunk
      return (
        <svg {...common}>
          <path d="M12 2.8 L14.2 8.6 L20.4 9.1 L15.7 13.1 L17.2 19.2 L12 16 L6.8 19.2 L8.3 13.1 L3.6 9.1 L9.8 8.6 Z" fill={color} stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="12" cy="11.5" r="2.1" fill="rgba(255,255,255,0.4)" />
        </svg>
      );
    case "helium3": // glowing cyan helium-3 crystal
      return (
        <svg {...common}>
          <path d="M12 2 L17.5 9 L12 22 L6.5 9 Z" fill={color} stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M6.5 9 L17.5 9 M12 2 L12 22" stroke="rgba(10,40,60,0.4)" strokeWidth="0.8" />
          <path d="M12 5.5 L15 9 L12 16 L9 9 Z" fill="rgba(255,255,255,0.45)" />
        </svg>
      );
    case "opal": // rainbow opal cabochon with play-of-color flecks
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="7.5" ry="9" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          <circle cx="9.5" cy="9" r="1.6" fill="#67e8f9" opacity="0.85" />
          <circle cx="14" cy="11" r="1.3" fill="#fde047" opacity="0.85" />
          <circle cx="10.5" cy="14.5" r="1.4" fill="#4ade80" opacity="0.8" />
          <circle cx="14.5" cy="16" r="1" fill="#f472b6" opacity="0.8" />
          <ellipse cx="9" cy="7.5" rx="2.4" ry="1.4" fill="rgba(255,255,255,0.5)" />
        </svg>
      );
    case "topaz": // golden topaz, emerald-cut rectangle
      return (
        <svg {...common}>
          <path d="M6.5 5.5 L17.5 5.5 L19.5 9 L17 18.5 L7 18.5 L4.5 9 Z" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M4.5 9 L19.5 9 M7 18.5 L9.5 9 L14.5 9 L17 18.5 M9.5 9 L12 13.5 L14.5 9" fill="none" stroke="rgba(120,70,0,0.45)" strokeWidth="0.8" />
        </svg>
      );
    case "turkuois": // turquoise nugget with dark matrix veins
      return (
        <svg {...common}>
          <path d="M5 10 L8 5 L15 4 L19.5 8 L19 15 L14 19.5 L7 18.5 L4.5 14 Z" fill={color} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M5 10 L11 11 L14 8 M11 11 L10 18.5 M11 11 L18 14.5" fill="none" stroke="rgba(30,41,59,0.55)" strokeWidth="0.9" />
          <ellipse cx="8.5" cy="8" rx="2" ry="1.2" fill="rgba(255,255,255,0.35)" />
        </svg>
      );
    case "ametis": // violet amethyst crystal point cluster
      return (
        <svg {...common}>
          <path d="M10 20.5 L11 8 L12.5 3.5 L14 8 L15 20.5 Z" fill={color} stroke="rgba(255,255,255,0.45)" strokeWidth="0.7" />
          <path d="M14.5 20.5 L16 11 L18.5 20.5 Z" fill={color} opacity="0.7" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7" />
          <path d="M5.5 20.5 L7 13 L9.5 20.5 Z" fill={color} opacity="0.55" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7" />
          <path d="M12.5 3.5 L12.2 20.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" />
          <path d="M5 20.5 L19 20.5" stroke="rgba(90,60,140,0.7)" strokeWidth="1.4" />
        </svg>
      );
    case "zamrud": // green emerald, step-cut octagon
      return (
        <svg {...common}>
          <path d="M7 4.5 L17 4.5 L19.5 7 L19.5 17 L17 19.5 L7 19.5 L4.5 17 L4.5 7 Z" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinejoin="round" />
          <rect x="8" y="8" width="8" height="8" fill="rgba(255,255,255,0.3)" stroke="rgba(4,60,40,0.5)" strokeWidth="0.7" />
          <path d="M4.5 7 L8 8 M19.5 7 L16 8 M4.5 17 L8 16 M19.5 17 L16 16" stroke="rgba(4,60,40,0.45)" strokeWidth="0.7" />
        </svg>
      );
    case "rubi": // red ruby, oval brilliant
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="8" ry="9.5" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
          <ellipse cx="12" cy="12" rx="4.6" ry="5.8" fill="rgba(255,255,255,0.28)" stroke="rgba(90,10,20,0.5)" strokeWidth="0.7" />
          <path d="M12 2.5 L12 21.5 M4 12 L20 12 M6.5 5.5 L17.5 18.5 M17.5 5.5 L6.5 18.5" stroke="rgba(90,10,20,0.4)" strokeWidth="0.7" />
          <ellipse cx="9" cy="7.5" rx="2" ry="1.3" fill="rgba(255,255,255,0.55)" />
        </svg>
      );
    case "safir": // blue star sapphire with asterism
      return (
        <svg {...common}>
          <path d="M12 2.5 L15.5 5 L21 6.5 L20 12 L21 17.5 L15.5 19 L12 21.5 L8.5 19 L3 17.5 L4 12 L3 6.5 L8.5 5 Z" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M12 6 L12 18 M6.8 8.2 L17.2 15.8 M17.2 8.2 L6.8 15.8" stroke="rgba(255,255,255,0.85)" strokeWidth="0.9" />
          <circle cx="12" cy="12" r="1.4" fill="rgba(255,255,255,0.9)" />
        </svg>
      );
    case "berlian": // round brilliant diamond, bright white
      return (
        <svg {...common}>
          <path d="M8 3.5 L16 3.5 L20.5 8.5 L12 20.5 L3.5 8.5 Z" fill={color} stroke="rgba(160,190,220,0.8)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M3.5 8.5 L20.5 8.5 M8 3.5 L10 8.5 L12 20.5 M16 3.5 L14 8.5 L12 20.5 M10 8.5 L14 8.5" fill="none" stroke="rgba(100,130,170,0.6)" strokeWidth="0.7" />
          <path d="M6 5.8 L8.5 5.2" stroke="rgba(255,255,255,0.95)" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "opales": // black ice opal — dark cabochon with neon fire
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="7.5" ry="9" fill="#1e1b2e" stroke={color} strokeWidth="1" />
          <circle cx="9.5" cy="9.5" r="1.7" fill={color} opacity="0.9" />
          <circle cx="14.2" cy="12" r="1.3" fill="#67e8f9" opacity="0.9" />
          <circle cx="10.5" cy="15" r="1.5" fill="#4ade80" opacity="0.85" />
          <circle cx="14.8" cy="16.5" r="1" fill="#f472b6" opacity="0.85" />
          <ellipse cx="9" cy="7" rx="2.2" ry="1.2" fill="rgba(255,255,255,0.35)" />
        </svg>
      );
    case "voidium": // voidium — dark indigo void crystal with a star core
      return (
        <svg {...common}>
          <path d="M12 1.8 L18 8.5 L15.5 21 L8.5 21 L6 8.5 Z" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M6 8.5 L18 8.5 M12 1.8 L12 21" stroke="rgba(20,16,50,0.5)" strokeWidth="0.8" />
          <path d="M12 9.5 L13.1 12 L15.7 12.9 L13.1 13.8 L12 16.3 L10.9 13.8 L8.3 12.9 L10.9 12 Z" fill="#e0e7ff" />
          <circle cx="12" cy="12.9" r="0.9" fill="#ffffff" />
        </svg>
      );
    default: // generic mineral shard fallback
      return (
        <svg {...common}>
          <path d="M12 3 L19 10 L12 21 L5 10 Z" fill={color} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
      );
  }
}

function IconShell({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function RocketIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M12 2.5c2.8 1.9 4.5 5.4 4.5 9.2l-4.5 4.3-4.5-4.3c0-3.8 1.7-7.3 4.5-9.2Z" />
      <circle cx="12" cy="9" r="1.8" />
      <path d="M7.5 13.5 4.5 18l3.5-.5M16.5 13.5l3 4.5-3.5-.5M10 19.5c.6 1 1.3 1.7 2 2 .7-.3 1.4-1 2-2" />
    </IconShell>
  );
}
export function SatelliteIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <rect x="9" y="9" width="6.5" height="6.5" rx="1" transform="rotate(45 12.25 12.25)" />
      <path d="M8.5 8.5 4 4M15.5 15.5 20 20M15.5 8.5 20 4M8.5 15.5 4 20" />
      <rect x="1.8" y="1.8" width="4.4" height="4.4" rx="0.8" transform="rotate(45 4 4)" />
      <rect x="17.8" y="17.8" width="4.4" height="4.4" rx="0.8" transform="rotate(45 20 20)" />
    </IconShell>
  );
}
export function WrenchIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M14.7 6.3a4.4 4.4 0 0 1 5.9-4.1l-2.9 2.9.4 2.2 2.2.4a4.4 4.4 0 0 1-5.8 5L7 20.3a2 2 0 0 1-2.8-2.8l7.6-7.6a4.4 4.4 0 0 1 2.9-3.6Z" />
    </IconShell>
  );
}
export function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
    </IconShell>
  );
}
/** Ikon slider untuk tombol Pengaturan (pilihan owner, 2026-11-23):
    tiga garis horizontal dengan kenop bundar di tiap garis, kenop
    bergeser di sepanjang garis (baris 1 kanan, baris 2 kiri, baris
    3 kanan). Garis terputus di sekitar kenop ala Lucide
    sliders-horizontal, jadi kenop tampak utuh tanpa garis menembus. */
export function SlidersIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M3 8h9.8M17.2 8H21M3 12h2.8M10.2 12H21M3 16h11.8M19.2 16H21" />
      <circle cx="15" cy="8" r="2.2" />
      <circle cx="8" cy="12" r="2.2" />
      <circle cx="17" cy="16" r="2.2" />
    </IconShell>
  );
}
export function ChevronLeftIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </IconShell>
  );
}
export function GemIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M7 3.5h10L21 9l-9 11.5L3 9Z" />
      <path d="M3 9h18M7 3.5 9.8 9 12 20.5M17 3.5 14.2 9 12 20.5M9.8 9h4.4" />
    </IconShell>
  );
}
export function DishIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M4.5 13.5a8.5 8.5 0 0 0 11 4.6L8.6 11.2a4.8 4.8 0 0 1-4.1 2.3Z" />
      <path d="M8.6 11.2 17 2.8M17 2.8l.1 3M17 2.8l-3-.1" />
      <path d="M10.5 17.5 8 21.5h6" />
      <circle cx="17.4" cy="2.4" r="0.6" fill="currentColor" />
    </IconShell>
  );
}
export function TelescopeIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="m4 15 9.5-6.5 2.5 3.6L6.5 18.5Z" />
      <path d="M13.5 8.5 18 4l2 2.8-4.5 4.5M9 17.5 6.5 22M13 15l2 6.5M6.5 13.5 4.8 11 7 9.6" />
    </IconShell>
  );
}
export function DrillIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M3 5.5h8v5H6.5L5 19 3.5 10.5H3Z" />
      <path d="M11 8h4.5M15.5 5.5 21 8l-5.5 2.5M6 13.5c1.2.7 2.4.7 3.6 0M5.8 16.5c1 .6 2 .6 3 0" />
    </IconShell>
  );
}
export function ZapIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M13 2 4.5 13.5H11L9.8 22 19 10h-6.5Z" />
    </svg>
  );
}
export function GiftIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <rect x="3.5" y="8" width="17" height="4" />
      <path d="M5.5 12v8.5h13V12M12 8v12.5M12 8s-4 .2-5.2-1.4C5.7 5.1 7.3 3.4 9 3.8c1.9.4 3 4.2 3 4.2Zm0 0s4 .2 5.2-1.4c1.1-1.5-.5-3.2-2.2-2.8C13.1 4.2 12 8 12 8Z" />
    </IconShell>
  );
}
export function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M10 9.2v5.6l4.8-2.8Z" fill="currentColor" stroke="none" />
    </IconShell>
  );
}
export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="m4.5 12.5 5 5 10-11" />
    </IconShell>
  );
}
export function AlertIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M12 3.5 22 20H2Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </IconShell>
  );
}
export function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.5 14.3 9 21 11.5 14.3 14 12 21 9.7 14 3 11.5 9.7 9Z" />
    </svg>
  );
}
export function BookIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </IconShell>
  );
}
export function RadarIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12 19 5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      <circle cx="15.8" cy="14.8" r="1" fill="currentColor" stroke="none" />
    </IconShell>
  );
}
export function MapIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M9 3.5 3.5 5.5v15L9 18.5l6 2 5.5-2v-15L15 5.5 9 3.5Zm0 0v15m6-13v15" />
      <circle cx="12" cy="10" r="0.7" fill="currentColor" />
    </IconShell>
  );
}
export function UsersIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconShell>
  );
}
export function CrownIcon({ size = 18 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M3.5 17.5 2.5 7l5.5 3.5L12 5l4 5.5L21.5 7 20.5 17.5Z" strokeLinejoin="round" />
      <path d="M4.5 20.5h15" />
      <circle cx="12" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
    </IconShell>
  );
}
export function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </IconShell>
  );
}
export function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M12 2.8 20 5.8v5.4c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V5.8Z" strokeLinejoin="round" />
      <path d="m8.8 11.8 2.2 2.2 4.2-4.4" />
    </IconShell>
  );
}
export function SwordsIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" x2="19" y1="19" y2="13" />
      <line x1="16" x2="20" y1="16" y2="20" />
      <line x1="19" x2="21" y1="21" y2="19" />
    </IconShell>
  );
}
/** Drone Serbu — panah tajam dengan mata sensor, aksen merah. */
export function AttackDroneIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <path d="M12 2.5 18.5 15 12 12.5 5.5 15Z" strokeLinejoin="round" />
      <circle cx="12" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M7.5 14.5 5 19M16.5 14.5 19 19" />
    </IconShell>
  );
}
/** Drone Perisai — bola pelindung dalam cincin, aksen biru. */
export function DefenseDroneIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" />
    </IconShell>
  );
}
export function RadiationIcon({ size = 16 }: { size?: number }) {
  return (
    <IconShell size={size}>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 10.4 12 4a8 8 0 0 1 6.9 4L13.4 11M13.4 13l5.5 3A8 8 0 0 1 12 20v-6.6M10.6 13l-5.5 3A8 8 0 0 1 5.1 8L10.6 11" />
    </IconShell>
  );
}

/** Per-upgrade artwork, keyed by the server's upgrade id. */
export function UpgradeIcon({ id, size = 22 }: { id: string; size?: number }) {
  switch (id) {
    case "beliung": // laser drill arm
      return <span className="text-amber-300"><DrillIcon size={size} /></span>;
    case "tangki": // O2 tank & solar battery
      return (
        <span className="text-emerald-300">
          <IconShell size={size}>
            <rect x="2.5" y="8" width="15" height="8.5" rx="2" />
            <path d="M20.5 11v2.5M6 12.2h5" />
            <path d="M13.2 9.8 11 12.4h2l-1.6 2.6" />
          </IconShell>
        </span>
      );
    case "bor": // mini fusion reactor (atom)
      return (
        <span className="text-cyan-300">
          <IconShell size={size}>
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
            <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
            <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
          </IconShell>
        </span>
      );
    case "ransel": // cargo drone
      return (
        <span className="text-sky-300">
          <IconShell size={size}>
            <rect x="9" y="10" width="6" height="5" rx="1.2" />
            <path d="M9.5 10.5 5 6M14.5 10.5 19 6M9.5 14.5 5 18M14.5 14.5 19 18" />
            <circle cx="4" cy="5" r="1.8" />
            <circle cx="20" cy="5" r="1.8" />
            <circle cx="4" cy="19" r="1.8" />
            <circle cx="20" cy="19" r="1.8" />
          </IconShell>
        </span>
      );
    case "negosiator": // station negotiator (handshake)
      return (
        <span className="text-violet-300">
          <IconShell size={size}>
            <path d="m11 17-2.5-2.5a1.8 1.8 0 0 0-2.5 0l-1 1a1.8 1.8 0 0 0 0 2.5l2 2a3.2 3.2 0 0 0 4.5 0l7-7a1.9 1.9 0 0 0 0-2.7l-1.3-1.3" />
            <path d="m13 7 2.5 2.5a1.8 1.8 0 0 1 2.5 0l1-1a1.8 1.8 0 0 1 0-2.5l-2-2a3.2 3.2 0 0 0-4.5 0l-7 7a1.9 1.9 0 0 0 0 2.7L6.8 15" />
          </IconShell>
        </span>
      );
    case "pemindai": // core spectrometer (radar)
      return <span className="text-teal-300"><RadarIcon size={size} /></span>;
    default:
      return <span className="text-cyan-300"><WrenchIcon size={size} /></span>;
  }
}

// ---------------------------------------------------------------------------
// Confetti celebration bursts (CSS-animated, pointer-events-none)
// ---------------------------------------------------------------------------

type BurstKind = "scan" | "mine" | "rare" | "expedition";
type Burst = { id: number; kind: BurstKind; oreColor?: string };
type ConfettiPiece = { left: number; delay: number; duration: number; width: number; height: number; color: string; round: boolean; drift: number };

const BURST_COUNT: Record<BurstKind, number> = { scan: 18, mine: 26, rare: 44, expedition: 40 };
function burstPalette(kind: BurstKind, oreColor?: string): string[] {
  switch (kind) {
    case "scan": return ["#22d3ee", "#38bdf8", "#a5f3fc", "#e0f2fe"];
    case "mine": return [oreColor ?? "#22d3ee", "#22d3ee", "#34d399", "#e8eef7"];
    case "rare": return ["#f2b705", "#fbbf24", "#fde68a", oreColor ?? "#f2b705"];
    case "expedition": return ["#22d3ee", "#34d399", "#f2b705", "#38bdf8", "#e8eef7"];
  }
}
function makePieces(burst: Burst): ConfettiPiece[] {
  const palette = burstPalette(burst.kind, burst.oreColor);
  const count = BURST_COUNT[burst.kind];
  return Array.from({ length: count }, (_, i) => {
    // Deterministic pseudo-random spread seeded by the burst id, so pieces
    // look scattered without Math.random during render.
    const seed = Math.sin(burst.id * 997 + i * 131.7) * 10000;
    const frac = seed - Math.floor(seed);
    const frac2 = Math.sin(burst.id * 331 + i * 57.3) * 10000;
    const fracB = frac2 - Math.floor(frac2);
    const round = i % 3 === 0;
    return {
      left: frac * 100,
      delay: fracB * 0.45,
      duration: 2.1 + fracB * 1.1,
      width: round ? 7 : 6 + frac * 5,
      height: round ? 7 : 9 + fracB * 7,
      color: palette[i % palette.length] ?? "#22d3ee",
      round,
      drift: (frac - 0.5) * 160,
    };
  });
}
function ConfettiLayer({ burst }: { burst: Burst }) {
  const pieces = useMemo(() => makePieces(burst), [burst]);
  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((pc, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${pc.left}%`,
            width: pc.width,
            height: pc.height,
            backgroundColor: pc.color,
            borderRadius: pc.round ? "9999px" : "2px",
            animationDelay: `${pc.delay}s`,
            animationDuration: `${pc.duration}s`,
            "--drift": `${pc.drift}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

type Tab = "tambang" | "peta" | "pasar" | "upgrade" | "wd" | "komunitas" | "lab" | "admin" | "pengaturan";

/** Layar boot bermerek — tampil saat state awal game dimuat (bukan
 *  saat error). Judul + bar progres animasi + baris status yang
 *  berganti tiap ~1,6 detik, supaya game terasa seperti aplikasi
 *  engine, bukan halaman statis. Dipakai dua kali: sebagai layar
 *  penuh saat getGameState masih pending, dan sebagai overlay yang
 *  memudar begitu data tiba (lihat efek boot di App). */
const BOOT_LINES = ["loading", "loadingAsteroid", "loadingDrill"] as const;
function BootLoader({ sessionLabel }: { sessionLabel: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setLine((v) => (v + 1) % BOOT_LINES.length),
      1600,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10 text-cyan-300 shadow-lg shadow-cyan-500/20"><RocketIcon size={30} /></span>
      <p className="font-display title-shine mt-4 text-2xl font-black tracking-widest">ASTRA MINING</p>
      <div className="mt-6 h-2.5 w-56 overflow-hidden rounded-full bg-[var(--surface2)]" role="progressbar" aria-label={t("loading")}><div className="boot-bar-fill h-full w-2/5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-600" /></div>
      <p key={line} className="boot-line mt-3 text-sm text-[var(--dim)]">{t(BOOT_LINES[line] ?? "loading")}</p>
      <p className="mt-2 text-[11px] text-[var(--dim)]">{sessionLabel}</p>
    </main>
  );
}

export function App() {
  // Subscribe to the language context so the whole game re-renders
  // when the player switches ID/EN (t() reads the current language).
  useLang();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("tambang");
  const [prevTab, setPrevTab] = useState<Tab>("tambang");
  // Tutorial sambutan (2026-11-25): muncul sekali saat pemain pertama
  // buka game (localStorage "astra-mining-tutorial-seen", pola yang
  // sama seperti toggle suara/musik), bisa dibuka lagi dari
  // Pengaturan ("Cara Main").
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return window.localStorage.getItem("astra-mining-tutorial-seen") !== "1";
    } catch {
      return true;
    }
  });
  const dismissTutorial = () => {
    try {
      window.localStorage.setItem("astra-mining-tutorial-seen", "1");
    } catch {}
    setShowTutorial(false);
  };
  const [banner, setBanner] = useState<{ kind: "good" | "bad" | "info"; text: ReactNode } | null>(null);
  const [bannerId, setBannerId] = useState(0);
  const showBanner = (kind: "good" | "bad" | "info", text: ReactNode) => { setBanner({ kind, text }); setBannerId((i) => i + 1); if (kind === "bad") playError(); };
  const [burst, setBurst] = useState<Burst | null>(null);
  const [balanceGlow, setBalanceGlow] = useState(false);
  // True while an AdsGram rewarded ad is playing — the "Tonton Iklan"
  // button stays disabled so a second ad cannot be opened mid-play.
  const [adPlaying, setAdPlaying] = useState(false);
  // Fase pembayaran GRAM (TON Connect) — dipakai tombol "Beli
  // dengan GRAM" untuk menunjukkan "menunggu persetujuan di
  // dompet…" / "memverifikasi di blockchain…" selama alurnya.
  const [gramPhase, setGramPhase] = useState<"idle" | "paying" | "verifying">("idle");
  const prevBalanceRef = useRef<number | null>(null);
  const state = useQuery({ queryKey: ["game-state"], queryFn: () => api.getGameState({}), refetchInterval: 5000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["game-state"] });
  // Label diagnostik sesi — dihitung di awal supaya tampil juga di
  // layar loading/error, bukan hanya saat game berhasil dimuat.
  // "Web" = bukan di Telegram; "login kosong" = di Telegram tapi
  // Telegram tidak memberikan initData (tombol/link salah jenis);
  // "ID ..." = initData ada dan akun sudah terpisah.
  const sessionInfo = getTelegramSessionInfo();
  const sessionLabel = !sessionInfo.inTelegram
    ? t("sessionWeb")
    : !sessionInfo.hasInitData
      ? t("sessionEmpty")
      : t("sessionTelegram", { id: sessionInfo.userId ?? "?" });
  const showResult = (ok: boolean, error: string | null, goodText: ReactNode) => showBanner(ok ? "good" : "bad", ok ? goodText : (error ?? t("genericFail")));
  const fireBurst = (kind: BurstKind, oreColor?: string) => setBurst({ id: Date.now(), kind, oreColor });

  // Confetti auto-dismiss (longer for the big rare / expedition bursts).
  useEffect(() => {
    if (!burst) return;
    const ms = burst.kind === "rare" || burst.kind === "expedition" ? 3400 : 2800;
    const id = setTimeout(() => setBurst(null), ms);
    return () => clearTimeout(id);
  }, [burst]);

  // Balance glow pulse whenever the KT balance actually changes.
  const ktBalance = state.data?.player.ktBalance;
  useEffect(() => {
    if (ktBalance == null) return;
    if (prevBalanceRef.current != null && prevBalanceRef.current !== ktBalance) {
      setBalanceGlow(true);
      const id = setTimeout(() => setBalanceGlow(false), 1000);
      prevBalanceRef.current = ktBalance;
      return () => clearTimeout(id);
    }
    prevBalanceRef.current = ktBalance;
  }, [ktBalance]);

  // Musik latar: mulai setelah gestur pertama (kebijakan autoplay
  // browser), berhenti saat tab disembunyikan (hemat baterai),
  // kembali saat tab terlihat lagi.
  useEffect(() => {
    const start = () => ensureMusic();
    window.addEventListener("pointerdown", start, { once: true });
    const onVis = () => {
      if (document.hidden) stopMusic();
      else ensureMusic();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", start);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Bunyi klik kayu di semua tombol: satu listener pointerdown
  // global — tombol apa pun yang ditekan berbunyi klik (playClick
  // menghormati toggle Suara). Bunyi khusus aksi (scan/bor/koin/
  // klaim/sukses) tetap bunyi saat aksinya berhasil, jadi pemakaian
  // playClick di onSuccess collect dihapus supaya tidak dobel.
  useEffect(() => {
    const onTap = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("button")) playClick();
    };
    document.addEventListener("pointerdown", onTap);
    return () => document.removeEventListener("pointerdown", onTap);
  }, []);

  const startScan = useMutation({
    mutationFn: () => api.startScan({}),
    onSuccess: (r) => { if (r.ok) playScan(); showResult(r.ok, r.error, <>{t("scanStarted", { dur: fmtDur(r.durationSec) })}</>); refresh(); },
  });
  const startMine = useMutation({
    mutationFn: (veinIndex: number) => api.startMine({ veinIndex }),
    onSuccess: (r) => { if (r.ok) playDrill(); showResult(r.ok, r.error, <>{t("mineStarted", { ore: r.oreName ?? t("oreFallback"), dur: fmtDur(r.durationSec) })}</>); refresh(); },
  });
  const collect = useMutation({
    mutationFn: () => api.collectJob({}),
    onSuccess: (r) => {
      if (!r.ok) { showBanner("bad", r.error ?? t("collectFail")); refresh(); return; }
      if (r.kind === "scan") {
        showBanner("good", t("collectScanDone"));
        fireBurst("scan");
        playSuccess();
      } else if (r.jammed) {
        showBanner("bad", (<span className="inline-flex items-center gap-1.5"><AlertIcon size={15} /> {t("collectJammed", { ore: r.oreName ?? t("oreFallback") })}</span>));
      } else if (r.isRare) {
        showBanner("good", (<span className="inline-flex items-center gap-1.5"><SparkleIcon size={15} /> {t("collectRare", { ore: r.oreName ?? t("oreFallback"), qty: r.qty })}{r.hullHit ? t("collectRareHull", { fee: fmt(r.repairFeeKt) }) : ""}</span>));
        fireBurst("rare");
      } else if (r.hullHit) {
        showBanner("bad", t("collectHull", { ore: r.oreName ?? t("oreFallback"), qty: r.qty, fee: fmt(r.repairFeeKt) }));
        fireBurst("mine");
      } else {
        showBanner("info", t("collectOk", { ore: r.oreName ?? t("oreFallback"), qty: r.qty }));
        fireBurst("mine");
      }
      refresh();
    },
  });
  const cancelJob = useMutation({ mutationFn: () => api.cancelJob({}), onSuccess: (r) => { showResult(r.ok, r.error, t("jobCancelled")); refresh(); } });
  const complete = useMutation({
    mutationFn: () => api.completeExpedition({}),
    onSuccess: (r) => {
      // Pesan berbeda bila sektor TIDAK naik: "Warp ke Sektor X"
      // salah kalau pemain tetap di sektor yang sama — tampilkan
      // progres menuju sektor berikutnya.
      const msg = r.ok && r.advanced === false && r.sectorProgress
        ? <>{t("expeditionDoneProgress", { bonus: fmt(r.bonusKt), current: r.sectorProgress.current, needed: r.sectorProgress.needed, next: r.layer + 1 })}</>
        : <>{t("expeditionDone", { bonus: fmt(r.bonusKt), layer: r.layer })}</>;
      showResult(r.ok, r.error, msg);
      if (r.ok) { fireBurst("expedition"); playSuccess(); }
      refresh();
    },
  });
  const abandon = useMutation({ mutationFn: () => api.abandonAsteroid({}), onSuccess: (r) => { showResult(r.ok, r.error, t("abandoned", { name: r.asteroidName ?? t("asteroidNew") })); refresh(); } });
  const travel = useMutation({
    mutationFn: (zoneIndex: number) => api.travelToMap({ zoneIndex }),
    onSuccess: (r) => { showResult(r.ok, r.error, <>{t("travelDone", { map: r.mapName ?? "", name: r.asteroidName ?? t("asteroidNew") })}</>); if (r.ok) setTab("tambang"); refresh(); },
  });
  // Beli Premium dengan Telegram Stars (XTR) — alur nyata:
  // server membuat invoice (createStarsInvoice) → lembar bayar
  // Stars dibuka via Telegram.WebApp.openInvoice → status "paid"
  // berarti Stars sudah dibayar; Premium diaktifkan otomatis oleh
  // webhook Telegram (/api/telegram-webhook). refresh() memuat
  // ulang state supaya badge Premium + pesanan terbaru tampil.
  // Status "cancelled" / "failed" berarti TIDAK ada pembelian —
  // pesanan pending langsung dibatalkan (cancelPremiumOrder, baris
  // dihapus) supaya tombol beli langsung kembali tanpa kerja
  // admin. Status "pending" dibiarkan menunggu webhook.
  const buyPremium = useMutation({
    mutationFn: (plan: "standard" | "pro") => api.createStarsInvoice({ plan }),
    onSuccess: (r) => {
      if (!r.ok || !r.invoiceUrl) { showResult(r.ok, r.error, null); refresh(); return; }
      const orderId = r.orderId;
      const wa = window.Telegram?.WebApp;
      if (!wa || typeof wa.openInvoice !== "function") {
        showBanner("bad", t("premiumStarsNeedTelegram"));
        // Lembar bayar tidak pernah terbuka, tapi pesanan pending
        // sudah dibuat — hapus supaya tombol beli langsung kembali.
        if (orderId != null) { api.cancelPremiumOrder({ orderId }).then(() => refresh(), () => refresh()); }
        else { refresh(); }
        return;
      }
      wa.openInvoice(r.invoiceUrl, (status) => {
        if (status === "paid") { showBanner("good", t("premiumStarsPaid")); refresh(); }
        else if (status === "cancelled" || status === "failed") {
          showBanner("bad", t(status === "cancelled" ? "premiumStarsCancelled" : "premiumStarsFailed"));
          // Tidak ada pembelian — batalkan pesanan pending supaya
          // tombol beli langsung kembali, tanpa kerja admin.
          if (orderId != null) { api.cancelPremiumOrder({ orderId }).then(() => refresh(), () => refresh()); }
          else { refresh(); }
        }
        else { showBanner("info", t("premiumStarsPending")); refresh(); }
      });
    },
  });
  // Bayar Premium dengan GRAM (TON Connect) — TANPA salin hash:
  //   1. server membuat pesanan GRAM pending (createGramOrder) dan
  //      mengembalikan alamat dompet pemilik + jumlah nanoTON;
  //   2. dompet belum terhubung → connectWallet() membuka jendela
  //      TON Connect (pilih dompet);
  //   3. sendGramPayment() mengirim SATU transaksi ke dompet
  //      pemilik — pemain menyetujui sekali di dompetnya — dan
  //      mengembalikan BOC;
  //   4. klien menghitung hash pesan dari BOC dan memanggil
  //      confirmGramPayment — server memverifikasi transaksi itu
  //      on-chain (tonapi) dan mengaktifkan Premium otomatis;
  //      kalau transaksi masih diproses di blockchain, server
  //      mengembalikan retryable=true — klien mencoba lagi 2 detik
  //      kemudian, sampai 5 kali.
  // Pemain membatalkan/menolak di dompet → pesanan pending
  // dibatalkan (cancelPremiumOrder) supaya tombol beli langsung
  // kembali — sama seperti pembatalan Stars.
  const buyPremiumGram = useMutation({
    mutationFn: async (plan: "standard" | "pro") => {
      if (!isTonConnectAvailable()) {
        return { ok: false as const, error: t("premiumGramNeedTelegram"), orderId: null };
      }
      const created = await api.createGramOrder({ plan });
      if (!created.ok || created.orderId == null || !created.receiverAddress || !created.amountNanoTon) {
        return { ok: false as const, error: created.error ?? t("genericFail"), orderId: null };
      }
      const orderId = created.orderId;
      setGramPhase("paying");
      let sent;
      try {
        // Dompet belum terhubung → buka jendela TON Connect dulu.
        if (!getConnectedWalletAddress()) await connectWallet();
        sent = await sendGramPayment({
          receiverAddress: created.receiverAddress,
          amountNanoTon: created.amountNanoTon,
        });
      } catch {
        // Dibatalkan/ditolak di dompet (atau dompet tidak
        // terhubung) — tidak ada GRAM yang terkirim, batalkan
        // pesanan supaya tombol beli langsung kembali.
        await api.cancelPremiumOrder({ orderId }).catch(() => undefined);
        setGramPhase("idle");
        showBanner("bad", t("premiumGramCancelled"));
        refresh();
        return { ok: false as const, error: null, orderId: null };
      }
      setGramPhase("verifying");
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          showBanner("info", t("premiumGramPending"));
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        const confirmed = await api.confirmGramPayment({
          orderId,
          msgHash: sent.msgHash,
          senderAddress: sent.senderAddress,
        });
        if (confirmed.ok) {
          setGramPhase("idle");
          showBanner("good", t("premiumGramPaid"));
          refresh();
          return { ok: true as const, error: null, orderId };
        }
        // Transaksi belum terindeks di blockchain — coba lagi.
        if (confirmed.retryable) continue;
        setGramPhase("idle");
        showBanner("bad", confirmed.error ?? t("premiumGramFailed"));
        refresh();
        return { ok: false as const, error: confirmed.error ?? null, orderId };
      }
      setGramPhase("idle");
      showBanner("info", t("premiumGramPending"));
      refresh();
      return { ok: true as const, error: null, orderId };
    },
  });
  // Batalkan pesanan Premium yang masih pending (tombol di kartu
  // Premium) — untuk pemain yang menutup aplikasi di tengah
  // pembayaran dan kembali ke pesanan yang macet. Baris pesanan
  // dihapus, tombol beli langsung kembali.
  const cancelPremiumOrder = useMutation({
    mutationFn: (orderId: number) => api.cancelPremiumOrder({ orderId }),
    onSuccess: (r) => { showResult(r.ok, r.error, r.ok ? t("premiumOrderCancelled") : null); refresh(); },
  });
  const claimBonus = useMutation({ mutationFn: () => api.claimDailyBonus({}), onSuccess: (r) => { if (r.ok) playClaim(); showResult(r.ok, r.error, t("dailyBonusClaimed", { bonus: fmt(r.bonusKt) })); refresh(); } });
  const claimChannel = useMutation({ mutationFn: () => api.claimChannelBonus({}), onSuccess: (r) => { if (r.ok) playClaim(); showResult(r.ok, r.error, t("commChannelClaimOk", { kt: fmt(r.bonusKt) })); refresh(); } });
  const watchAd = useMutation({ mutationFn: () => api.watchAd({}), onSuccess: (r) => { showResult(r.ok, r.error, <>{t("adRewarded", { reward: fmt(r.rewardEnergy), remaining: r.remainingToday })}</>); if (r.ok) fireBurst("mine"); refresh(); } });
  /** "Tonton Iklan": when a blockId is configured, a real AdsGram
   *  rewarded ad must be watched to the end FIRST — KT is granted
   *  only on success, via the unchanged server watchAd action. With
   *  no blockId configured the button keeps its current direct-reward
   *  behavior until the owner activates ads. */
  const handleWatchAd = async () => {
    if (watchAd.isPending || adPlaying) return;
    if (isAdsConfigured()) {
      setAdPlaying(true);
      try {
        const watched = await showRewardedAd();
        if (!watched) {
          showBanner("bad", t("adUnavailable"));
          return;
        }
      } finally {
        setAdPlaying(false);
      }
    }
    watchAd.mutate();
  };
  const sellAll = useMutation({ mutationFn: () => api.sellAllOre({}), onSuccess: (r) => { if (r.ok) playCoin(); showResult(r.ok, r.error, t("sellAllDone", { kt: fmt(r.ktGained) })); refresh(); } });
  const sellOne = useMutation({ mutationFn: (args: { oreId: string; qty: number }) => api.sellOre(args), onSuccess: (r) => { if (r.ok) playCoin(); showResult(r.ok, r.error, t("sellOneDone", { kt: fmt(r.ktGained) })); refresh(); } });
  const buy = useMutation({ mutationFn: (upgradeId: string) => api.buyUpgrade({ upgradeId }), onSuccess: (r) => { showResult(r.ok, r.error, t("upgradeBought", { level: r.newLevel ?? "?", cost: fmt(r.costPaid) })); refresh(); } });
  // PvP (2026-11-22): beli/upgrade pasukan + serang/lewati pertemuan.
  const buyTroop = useMutation({
    mutationFn: (kind: "attack" | "defense") => api.buyTroop({ kind }),
    onSuccess: (r, kind) => { if (r.ok) playCoin(); showResult(r.ok, r.error, t("labBuyDone", { name: kind === "attack" ? t("labTroopAttackName") : t("labTroopDefenseName"), count: r.count })); refresh(); },
  });
  const upgradeTroop = useMutation({
    mutationFn: (kind: "attack" | "defense") => api.upgradeTroop({ kind }),
    onSuccess: (r, kind) => { if (r.ok) playCoin(); showResult(r.ok, r.error, t("labUpgradeDone", { name: kind === "attack" ? t("labTroopAttackName") : t("labTroopDefenseName"), level: r.level })); refresh(); },
  });
  const pvpAttack = useMutation({
    mutationFn: () => api.pvpAttack({}),
    onSuccess: (r) => {
      if (!r.ok) { showResult(false, r.error, ""); refresh(); return; }
      showResult(true, null, r.won ? (r.loot.length > 0 ? t("pvpAttackWin", { kt: fmt(r.lootKt) }) : t("pvpAttackWinEmpty")) : t("pvpAttackLose"));
      if (r.won && r.loot.length > 0) fireBurst("rare");
      refresh();
    },
  });
  const pvpSkip = useMutation({ mutationFn: () => api.pvpSkip({}), onSuccess: (r) => { showResult(r.ok, r.error, t("pvpSkipped")); refresh(); } });
  const cancelWd = useMutation({ mutationFn: (wdId: number) => api.cancelWithdrawal({ wdId }), onSuccess: (r) => { showResult(r.ok, r.error, t("wdCancelled")); refresh(); } });

  // Boot: begitu data pertama tiba, loader overlay memudar (500ms)
  // lalu dilepas — game muncul dengan halus, bukan terpotong
  // tiba-tiba. Efek hanya berjalan sekali (ref menahan refetch
  // tiap 5 detik supaya tidak mengulang).
  const [bootDone, setBootDone] = useState(false);
  const [bootFaded, setBootFaded] = useState(false);
  const bootFadedRef = useRef(false);
  useEffect(() => {
    if (!state.data || bootFadedRef.current) return;
    bootFadedRef.current = true;
    const raf = requestAnimationFrame(() => setBootFaded(true));
    const timer = setTimeout(() => setBootDone(true), 550);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [state.data]);

  if (state.isPending) return (<div className="min-h-screen bg-[var(--bg)] text-[var(--text)] starfield"><div aria-hidden="true" className="bg-[var(--bg)] pt-safe" /><BootLoader sessionLabel={sessionLabel} /></div>);
  if (state.error || !state.data) return (<div className="min-h-screen bg-[var(--bg)] text-[var(--text)]"><div aria-hidden="true" className="bg-[var(--bg)] pt-safe" /><main className="mx-auto max-w-3xl px-4 py-16 text-center"><p className="font-display text-xl">{t("connLost")}</p><p className="mt-2 text-sm text-[var(--dim)]">{t("connLostDesc")}</p><p className="mt-2 text-[11px] text-[var(--dim)]">{sessionLabel}</p><button type="button" onClick={() => state.refetch()} className="btn-press mt-4 rounded-xl bg-cyan-500 px-5 py-2 font-bold text-black">{t("retry")}</button></main></div>);

  const data = state.data; const p = data.player; const exp = data.expedition; const job = data.job;

  const pendingCount = data.withdrawals.filter((w) => w.status === "pending").length;
  const approvedCount = data.withdrawals.filter((w) => w.status === "approved").length;
  const pendingOrders = data.premiumOrders.filter((o) => o.status === "pending").length;
  const adminCount = pendingCount + approvedCount + pendingOrders;
  const totalOreQty = data.ores.reduce((a, o) => a + o.qty, 0);
  const ktToNextUsdt = p.ktBalance >= p.wdMinKt ? 0 : p.wdMinKt - p.ktBalance;
  const tabs: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "tambang", label: t("tabMine"), icon: <RocketIcon size={16} /> },
    { id: "peta", label: t("tabMaps"), icon: <MapIcon size={16} /> },
    { id: "pasar", label: t("tabMarket"), icon: <SatelliteIcon size={16} />, badge: totalOreQty > 0 ? totalOreQty : undefined },
    { id: "upgrade", label: t("tabHangar"), icon: <WrenchIcon size={16} /> },
    { id: "wd", label: t("tabWd"), icon: <GemIcon size={16} /> },
    { id: "komunitas", label: t("tabCommunity"), icon: <UsersIcon size={16} /> },
    { id: "lab", label: t("tabLab"), icon: <SwordsIcon size={16} /> },
  ];
  // Tab Kendali hanya untuk pemilik — pemain biasa tidak pernah
  // melihatnya (server tetap yang menegakkan: aksi Kendali ditolak
  // untuk non-admin walau tab-nya dipanggil langsung).
  if (p.isAdmin) {
    tabs.push({ id: "admin", label: t("tabAdmin"), icon: <DishIcon size={16} />, badge: adminCount > 0 ? adminCount : undefined });
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] starfield">
      {!bootDone && (
        <div aria-hidden="true" className={`pointer-events-none fixed inset-0 z-50 bg-[var(--bg)] transition-opacity duration-500 ${bootFaded ? "opacity-0" : "opacity-100"}`}>
          <BootLoader sessionLabel={sessionLabel} />
        </div>
      )}
      <div aria-hidden="true" className="bg-[var(--bg)] pt-safe" />
      {burst && <ConfettiLayer burst={burst} />}
      {/* HERO REALISTIS */}
      <div className="relative overflow-hidden">
        <img src={heroImg} alt={t("heroImgAlt")} className="animate-hero-zoom h-[180px] w-full object-cover sm:h-[240px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050810] via-[#050810]/35 to-transparent" />
        {/* Tombol Pengaturan ala game mobile (Gardenscapes, idle game):
            ikon slider bulat kaca di pojok kanan atas hero — membuka
            tab Pengaturan penuh, bukan panel yang memanjang ke bawah. */}
        <button type="button" onClick={() => { setPrevTab(tab); setTab("pengaturan"); }} aria-label={t("settingsTitle")} className="btn-press absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white shadow-lg backdrop-blur-md"><SlidersIcon size={20} /></button>
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-4 pb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300">{t("heroEyebrow")}</p>
          <h1 className="font-display title-shine mt-1 text-2xl font-black leading-none sm:text-3xl">ASTRA MINING</h1>
          <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-snug text-slate-200">{trich("heroDesc")}</p>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-3 pb-8">
        <div className="-mt-1 space-y-3">
          {/* Panel saldo — panel neon (redesain 2026-11-24) */}
          <section className="panel-neon p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-300">{t("balTitle")}</p>
            <div className="mt-1 flex items-center gap-3">
              <img src={ktLogoImg} alt={t("ktLogoAlt")} className="h-10 w-10 shrink-0 rounded-2xl object-cover shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/50" />
              <p className="font-display text-3xl leading-tight text-cyan-300"><span className={balanceGlow ? "balance-glow" : undefined}>{fmt(p.ktBalance)}</span> <span className="text-xl">KT</span></p>
            </div>
            <p className="text-sm text-[var(--dim)]">{ktToNextUsdt > 0 ? t("balNeed", { usdt: fmt(p.usdtEquivalent), kt: fmt(ktToNextUsdt) }) : (<span className="inline-flex items-center gap-1 font-bold text-emerald-300"><CheckIcon size={14} /> {t("balReady")}</span>)}</p>
            {p.premium.active ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300"><CrownIcon size={13} /> {t("premiumActive", { tier: p.premium.tier === "pro" ? t("dualDrillTag") : t("standardTag") })}{p.premium.until ? t("premiumUntilShort", { date: fmtDate(p.premium.until) }) : ""}</p>
            ) : (
              <button type="button" onClick={() => setTab("upgrade")} className="btn-press mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold text-amber-200"><CrownIcon size={13} /> {t("activatePremium")}</button>
            )}
          </section>
          {/* Panel Posisi Misi — latar cincin (redesain 2026-11-24) */}
          <section className="panel-neon relative overflow-hidden p-3">
            <img src={sectorRingsImg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-[#050810]/50" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-300">{t("missionPos")}</p>
                <p className="font-display mt-1 text-xl leading-tight">{t("sector", { n: p.layer })}</p>
                {p.sectorProgress && (<p className="text-xs text-slate-200">{t("sectorProgress", { current: p.sectorProgress.current, needed: p.sectorProgress.needed, next: p.layer + 1 })}</p>)}
                <p className="text-sm text-slate-200">{t("kmFromEarth", { km: fmt(p.depthMeters) })}</p>
              </div>
              <div className="w-28 shrink-0 text-right sm:w-32">
                <p className="inline-flex items-center justify-end gap-1 text-[11px] font-semibold text-[var(--dim)]"><ZapIcon size={13} /> {t("shipEnergyLabel")}</p>
                <p className="text-xl font-bold leading-tight text-white">{p.energy}/{p.maxEnergy}</p>
                <div className="energy-shimmer ml-auto mt-1 h-2 w-24 overflow-hidden rounded-full bg-black/50" role="progressbar" aria-valuenow={p.energy} aria-valuemin={0} aria-valuemax={p.maxEnergy} aria-label={t("energyAria")}><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-600 transition-all" style={{ width: `${p.maxEnergy ? (p.energy / p.maxEnergy) * 100 : 0}%` }} /></div>
                <p className="mt-1.5 text-[11px] text-[var(--dim)]">{t("regenLabel")}</p>
                <p className="text-sm font-bold leading-tight text-amber-300">{t("regenValue", { dur: fmtDur(p.regenSeconds) })}</p>
                {p.energy < p.maxEnergy && (<p className="text-[11px] text-slate-200">{t("fullIn", { dur: fmtDur(p.regenSeconds * (p.maxEnergy - p.energy)) })}</p>)}
              </div>
            </div>
          </section>
          {p.canClaimDailyBonus && (<button type="button" onClick={() => claimBonus.mutate()} disabled={claimBonus.isPending} className="btn-press mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-400/10 px-4 py-2 font-bold text-cyan-200"><GiftIcon size={17} /> {t("claimDaily", { kt: fmt(p.dailyBonusKt) })}</button>)}
          <div className="mt-2">
            <button type="button" onClick={handleWatchAd} disabled={watchAd.isPending || adPlaying || !p.ads.canWatch} aria-label={t("adAriaFull", { reward: fmt(p.ads.rewardEnergy), remaining: p.ads.remainingToday, cap: p.ads.dailyCap })} className="ad-banner-gold btn-press inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold disabled:opacity-40">
              <span aria-hidden="true">«</span>
              <PlayIcon size={18} />
              {adPlaying
                ? t("adPlaying")
                : p.ads.remainingToday <= 0
                  ? t("adQuotaOut")
                  : p.ads.cooldownRemainingSec > 0
                    ? t("adNextIn", { s: p.ads.cooldownRemainingSec })
                    : t("watchAdBtn", { energy: fmt(p.ads.rewardEnergy) })}
              <span aria-hidden="true">»</span>
            </button>
            <p className="mt-1.5 text-center text-xs text-[var(--dim)]">
              {t("adNote", { watched: p.ads.watchedToday, cap: p.ads.dailyCap })}
            </p>
          </div>
        </div>

        <nav aria-label={t("navLabel")} className="sticky top-0 z-20 mt-3 grid grid-cols-3 gap-1.5 bg-[var(--bg)]/95 py-1.5 backdrop-blur">
          {tabs.map((t) => (<button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`btn-press relative inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 py-1.5 text-center text-xs font-bold leading-tight ${tab === t.id ? "bg-cyan-400 text-black" : "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]"}`}><span className="shrink-0">{t.icon}</span><span className="min-w-0">{t.label}</span>{t.badge != null && (<span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{t.badge}</span>)}</button>))}
        </nav>

        {banner && (<div key={bannerId} role="status" className={`banner-in mt-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${banner.kind === "good" ? "border-emerald-500/40 bg-emerald-500/15" : banner.kind === "bad" ? "border-red-500/40 bg-red-500/15" : "border-[var(--border)] bg-[var(--surface)]"}`}>{banner.text}</div>)}

        <div key={tab} className="tab-content">

        {tab === "tambang" && (
          <section className="mt-3 space-y-3">
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="relative h-32 overflow-hidden">
                <img src={MAP_IMAGES[data.maps[exp.zoneIndex]?.image ?? "asteroid"] ?? asteroidImg} alt={t("mapImgAlt", { zone: exp.zoneName })} className="animate-drift h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] to-transparent" />
                <div className="absolute bottom-2 left-4 right-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg leading-tight">{exp.name}</h2>
                      <p className="text-xs text-slate-300">{exp.klass} · ⌀ {fmt(exp.diameterKm)} km · {exp.zoneName}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-cyan-300 border border-cyan-500/40"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE FEED • CAM 04</span>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <ExpandableText className="text-sm text-[var(--dim)]">{p.zoneDesc}</ExpandableText>
                {(() => { const cm = data.maps[exp.zoneIndex]; if (!cm) return null; const chips: ReactNode[] = [];
                  if (cm.jamChancePct > 0) chips.push(<span key="jam" className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[11px] font-bold text-red-300"><AlertIcon size={12} /> {t("chipJam", { pct: cm.jamChancePct })}</span>);
                  if (cm.damageChancePct > 0) chips.push(<span key="dmg" className="inline-flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-400/10 px-2 py-0.5 text-[11px] font-bold text-orange-300"><ShieldIcon size={12} /> {t("chipDamage", { pct: cm.damageChancePct, fee: fmt(cm.damageFeeKt) })}</span>);
                  if (cm.radiation > 0) chips.push(<span key="rad" className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[11px] font-bold text-violet-300"><RadiationIcon size={12} /> {t("chipRadiation", { n: cm.radiation })}</span>);
                  if (cm.timeFactor > 1) chips.push(<span key="time" className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[11px] font-bold text-sky-300">{t("chipTime", { pct: Math.round((cm.timeFactor - 1) * 100) })}</span>);
                  return chips.length > 0 ? (<div className="mt-2 flex flex-wrap gap-1.5" aria-label={t("chipsAria")}>{chips}</div>) : (<p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300"><ShieldIcon size={12} /> {t("chipSafe")}</p>);
                })()}
                {exp.scanned && (<p className="mt-2 text-sm font-bold">{t("veinsMined", { mined: exp.minedCount, count: exp.veinCount })}{exp.allMined ? t("asteroidDone") : ""}</p>)}

                {job ? (
                  <JobPanel job={job} dualDrill={p.premium.dualDrill} onCollect={() => collect.mutate()} collecting={collect.isPending} onCancel={() => cancelJob.mutate()} cancelling={cancelJob.isPending} onRefresh={refresh} />
                ) : !exp.scanned ? (
                  <div className="mt-3 rounded-xl border border-cyan-500/30 bg-[var(--surface2)] p-3">
                    <h3 className="font-display inline-flex items-center gap-2 text-sm"><span className="text-cyan-300"><TelescopeIcon size={17} /></span> {t("notScannedTitle")}</h3>
                    <ExpandableText className="mt-1 text-sm text-[var(--dim)]">{trich("notScannedDesc", { count: exp.veinCount })}</ExpandableText>
                    <button type="button" onClick={() => startScan.mutate()} disabled={startScan.isPending || p.energy < exp.scanEnergyCost} className="btn-press mt-3 w-full rounded-xl bg-cyan-400 px-4 py-2.5 font-display text-sm text-black disabled:opacity-40">
                      {p.energy < exp.scanEnergyCost ? t("scanNoEnergy", { cost: exp.scanEnergyCost }) : t("startScanBtn", { cost: exp.scanEnergyCost, dur: fmtDur(exp.scanDurationSec) })}
                    </button>
                    <ExpandableText className="mt-2 text-xs text-[var(--dim)]">{trich("scanNote")}</ExpandableText>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {exp.anomalyText && (<p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200"><span className="mt-0.5 shrink-0"><AlertIcon size={15} /></span> {t("anomalyDetected", { text: exp.anomalyText })}</p>)}
                    <ul className="space-y-2.5">
                      {exp.veins.map((v) => {
                        const rare = RARE_ORE_IDS.has(v.oreId);
                        return (
                          <li key={v.index} className={`vein-tile rounded-xl border p-2.5 ${v.mined ? "border-[var(--border)] bg-black/30 opacity-70" : "border-cyan-500/25 bg-[var(--surface2)]"}`}>
                            <div className="flex items-start gap-3">
                              <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 ${v.mined ? "" : "ore-glow"} ${rare && !v.mined ? "crystal-shine" : ""}`} style={{ backgroundColor: v.color + "33" }}><OreIcon id={v.icon} color={v.color} size={24} /></span>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold leading-tight">{v.name} <span className="text-sm font-semibold text-[var(--dim)]">{t("veinQty", { qty: v.qty, s: v.qty === 1 ? "" : "s" })}</span></p>
                                <p className="mt-0.5 text-xs text-[var(--dim)]">
                                  {t("veinHardness", { dots: "●".repeat(v.hardness) + "○".repeat(4 - v.hardness), rich: v.richness })}{v.richness >= 85 ? t("richBonus") : ""}
                                </p>
                                <p className="text-xs text-[var(--dim)]">{t("veinValue", { kt: fmt(v.qty * (data.ores.find((o) => o.id === v.oreId)?.sellPrice ?? 0)) })}</p>
                              </div>
                              {v.mined && (<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-bold text-emerald-300"><CheckIcon size={12} /> {t("veinMined")}</span>)}
                            </div>
                            {!v.mined && (
                              <button type="button" onClick={() => startMine.mutate(v.index)} disabled={startMine.isPending || p.energy < v.energyCost} aria-label={t("mineAria", { name: v.name, cost: v.energyCost, dur: fmtDur(v.durationSec) })} className="btn-press mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-40">
                                <DrillIcon size={16} /> {p.energy < v.energyCost ? t("mineNoEnergy", { cost: v.energyCost }) : t("mineBtn", { cost: v.energyCost, dur: fmtDur(v.durationSec) })}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {exp.allMined ? (
                      <button type="button" onClick={() => complete.mutate()} disabled={complete.isPending} className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 font-display text-sm text-black disabled:opacity-40"><RocketIcon size={16} /> {t("completeBtn", { bonus: fmt(exp.completionBonusKt) })}</button>
                    ) : (
                      <p className="text-xs text-[var(--dim)]">{t("completeHint", { bonus: fmt(exp.completionBonusKt) })}</p>
                    )}
                  </div>
                )}

                {!job && (
                  <button type="button" onClick={() => abandon.mutate()} disabled={abandon.isPending || p.energy < exp.abandonEnergyCost} className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--dim)] disabled:opacity-40">
                    <SatelliteIcon size={15} /> {t("abandonBtn", { cost: exp.abandonEnergyCost })}
                  </button>
                )}
                {p.energy < 5 && !job && (<p className="mt-2.5 text-sm font-bold text-red-300">{t("lowEnergy", { dur: fmtDur(p.regenSeconds) })}</p>)}
              </div>
            </div>

            {data.pvp.encounter && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3">
                <h3 className="font-display inline-flex items-center gap-2 text-sm text-red-200"><SwordsIcon size={16} /> {t("pvpEncounterTitle")}</h3>
                <p className="mt-1 text-sm">
                  {data.pvp.encounter.isNpc
                    ? t("pvpEncounterPirate")
                    : t("pvpEncounterMiner", { name: data.pvp.encounter.defenderName ?? t("pvpUnknownMiner") })}
                </p>
                <p className="mt-1 text-sm font-bold">
                  {t("pvpEncounterPowers", { def: data.pvp.encounter.defensePower, atk: data.pvp.attackPower })}
                </p>
                <p className="mt-0.5 text-xs text-[var(--dim)]">
                  {t("pvpEncounterExpires", { dur: fmtDur(Math.max(0, Math.floor((new Date(data.pvp.encounter.expiresAt).getTime() - Date.now()) / 1000))) })}
                </p>
                {data.pvp.attackReadyAt != null && new Date(data.pvp.attackReadyAt).getTime() > Date.now() && (
                  <p className="mt-1 text-xs font-bold text-amber-300">{t("labCooldown", { dur: fmtDur(Math.max(0, Math.floor((new Date(data.pvp.attackReadyAt).getTime() - Date.now()) / 1000))) })}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => pvpAttack.mutate()} disabled={pvpAttack.isPending || pvpSkip.isPending || (data.pvp.attackReadyAt != null && new Date(data.pvp.attackReadyAt).getTime() > Date.now())} className="btn-press rounded-xl bg-red-500 px-4 py-2.5 font-display text-sm text-white disabled:opacity-40">
                    {t("pvpAttackBtn")}
                  </button>
                  <button type="button" onClick={() => pvpSkip.mutate()} disabled={pvpAttack.isPending || pvpSkip.isPending} className="btn-press rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">
                    {t("pvpSkipBtn")}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              {[{ label: t("statDigs"), value: fmt(p.totalDigs) }, { label: t("statAsteroids"), value: fmt(p.asteroidsDone) }, { label: t("statUsdtPaid"), value: fmt(p.totalWdPaidUsdt) }].map((s, i) => (<div key={s.label} className="animate-float-slow rounded-xl bg-[var(--surface)] border border-[var(--border)] px-2 py-2" style={{ animationDelay: `${i * 0.9}s` }}><p className="font-display text-lg">{s.value}</p><p className="text-[11px] font-semibold text-[var(--dim)]">{s.label}</p></div>))}
            </div>

            <details className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
              <summary className="font-display inline-flex cursor-pointer items-center gap-2 text-sm"><BookIcon size={15} /> {t("rulesTitle")}</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
                <li><ExpandableText>{trich("rule1")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule2")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule3", { scanDur: fmtDur(exp.scanDurationSec) })}</ExpandableText></li>
                <li><ExpandableText>{t("rule4")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule5", { regen: fmtDur(p.regenSeconds), maxEnergy: p.maxEnergy, fullDur: fmtDur(p.regenSeconds * p.maxEnergy) })}</ExpandableText></li>
                <li><ExpandableText>{trich("rule6")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule7")}</ExpandableText></li>
                <li><ExpandableText>{t("rule8")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule9")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule10")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule11")}</ExpandableText></li>
                <li><ExpandableText>{t("rule12", { dailyBonus: fmt(p.dailyBonusKt) })}</ExpandableText></li>
                <li><ExpandableText>{trich("rule13", { adReward: fmt(p.ads.rewardEnergy), adCap: p.ads.dailyCap, adCooldown: fmtDur(p.ads.cooldownSeconds), adDailyMax: fmt(p.ads.rewardEnergy * p.ads.dailyCap) })}</ExpandableText></li>
                <li><ExpandableText>{trich("rule14", { travelNear: data.maps[0]?.travelCost ?? 4, travelFar: data.maps[4]?.travelCost ?? 12 })}</ExpandableText></li>
                <li><ExpandableText>{trich("rule15")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule16")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule17")}</ExpandableText></li>
                <li><ExpandableText>{trich("rule18")}</ExpandableText></li>
              </ol>
            </details>

            {data.activity.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <LogCard icon={<span className="text-cyan-300"><RocketIcon size={15} /></span>} title={t("logMission")} desc={t("logMissionDesc")} items={data.activity.filter((a) => a.category === "mission")} />
                <LogCard icon={<span className="text-emerald-300"><GemIcon size={15} /></span>} title={t("logEconomy")} desc={t("logEconomyDesc")} items={data.activity.filter((a) => a.category === "economy")} />
              </div>
            )}
          </section>
        )}

        {tab === "peta" && (
          <PetaTab data={data} onTravel={(i) => travel.mutate(i)} travelling={travel.isPending} jobActive={job != null} onGoPremium={() => setTab("upgrade")} />
        )}

        {tab === "pasar" && (
          <section className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <img src={oresImg} alt={t("oresImgAlt")} className="h-32 w-full object-cover" />
            <div className="p-3">
              <div className="flex items-center justify-between gap-3"><h2 className="font-display text-base">{t("marketTitle")}</h2><button type="button" onClick={() => sellAll.mutate()} disabled={sellAll.isPending || totalOreQty === 0} className="btn-press rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-40">{t("sellAll")}</button></div>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--dim)]">{t("marketNote", { premium: p.premium.active ? t("marketNotePremium") : "" })}</p>
              <ul className="mt-2 divide-y divide-[var(--border)]">{data.ores.map((o) => { const rare = RARE_ORE_IDS.has(o.id); return (<li key={o.id} className="flex items-center gap-3 py-2"><span aria-hidden="true" className={`ore-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 ${rare ? "crystal-shine" : ""}`} style={{ backgroundColor: o.color + "33" }}><OreIcon id={o.icon} color={o.color} size={24} /></span><div className="min-w-0 flex-1"><p className="font-bold leading-tight">{o.name}</p><p className="text-xs text-[var(--dim)]">{fmt(o.sellPrice)} {t("perUnitCargo", { qty: fmt(o.qty) })}</p></div><p className="font-display text-sm">{fmt(o.sellPrice * o.qty)} KT</p><button type="button" onClick={() => sellOne.mutate({ oreId: o.id, qty: o.qty })} disabled={sellOne.isPending || o.qty === 0} aria-label={t("sellAllAria", { name: o.name })} className="btn-press rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm font-bold disabled:opacity-40">{t("sell")}</button></li>); })}</ul>
              {totalOreQty === 0 && (<p className="py-3 text-center text-sm text-[var(--dim)]">{t("cargoEmpty", { tab: t("tabMine") })}</p>)}
            </div>
          </section>
        )}

        {tab === "upgrade" && (
          <section className="mt-3 space-y-2.5">
            <PremiumCard data={data} onBuy={(plan) => buyPremium.mutate(plan)} buying={buyPremium.isPending} onBuyGram={(plan) => buyPremiumGram.mutate(plan)} buyingGram={buyPremiumGram.isPending} gramPhase={gramPhase} inTelegram={sessionInfo.inTelegram} onCancelOrder={(id) => cancelPremiumOrder.mutate(id)} cancelling={cancelPremiumOrder.isPending} />
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]"><img src={stationImg} alt={t("stationImgAlt")} className="h-28 w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-3"><ExpandableText className="text-sm font-semibold text-white">{t("hanggarCaption")}</ExpandableText></div></div>
            {data.upgrades.map((u) => (<div key={u.id} className="vein-tile rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2.5"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)]"><UpgradeIcon id={u.id} size={20} /></span><div><h3 className="font-display text-sm">{u.name}</h3><ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{u.desc}</ExpandableText><div className="mt-1.5 flex gap-1" aria-label={t("levelAria", { l: u.level, m: u.maxLevel })}>{Array.from({ length: u.maxLevel }, (_, i) => (<span key={i} className={`h-1.5 w-4 rounded-full ${i < u.level ? "bg-cyan-400" : "bg-[var(--surface2)]"}`} />))}</div></div></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-[var(--dim)]">{t("levelLabel")}</p><p className="font-display text-xl">{u.level}<span className="text-sm text-[var(--dim)]">/{u.maxLevel}</span></p></div></div>{u.nextCost != null ? (<button type="button" onClick={() => buy.mutate(u.id)} disabled={buy.isPending || p.ktBalance < u.nextCost} aria-label={t("buyAria", { name: u.name, l: u.level + 1, cost: fmt(u.nextCost) })} className="btn-press mt-2.5 w-full rounded-xl bg-cyan-400 px-4 py-1.5 font-bold text-black disabled:opacity-40">{p.ktBalance < u.nextCost ? t("needKt", { cost: fmt(u.nextCost) }) : t("installUpgrade", { cost: fmt(u.nextCost) })}</button>) : (<p className="mt-2.5 rounded-xl bg-[var(--surface2)] px-4 py-1.5 text-center font-bold">{t("maxLevel")}</p>)}</div>))}
          </section>
        )}

        {tab === "wd" && (<WdTab data={data} onCancel={(id) => cancelWd.mutate(id)} cancelling={cancelWd.isPending} onDone={(ok, err, good) => { showResult(ok, err, good); refresh(); }} />)}
        {tab === "komunitas" && (<KomunitasTab userId={sessionInfo.userId} referrals={data.player.referrals} channelBonusClaimed={data.player.channelBonusClaimed} channelBonusKt={data.player.channelBonusKt} onClaimChannel={() => claimChannel.mutate()} claimingChannel={claimChannel.isPending} />)}
        {tab === "lab" && (<LabTab data={data} onBuy={(kind) => buyTroop.mutate(kind)} onUpgrade={(kind) => upgradeTroop.mutate(kind)} buying={buyTroop.isPending} upgrading={upgradeTroop.isPending} />)}
        {tab === "admin" && p.isAdmin && (<AdminTab data={data} onDone={(ok, err, good) => { showResult(ok, err, good); refresh(); }} />)}
        </div>
      </main>
      {tab === "pengaturan" && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#050810]">
          <div className="pt-safe mx-auto max-w-3xl px-4 pb-6">
            <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-[var(--border)] bg-[#050810]/95 px-4 py-3 backdrop-blur">
              <button type="button" onClick={() => setTab(prevTab)} aria-label={t("backLabel")} className="btn-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white"><ChevronLeftIcon size={20} /></button>
              <h2 className="font-display text-lg">{t("settingsTitle")}</h2>
            </div>
            <SettingsTab sessionLabel={sessionLabel} username={sessionInfo.username} onOpenTutorial={() => setShowTutorial(true)} />
          </div>
        </div>
      )}
      {showTutorial && (<TutorialOverlay onClose={dismissTutorial} />)}
    </div>
  );
}

/** Kartu sambutan 3 langkah (2026-11-25, owner: disetujui 2026-11-24
 *  "terapkan nanti", diterapkan 2026-11-25): overlay layar penuh di
 *  atas layar home yang meredup (z-60, di atas Pengaturan z-50),
 *  muncul sekali saat pemain pertama buka game. Bukan tur interaktif
 *  (menyototi tombol satu per satu susah + rawan bug) — hanya kartu
 *  statis + tombol "Mulai Menambang". Desain persis pratinjau yang
 *  disetujui owner (~/workspace/hero-redesign/preview-tutorial.html):
 *  kartu 360px, bingkai cyan, nomor langkah emas, tombol emas. */
function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const steps = [
    { title: t("tutStep1Title"), desc: t("tutStep1Desc") },
    { title: t("tutStep2Title"), desc: t("tutStep2Desc") },
    { title: t("tutStep3Title"), desc: t("tutStep3Desc") },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#030610]/[.82] p-4">
      <div className="w-full max-w-[360px] rounded-2xl border-[1.5px] border-cyan-400/55 bg-gradient-to-b from-[#0a1128] to-[#0b1220] p-5 shadow-[0_0_24px_rgba(34,211,238,0.25)]">
        <div className="mb-4 text-center">
          <div className="text-xl font-extrabold leading-tight tracking-wide text-white">{t("tutWelcome")}<br />ASTRA MINING</div>
          <div className="mt-1 text-[13px] text-slate-400">{t("tutSub")}</div>
        </div>
        {steps.map((s, i) => (
          <div key={s.title} className="mb-3.5 flex gap-3">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-sm font-extrabold text-[#1a1005]">{i + 1}</div>
            <div>
              <div className="text-sm font-bold text-white">{s.title}</div>
              <div className="text-[12.5px] leading-snug text-slate-400">{s.desc}</div>
            </div>
          </div>
        ))}
        <button type="button" onClick={onClose} aria-label={t("tutStart")} className="btn-press mt-1 w-full rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 px-4 py-3 text-[15px] font-extrabold text-[#1a1005]">{t("tutStart")}</button>
        <div className="mt-2.5 text-center text-[11px] text-slate-500">{t("tutNote")}</div>
      </div>
    </div>
  );
}

/** Tab Pengaturan (2026-11-23): dibuka HANYA lewat tombol slider
 *  di pojok kanan atas hero — bukan dari navigasi bawah — dan
 *  tampil sebagai LAYAR PENUH (overlay fixed inset-0 dengan header
 *  + tombol kembali, agar tidak mengganggu tampilan game). Isinya
 *  lima kartu seperti tab lain: Bahasa (pemilih bahasa dengan
 *  bendera 🇮🇩/🇬🇧 — satu-satunya emoji di game, atas perintah
 *  owner), Suara (toggle on/off, tersimpan di localStorage
 *  "astra-mining-sound"), Musik Latar (toggle sendiri, localStorage
 *  "astra-mining-music"), Cara Main (tombol membuka lagi kartu
 *  tutorial sambutan), dan Info Akun (baris Sesi yang dulu di
 *  hero + nama pengguna Telegram bila ada). Judul ditampilkan di
 *  header overlay, bukan di dalam komponen ini. */
function SettingsTab({ sessionLabel, username, onOpenTutorial }: { sessionLabel: string; username: string | null; onOpenTutorial: () => void }) {
  const [on, setOn] = useState(() => soundEnabled());
  const toggle = () => {
    const next = !on;
    setSoundEnabled(next);
    setOn(next);
    if (next) playClick();
  };
  const [musicOn, setMusicOn] = useState(() => musicEnabled());
  const toggleMusic = () => {
    const next = !musicOn;
    setMusicEnabled(next);
    setMusicOn(next);
    if (next) ensureMusic();
    else stopMusic();
  };
  return (
    <section className="mt-3 space-y-3">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="text-sm font-bold">{t("langLabel")}</p>
        <div className="mt-2"><LanguagePicker /></div>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{t("soundTitle")}</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">{t("soundHint")}</p>
          </div>
          <button type="button" role="switch" aria-checked={on} aria-label={t("soundTitle")} onClick={toggle} className={`btn-press relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-cyan-400" : "bg-[var(--surface2)]"}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        <p className="mt-2 text-xs font-bold text-[var(--dim)]">{on ? t("soundOn") : t("soundOff")}</p>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{t("musicTitle")}</p>
            <p className="mt-0.5 text-xs text-[var(--dim)]">{t("musicHint")}</p>
          </div>
          <button type="button" role="switch" aria-checked={musicOn} aria-label={t("musicTitle")} onClick={toggleMusic} className={`btn-press relative h-7 w-12 shrink-0 rounded-full transition-colors ${musicOn ? "bg-cyan-400" : "bg-[var(--surface2)]"}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${musicOn ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        <p className="mt-2 text-xs font-bold text-[var(--dim)]">{musicOn ? t("soundOn") : t("soundOff")}</p>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="text-sm font-bold">{t("tutOpenBtn")}</p>
        <p className="mt-0.5 text-xs text-[var(--dim)]">{t("tutSub")}</p>
        <button type="button" onClick={onOpenTutorial} aria-label={t("tutOpenBtn")} className="btn-press mt-2.5 w-full rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black">{t("tutOpenBtn")}</button>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="text-sm font-bold">{t("accountTitle")}</p>
        <p className="mt-2 text-sm text-[var(--dim)]">{sessionLabel}</p>
        {username && (<p className="mt-1 text-sm text-[var(--dim)]">{t("accountName")}: @{username}</p>)}
      </div>
    </section>
  );
}

function PremiumCard({ data, onBuy, buying, onBuyGram, buyingGram, gramPhase, inTelegram, onCancelOrder, cancelling }: { data: GameState; onBuy: (plan: "standard" | "pro") => void; buying: boolean; onBuyGram: (plan: "standard" | "pro") => void; buyingGram: boolean; gramPhase: "idle" | "paying" | "verifying"; inTelegram: boolean; onCancelOrder: (orderId: number) => void; cancelling: boolean }) {
  const p = data.player;
  const pendingOrder = data.premiumOrders.find((o) => o.status === "pending");
  const benefits = [t("ben1"), t("ben2"), t("ben3"), t("ben4")];
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-400/15 to-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display inline-flex items-center gap-2 text-base text-amber-300"><CrownIcon size={19} /> {t("premiumTitle")}</h3>
          <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{trich("premiumDesc")}</ExpandableText>
        </div>
        {p.premium.active && (<span className="shrink-0 rounded-full border border-amber-400/60 bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-200">{t("premiumBadge", { tier: p.premium.tier === "pro" ? "PRO" : "STANDARD" })}{p.premium.until ? t("premiumBadgeUntil", { date: fmtDate(p.premium.until) }) : ""}</span>)}
      </div>
      <ul className="mt-2 space-y-1.5">
        {benefits.map((b) => (<li key={b} className="flex items-start gap-2 text-sm"><span className="mt-0.5 shrink-0 text-amber-300"><CheckIcon size={14} /></span>{b}</li>))}
        <li className="flex items-start gap-2 text-sm"><span className="mt-0.5 shrink-0 text-amber-300"><DrillIcon size={14} /></span><span>{trich("proDual")}</span></li>
      </ul>
      {pendingOrder ? (
        <div className="mt-3 rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2.5">
          <p className="font-display text-sm text-amber-200">{pendingOrder.method === "gram" ? t("pendingOrderTitleGram", { id: pendingOrder.id, tier: pendingOrder.tier === "pro" ? "Pro" : "Standard", gram: fmt(pendingOrder.gramAmount ?? 0) }) : t("pendingOrderTitle", { id: pendingOrder.id, tier: pendingOrder.tier === "pro" ? "Pro" : "Standard", stars: fmt(pendingOrder.stars) })}</p>
          <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t(pendingOrder.method === "gram" ? "pendingOrderDescGram" : "pendingOrderDesc")}</ExpandableText>
          <button type="button" onClick={() => onCancelOrder(pendingOrder.id)} disabled={cancelling} aria-label={t("cancelOrderAria", { id: pendingOrder.id })} className="btn-press mt-2.5 w-full rounded-xl border border-amber-400/60 bg-transparent px-4 py-2 font-bold text-amber-200 disabled:opacity-40">{t("cancelOrderBtn")}</button>
        </div>
      ) : !inTelegram ? (
        <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-2.5 text-sm text-[var(--dim)]">{t("premiumStarsNeedTelegram")} {t("premiumGramNeedTelegram")}</p>
      ) : (
        <div className="mt-3">
          <p className="text-sm font-bold">{t("premiumBuyTitle")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {p.premium.plans.map((plan) => (
              <button key={plan.id} type="button" onClick={() => onBuy(plan.id as "standard" | "pro")} disabled={buying || buyingGram} aria-label={t("orderPlanAria", { label: plan.label, stars: fmt(plan.stars) })} className={`btn-press rounded-xl px-3 py-2.5 text-black disabled:opacity-40 ${plan.tier === "pro" ? "bg-gradient-to-b from-amber-300 to-amber-500 ring-2 ring-amber-200/60" : "bg-amber-400"}`}>
                <span className="block font-display text-sm">{t("planLine", { tier: plan.tier === "pro" ? "PRO" : "STANDARD", days: plan.days })}</span>
                <span className="mt-0.5 flex items-center justify-center gap-1 text-sm font-bold"><SparkleIcon size={14} /> {t("planStars", { stars: fmt(plan.stars) })}</span>
                <span className="block text-xs font-semibold">{plan.tier === "pro" ? t("planProTag") : t("planStdTag")}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm font-bold">{t("premiumBuyTitleGram")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {p.premium.plans.map((plan) => (
              <button key={`gram-${plan.id}`} type="button" onClick={() => onBuyGram(plan.id as "standard" | "pro")} disabled={buying || buyingGram} aria-label={t("orderPlanAriaGram", { label: plan.label, gram: fmt(plan.gram) })} className={`btn-press rounded-xl px-3 py-2.5 text-black disabled:opacity-40 ${plan.tier === "pro" ? "bg-gradient-to-b from-teal-300 to-teal-500 ring-2 ring-teal-200/60" : "bg-teal-400"}`}>
                <span className="block font-display text-sm">{t("planLine", { tier: plan.tier === "pro" ? "PRO" : "STANDARD", days: plan.days })}</span>
                <span className="mt-0.5 flex items-center justify-center gap-1 text-sm font-bold">{gramPhase !== "idle" && buyingGram ? t(gramPhase === "paying" ? "premiumGramPaying" : "premiumGramVerifying") : t("planGram", { gram: fmt(plan.gram) })}</span>
                <span className="block text-xs font-semibold">{plan.tier === "pro" ? t("planProTag") : t("planStdTag")}</span>
              </button>
            ))}
          </div>
          {p.premium.gramPriceUsd != null && (<p className="mt-2 text-center text-xs font-bold text-teal-300">{t("premiumGramRate", { price: fmt(p.premium.gramPriceUsd) })}</p>)}
          <p className="mt-2 text-xs text-[var(--dim)]">{t("premiumGramNote")}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--dim)]">{t("premiumHint")}</p>
    </div>
  );
}

/** One activity-log card (Log Misi / Log Ekonomi). Entries render
 *  fully, one line each — but the CARD never stretches down the
 *  page: only the first 5 entries show by default, and "Lihat
 *  selengkapnya (N lagi)" expands to all of them. Each card keeps
 *  its own expanded state. */
function LogCard({ icon, title, desc, items }: { icon: ReactNode; title: string; desc: string; items: GameState["activity"] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 5);
  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
      <h3 className="font-display inline-flex items-center gap-2 text-sm">{icon}{title}</h3>
      <p className="mt-0.5 text-xs text-[var(--dim)]">{desc}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--dim)]">{t("logEmpty")}</p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">{shown.map((a) => (<li key={a.id} className="flex items-baseline justify-between gap-3 text-sm"><p className="min-w-0 flex-1 text-sm">{a.message}{a.amountKt != null && (<span className={`ml-1.5 whitespace-nowrap font-bold ${a.amountKt >= 0 ? "text-emerald-300" : "text-red-300"}`}>{a.amountKt >= 0 ? "+" : ""}{fmt(a.amountKt)} KT</span>)}</p><span className="shrink-0 text-xs text-[var(--dim)]">{fmtDateTime(a.createdAt)}</span></li>))}</ul>
          {items.length > 5 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="btn-press mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm font-bold text-cyan-300">
              {expanded ? t("logShowLess") : t("logShowMore", { n: items.length - 5 })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PetaTab({ data, onTravel, travelling, jobActive, onGoPremium }: { data: GameState; onTravel: (index: number) => void; travelling: boolean; jobActive: boolean; onGoPremium: () => void }) {
  const p = data.player;
  return (
    <section className="mt-3 space-y-3">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
        <h2 className="font-display text-base">{t("mapsTitle")}</h2>
        <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{trich("mapsIntro", { layer: p.layer })}</ExpandableText>
        <p className="mt-1.5 text-xs leading-snug text-[var(--dim)]">{t("sectorHowTo")}</p>
        {jobActive && (<p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200"><span className="mt-0.5 shrink-0"><AlertIcon size={15} /></span> {t("mapsJobActive")}</p>)}
      </div>
      {data.maps.map((m) => {
        const img = MAP_IMAGES[m.image] ?? asteroidImg;
        return (
          <article key={m.index} className={`vein-tile overflow-hidden rounded-2xl border bg-[var(--surface)] ${m.isCurrent ? "border-cyan-400/70" : "border-[var(--border)]"}`}>
            <div className="relative h-24 overflow-hidden">
              <img src={img} alt={t("mapCardImgAlt", { name: m.name })} className={`h-full w-full object-cover ${m.unlocked ? "" : "opacity-50 saturate-50"}`} loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent" />
              <div className="absolute bottom-2 left-4 right-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">{t("mapTaglineLine", { n: m.index + 1, tagline: m.tagline })}</p>
                  <h3 className="font-display text-base leading-tight">{m.name}</h3>
                </div>
                {m.isCurrent ? (
                  <span className="shrink-0 rounded-full border border-cyan-400/60 bg-cyan-400/20 px-2.5 py-1 text-[11px] font-bold text-cyan-200">{t("mapCurrent")}</span>
                ) : !m.unlocked ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-400/50 bg-black/60 px-2.5 py-1 text-[11px] font-bold text-slate-300"><LockIcon size={12} /> {t("mapMinSector", { sector: m.minLayer })}</span>
                ) : null}
              </div>
            </div>
            <div className="p-3">
              <ExpandableText className="text-sm text-[var(--dim)]">{m.desc}</ExpandableText>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[11px] font-bold text-sky-200"><SatelliteIcon size={12} /> {t("mapScanPill", { dist: m.distanceLabel, dur: fmtDur(m.scanSeconds) })}</p>
              <h4 className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("mapMineralsTitle")}</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {m.gems.map((g) => (
                  <li key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface2)] py-1 pl-1.5 pr-2.5 text-xs font-semibold">
                    <OreIcon id={g.icon} color={g.color} size={16} /> {g.name} <span className="text-[var(--dim)]">{t("gemPrice", { price: fmt(g.price) })}</span>
                  </li>
                ))}
              </ul>
              <h4 className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("mapChallengesTitle")}</h4>
              <ul className="mt-1.5 space-y-1 text-sm">
                {m.jamChancePct === 0 && m.damageChancePct === 0 && m.radiation === 0 && m.timeFactor <= 1 ? (
                  <li className="flex items-center gap-2 text-emerald-300"><ShieldIcon size={14} /> {t("mapSafe", { dur: fmtDur(m.scanSeconds) })}</li>
                ) : (
                  <>
                    {m.jamChancePct > 0 && (<li className="flex items-center gap-2"><span className="text-red-300"><AlertIcon size={14} /></span> {t("mapJam", { pct: m.jamChancePct })}</li>)}
                    {m.damageChancePct > 0 && (<li className="flex items-center gap-2"><span className="text-orange-300"><ShieldIcon size={14} /></span> {t("mapDamage", { pct: m.damageChancePct, fee: fmt(m.damageFeeKt) })}</li>)}
                    {m.radiation > 0 && (<li className="flex items-center gap-2"><span className="text-violet-300"><RadiationIcon size={14} /></span> {t("mapRadiation", { n: m.radiation })}</li>)}
                    {m.timeFactor > 1 && (<li className="flex items-center gap-2"><span className="text-sky-300"><DrillIcon size={14} /></span> {t("mapTime", { dur: fmtDur(m.scanSeconds), pct: Math.round((m.timeFactor - 1) * 100) })}</li>)}
                  </>
                )}
              </ul>
              {!m.isCurrent && (
                m.unlocked ? (
                  <button type="button" onClick={() => onTravel(m.index)} disabled={travelling || jobActive || p.energy < m.travelCost} aria-label={t("travelAria", { name: m.name })} className="btn-press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-40">
                    <RocketIcon size={16} /> {jobActive ? t("travelBusy") : p.energy < m.travelCost ? t("travelNeedPower", { cost: fmt(m.travelCost) }) : m.travelCost === 0 ? t("travelFree") : t("travelGo", { cost: fmt(m.travelCost) })}
                  </button>
                ) : (
                  <p className="mt-3 rounded-xl bg-[var(--surface2)] px-4 py-2 text-center text-sm font-bold text-[var(--dim)]">{t("mapLockedText", { sector: m.minLayer })}</p>
                )
              )}
            </div>
          </article>
        );
      })}
      {!p.premium.active && (
        <button type="button" onClick={onGoPremium} className="btn-press flex w-full items-center gap-3 rounded-2xl border-2 border-amber-400/50 bg-amber-400/10 p-3 text-left">
          <span className="text-amber-300"><CrownIcon size={26} /></span>
          <span><span className="block font-display text-sm text-amber-200">{t("mapsPromoTitle")}</span><span className="block text-sm text-[var(--dim)]">{t("mapsPromoDesc")}</span></span>
        </button>
      )}
    </section>
  );
}

function JobPanel({ job, dualDrill, onCollect, collecting, onCancel, cancelling, onRefresh }: { job: NonNullable<GameState["job"]>; dualDrill: boolean; onCollect: () => void; collecting: boolean; onCancel: () => void; cancelling: boolean; onRefresh: () => void }) {
  const now = useNow(true);
  const started = new Date(job.startedAt).getTime();
  const ends = new Date(job.endsAt).getTime();
  const remaining = Math.max(0, Math.ceil((ends - now) / 1000));
  const progress = Math.min(100, Math.max(0, ((now - started) / Math.max(1, ends - started)) * 100));
  const ready = remaining <= 0;
  useEffect(() => { if (ready) onRefresh(); }, [ready, onRefresh]);
  const isScan = job.kind === "scan";
  const title = ready
    ? (<span className="inline-flex items-center gap-2"><span className="text-emerald-300"><CheckIcon size={16} /></span> {t("jobDone")}</span>)
    : isScan
      ? (<span className="inline-flex items-center gap-2"><span className="text-cyan-300"><TelescopeIcon size={16} /></span> {t("jobScanning")}</span>)
      : (<span className="inline-flex items-center gap-2"><span className="text-amber-300"><DrillIcon size={16} /></span> {dualDrill ? t("jobDrillingDual", { ore: job.oreName ?? "mineral" }) : t("jobDrilling", { ore: job.oreName ?? "mineral" })}</span>);
  const sparks = [
    { left: "18%", top: "62%", sx: "-16px", sy: "12px", delay: "0s" },
    { left: "30%", top: "70%", sx: "-8px", sy: "18px", delay: "0.28s" },
    { left: "24%", top: "78%", sx: "-20px", sy: "8px", delay: "0.55s" },
  ];
  return (
    <div className="mt-3 rounded-xl border border-cyan-500/30 bg-[var(--surface2)] p-3" role="status" aria-label={t("jobAria")}>
      <div className="flex items-center gap-3">
        {!ready && isScan && (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-cyan-400/50 bg-[#04121f]" aria-hidden="true">
            <div className="radar-sweep absolute inset-0 rounded-full" />
            <div className="absolute inset-[16%] rounded-full border border-cyan-400/25" />
            <div className="absolute inset-[33%] rounded-full border border-cyan-400/25" />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200" />
            <span className="absolute left-[30%] top-[38%] h-1.5 w-1.5 rounded-full bg-cyan-300 animate-ping" />
            <span className="absolute left-[30%] top-[38%] h-1.5 w-1.5 rounded-full bg-cyan-200" />
            <span className="absolute left-[64%] top-[58%] h-1.5 w-1.5 rounded-full bg-teal-300 animate-ping" style={{ animationDelay: "0.7s" }} />
            <span className="absolute left-[64%] top-[58%] h-1.5 w-1.5 rounded-full bg-teal-200" />
            <span className="absolute left-[52%] top-[24%] h-1.5 w-1.5 rounded-full bg-sky-300 animate-ping" style={{ animationDelay: "1.3s" }} />
            <span className="absolute left-[52%] top-[24%] h-1.5 w-1.5 rounded-full bg-sky-200" />
          </div>
        )}
        {!ready && !isScan && (
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-400/40 bg-[#170f04]" aria-hidden="true">
            {dualDrill ? (
              <>
                <span className="drill-working absolute left-[16%] top-[24%] text-amber-300"><DrillIcon size={26} /></span>
                <span className="drill-working absolute bottom-[16%] right-[14%] text-amber-200" style={{ animationDelay: "0.11s" }}><DrillIcon size={26} /></span>
              </>
            ) : (
              <span className="drill-working text-amber-300"><DrillIcon size={32} /></span>
            )}
            {sparks.map((s, i) => (
              <span key={i} className="spark" style={{ left: s.left, top: s.top, animationDelay: s.delay, "--sx": s.sx, "--sy": s.sy } as CSSProperties} />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm">{title}</h3>
          {!ready && (<p className="mt-1 text-sm font-bold">{t("jobTimeLeft", { dur: fmtDur(remaining) })}</p>)}
          <p className="mt-1 text-xs text-[var(--dim)]">{ready
            ? (isScan
              ? t("jobReadyScan")
              : job.jammed
                ? t("jobReadyJammed")
                : job.hullHit
                  ? t("jobReadyHull")
                  : t("jobReadyMine"))
            : t("jobRunning")}</p>
        </div>
      </div>
      <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label={t("jobProgress")}>
        <div className={`h-full rounded-full transition-all ${ready ? "bg-emerald-400" : "job-working"}`} style={{ width: `${ready ? 100 : progress}%` }} />
      </div>
      {ready ? (
        <button type="button" onClick={onCollect} disabled={collecting} className="btn-press collect-pop mt-2.5 w-full rounded-xl bg-emerald-400 px-4 py-2.5 font-display text-sm text-black disabled:opacity-40">{isScan ? t("jobCollectScan") : t("jobCollectMine")}</button>
      ) : (
        <button type="button" onClick={onCancel} disabled={cancelling} className="btn-press mt-2.5 rounded-xl border border-red-400 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40">{t("jobCancel")}</button>
      )}
    </div>
  );
}

// Alamat TON (cermin isTonAddress di server — klien tidak bisa impor
// kode server): friendly mainnet 48 karakter diawali EQ/UQ, atau
// raw "0:" + 64 hex. Dipakai untuk menonaktifkan tombol WD + pesan
// kesalahan langsung di form; server tetap memvalidasi ulang.
const isTonAddress = (a: string) =>
  /^[EU]Q[A-Za-z0-9_-]{46}$/.test(a) || /^0:[0-9a-fA-F]{64}$/.test(a);

function WdTab({ data, onCancel, cancelling, onDone }: { data: GameState; onCancel: (id: number) => void; cancelling: boolean; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const p = data.player; const [wallet, setWallet] = useState(""); const [usdt, setUsdt] = useState(p.wdMinUsdt);
  const ktCost = Math.round(usdt * p.ktPerUsdt); const enough = p.ktBalance >= ktCost;
  const belowMin = ktCost < p.wdMinKt; const offStep = ktCost % p.wdStepKt !== 0;
  const aboveMax = ktCost > p.wdMaxKt;
  // Alamat TON (sama seperti isTonAddress di server): friendly mainnet
  // 48 karakter diawali EQ/UQ, atau raw "0:" + 64 hex.
  const walletOk = isTonAddress(wallet.trim());
  const request = useMutation({ mutationFn: () => api.requestWithdrawal({ walletAddress: wallet.trim(), amountKt: ktCost }), onSuccess: (r) => { if (r.ok) { playCoin(); setWallet(""); } onDone(r.ok, r.error, t("wdRequestSent", { id: r.wdId ?? "", kt: fmt(ktCost) })); } });
  return (
    <section className="mt-3 space-y-3">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"><img src={stationImg} alt={t("wdStationImgAlt")} className="h-24 w-full object-cover" /><div className="p-3">
        <div className="flex items-center gap-3">
          <img src={ktLogoImg} alt={t("ktLogoAltShort")} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-amber-400/50" />
          <div>
            <h2 className="font-display text-base leading-tight">{t("wdTitle")}</h2>
            <p className="text-xs text-[var(--dim)]">{t("wdTokenNote")}</p>
          </div>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed"><li><ExpandableText>{trich("wdRule1")}</ExpandableText></li><li><ExpandableText>{trich("wdRule2a", { min: fmt(p.wdMinUsdt), minkt: fmt(p.wdMinKt) })}{p.wdPaidCount > 0 ? trich("wdRule2b", { count: p.wdPaidCount }) : trich("wdRule2c")}{t("wdRule2d")}</ExpandableText></li><li><ExpandableText>{trich("wdRule3")}</ExpandableText></li><li><ExpandableText>{t("wdRule4")}</ExpandableText></li><li><ExpandableText>{trich("wdRule5")}</ExpandableText></li><li><ExpandableText>{t("wdRule6")}</ExpandableText></li></ol>
        <div className="mt-3"><div className="flex justify-between text-xs font-bold"><span>{t("wdProgress", { min: fmt(p.wdMinUsdt) })}</span><span className="text-[var(--dim)]">{t("wdProgressLine", { have: fmt(Math.min(p.ktBalance, p.wdMinKt)), need: fmt(p.wdMinKt) })}</span></div><div className="mt-1 h-3 overflow-hidden rounded-full bg-[var(--surface2)]"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (p.ktBalance / p.wdMinKt) * 100)}%` }} /></div></div>
        <form className="mt-3 space-y-2.5" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
          <div><label htmlFor="wallet" className="text-sm font-bold">{t("wdWalletLabel")}</label><input id="wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder={t("wdWalletPlaceholder")} autoComplete="off" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm" /><p className="mt-1 text-xs text-[var(--dim)]">{t("wdTonNote")}</p></div>
          <div><label htmlFor="usdt" className="text-sm font-bold">{t("wdUsdtLabel")}</label><input id="usdt" type="number" min={p.wdMinUsdt} max={p.wdMaxUsdt} step={0.1} value={usdt} onChange={(e) => setUsdt(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2" /><p className="mt-1 text-xs text-[var(--dim)]">{t("wdCostLine", { kt: fmt(ktCost), bal: fmt(p.ktBalance), min: fmt(p.wdMinUsdt), max: fmt(p.wdMaxUsdt) })}</p>{belowMin && (<p className="mt-1 text-xs font-bold text-red-300">{t("wdBelowMin", { min: fmt(p.wdMinUsdt), minkt: fmt(p.wdMinKt) })}</p>)}{!belowMin && offStep && (<p className="mt-1 text-xs font-bold text-red-300">{t("wdOffStep")}</p>)}{!belowMin && !offStep && aboveMax && (<p className="mt-1 text-xs font-bold text-red-300">{t("wdAboveMax", { max: fmt(p.wdMaxUsdt), maxkt: fmt(p.wdMaxKt) })}</p>)}</div>
          <button type="submit" disabled={request.isPending || !walletOk || !enough || belowMin || offStep || aboveMax} className="btn-press w-full rounded-xl bg-cyan-400 px-4 py-2.5 font-display text-sm text-black disabled:opacity-40">{belowMin || offStep || aboveMax ? t("wdSubmitCheck") : !enough ? t("wdNeedKt", { kt: fmt(ktCost - p.ktBalance) }) : t("wdSubmitGo", { usdt: fmt(usdt) })}</button>
          {wallet.trim().length > 0 && !walletOk && (<p className="text-xs font-bold text-red-300">{t("wdWalletInvalid")}</p>)}
        </form>
      </div></div>
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><h3 className="font-display text-sm">{t("wdHistory")}</h3>{data.withdrawals.length === 0 ? (<p className="mt-2 text-sm text-[var(--dim)]">{t("wdHistoryEmpty", { min: fmt(p.wdMinKt), usdt: fmt(p.wdMinUsdt) })}</p>) : (<ul className="mt-2 space-y-2">{data.withdrawals.map((w) => (<li key={w.id} className="rounded-xl bg-[var(--surface2)] p-3"><div className="flex items-center justify-between gap-2"><p className="font-display text-sm">#{w.id} · {fmt(w.amountUsdt)} USDT</p><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(w.status)}`}>{statusLabel(w.status)}</span></div><p className="mt-1 break-all font-mono text-xs text-[var(--dim)]">{w.walletAddress}</p><p className="mt-1 text-xs text-[var(--dim)]">{t("wdHistoryLine", { kt: fmt(w.amountKt), created: fmtDateTime(w.createdAt), processed: w.processedAt ? t("wdProcessedAt", { date: fmtDateTime(w.processedAt) }) : "" })}</p>{w.adminNote && <p className="mt-1 text-xs">{t("wdOwnerNote", { note: w.adminNote })}</p>}{w.txRef && <p className="mt-1 break-all font-mono text-xs">{t("wdTxRefLabel", { ref: w.txRef })}</p>}{w.status === "pending" && (<button type="button" onClick={() => onCancel(w.id)} disabled={cancelling} aria-label={t("wdCancelAria", { id: w.id })} className="btn-press mt-2 rounded-lg border border-red-400 px-3 py-1.5 text-sm font-bold text-red-300">{t("wdCancelBtn")}</button>)}</li>))}</ul>)}</div>
    </section>
  );
}

function GrantPremiumCard({ data, onDone }: { data: GameState; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const [days, setDays] = useState(30);
  const [tier, setTier] = useState<"standard" | "pro">("pro");
  const grant = useMutation({
    mutationFn: () => api.grantPremium({ days, tier }),
    onSuccess: (r) => onDone(r.ok, r.error, t("premiumGranted", { tier: tier === "pro" ? t("tierProParen") : "Standard", days, date: r.premiumUntil ? fmtDateLong(r.premiumUntil) : "" })),
  });
  const confirm = useMutation({
    mutationFn: (orderId: number) => api.confirmPremiumOrder({ orderId }),
    onSuccess: (r) => onDone(r.ok, r.error, t("premiumConfirmed", { date: r.premiumUntil ? fmtDateLong(r.premiumUntil) : "" })),
  });
  const reject = useMutation({
    mutationFn: (orderId: number) => api.rejectPremiumOrder({ orderId }),
    onSuccess: (r) => onDone(r.ok, r.error, t("premiumRejected")),
  });
  // Setup satu kali: daftarkan webhook Stars ke Bot API supaya
  // pembayaran Stars langsung mengaktifkan Premium otomatis.
  const setupWebhook = useMutation({
    mutationFn: () => api.setupStarsWebhook({}),
    onSuccess: (r) => onDone(r.ok, r.error, t("starsWebhookConnected")),
  });
  const p = data.player;
  const pendingOrders = data.premiumOrders.filter((o) => o.status === "pending");
  const pastOrders = data.premiumOrders.filter((o) => o.status !== "pending").slice(0, 5);
  return (
    <div className="rounded-2xl border-2 border-amber-400/50 bg-[var(--surface)] p-3">
      <h3 className="font-display inline-flex items-center gap-2 text-sm text-amber-300"><CrownIcon size={16} /> {t("grantTitle")}</h3>
      <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{trich("grantDesc")}</ExpandableText>
      <p className="mt-2 text-sm">{t("grantStatusLabel")}{p.premium.active ? (<b className="text-amber-300">{t("grantStatusActive", { tier: p.premium.tier === "pro" ? "PRO" : "STANDARD", until: p.premium.until ? t("grantStatusActiveUntil", { date: fmtDateLong(p.premium.until) }) : "" })}</b>) : (<b>{t("grantStatusFree")}</b>)}</p>

      <h4 className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("grantPendingTitle")}</h4>
      {pendingOrders.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--dim)]">{t("grantPendingEmpty")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {pendingOrders.map((o) => (
            <li key={o.id} className="rounded-xl bg-[var(--surface2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm">#{o.id} · Premium {o.tier === "pro" ? "Pro" : "Standard"} · {o.days} hari</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-200"><SparkleIcon size={11} /> {o.method === "gram" ? t("planGram", { gram: fmt(o.gramAmount ?? 0) }) : t("planStars", { stars: fmt(o.stars) })}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--dim)]">{o.method === "gram" ? t("grantOrderNoteGram", { date: fmtDateTime(o.createdAt), gram: fmt(o.gramAmount ?? 0) }) : t("grantOrderNote", { date: fmtDateTime(o.createdAt), stars: fmt(o.stars) })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => confirm.mutate(o.id)} disabled={confirm.isPending} aria-label={t("grantConfirmAria", { id: o.id })} className="btn-press rounded-xl bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40">{t("grantConfirm")}</button>
                <button type="button" onClick={() => reject.mutate(o.id)} disabled={reject.isPending} aria-label={t("grantRejectAria", { id: o.id })} className="btn-press rounded-xl border border-red-400 px-4 py-2 font-bold text-red-300 disabled:opacity-40">{t("grantReject")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pastOrders.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--dim)]">
          {pastOrders.map((o) => (<li key={o.id}>#{o.id} · {o.tier === "pro" ? "Pro" : "Standard"} · {o.method === "gram" ? t("planGram", { gram: fmt(o.gramAmount ?? 0) }) : t("planStars", { stars: fmt(o.stars) })} — {o.status === "confirmed" ? t("grantPastConfirmed") : o.status === "paid" ? t("grantPastPaid") : t("grantPastRejected")}{o.processedAt ? ` · ${fmtDateTime(o.processedAt)}` : ""}</li>))}
        </ul>
      )}

      <h4 className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("grantManualTitle")}</h4>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); grant.mutate(); }}>
        <div>
          <label htmlFor="grant-tier" className="text-xs font-bold">{t("grantTierLabel")}</label>
          <select id="grant-tier" value={tier} onChange={(e) => setTier(e.target.value as "standard" | "pro")} className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <option value="standard">Standard</option>
            <option value="pro">{t("grantProOption")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="grant-days" className="text-xs font-bold">{t("grantDaysLabel")}</label>
          <input id="grant-days" type="number" min={1} max={365} step={1} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Math.floor(Number(e.target.value) || 1))))} className="mt-1 w-28 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2" />
        </div>
        <button type="submit" disabled={grant.isPending} className="btn-press rounded-xl bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40">{p.premium.active ? t("grantExtend") : t("grantActivate")}</button>
      </form>
      <p className="mt-2 text-xs text-[var(--dim)]">{t("grantNote")}</p>

      <h4 className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">{t("starsWebhookTitle")}</h4>
      <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("starsWebhookDesc")}</ExpandableText>
      <button type="button" onClick={() => setupWebhook.mutate()} disabled={setupWebhook.isPending} className="btn-press mt-2 rounded-xl bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40">{t("starsWebhookBtn")}</button>
    </div>
  );
}

function PlayerStatsCard({ data }: { data: GameState }) {
  const s = data.adminStats?.playerStats;
  if (!s) return null;
  return (<div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><h2 className="font-display text-base">{t("statsTitle")}</h2><div className="mt-2.5 grid grid-cols-4 gap-2 text-center"><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(s.total)}</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("statsTotal")}</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(s.active7d)}</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("statsActive7d")}</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(s.inactive7d)}</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("statsInactive7d")}</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(s.premiumActive)}</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("statsPremium")}</p></div></div></div>);
}

function BroadcastCard({ onDone }: { onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const send = useMutation({
    mutationFn: () => api.sendBroadcast({ text: text.trim() }),
    onSuccess: (r) => {
      if (r.ok) { setResult({ sent: r.sent, failed: r.failed }); setText(""); }
      onDone(r.ok, r.error, r.ok ? t("broadcastSent", { sent: r.sent, failed: r.failed }) : "");
    },
  });
  return (<div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><h2 className="font-display text-base">{t("broadcastTitle")}</h2><ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("broadcastDesc")}</ExpandableText><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("broadcastPlaceholder")} rows={3} maxLength={4000} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" /><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={() => send.mutate()} disabled={send.isPending || text.trim().length === 0} className="btn-press rounded-xl bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-40">{t("broadcastBtn")}</button>{result && (<p className="text-sm font-bold">{t("broadcastSent", { sent: result.sent, failed: result.failed })}</p>)}</div></div>);
}

function AdminTab({ data, onDone }: { data: GameState; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const order: Record<Wd["status"], number> = { pending: 0, approved: 1, paid: 2, rejected: 3, cancelled: 4 };
  const queue = [...data.withdrawals].sort((a, b) => order[a.status] - order[b.status] || b.id - a.id);
  const lockedKt = data.withdrawals.filter((w) => w.status === "pending" || w.status === "approved").reduce((a, w) => a + w.amountKt, 0);
  const owedUsdt = data.withdrawals.filter((w) => w.status === "approved").reduce((a, w) => a + w.amountUsdt, 0);
  return (<section className="mt-3 space-y-3"><PlayerStatsCard data={data} /><GrantPremiumCard data={data} onDone={onDone} /><FlaggedPlayersCard data={data} onDone={onDone} /><BroadcastCard onDone={onDone} /><div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><h2 className="font-display text-base">{t("adminTitle")}</h2><ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("adminFlow")}</ExpandableText><div className="mt-2.5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(lockedKt)} KT</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("adminLocked")}</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(owedUsdt)} USDT</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("adminReady")}</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-2"><p className="font-display text-base">{fmt(data.adminStats?.totalWdPaidUsdt ?? data.player.totalWdPaidUsdt)} USDT</p><p className="text-[11px] font-semibold text-[var(--dim)]">{t("adminPaid")}</p></div></div></div>{queue.length === 0 ? (<p className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3 text-sm text-[var(--dim)]">{t("adminEmpty")}</p>) : (queue.map((w) => <AdminWdCard key={w.id} wd={w} onDone={onDone} />))}</section>);
}

function FlaggedPlayersCard({ data, onDone }: { data: GameState; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const flagged = data.flaggedPlayers ?? [];
  const clear = useMutation({ mutationFn: (playerId: number) => api.clearPlayerFlag({ playerId }), onSuccess: (r, playerId) => { onDone(r.ok, r.error, t("flaggedCleared", { id: playerId })); } });
  return (<div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><h2 className="font-display text-base">{t("flaggedTitle")}</h2><ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("flaggedDesc")}</ExpandableText>{flagged.length === 0 ? (<p className="mt-2 text-sm text-[var(--dim)]">{t("flaggedEmpty")}</p>) : (<ul className="mt-2 space-y-2">{flagged.map((f) => (<li key={f.playerId} className="rounded-xl bg-[var(--surface2)] p-3"><div className="flex items-center justify-between gap-2"><p className="font-display text-sm">{f.username ? `@${f.username}` : t("flaggedNoUser")} · ID {f.telegramId ?? f.playerId}</p><span className="shrink-0 rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-200">{t("flaggedScore", { score: f.riskScore })}</span></div><p className="mt-1 text-xs text-[var(--dim)]">{f.flagReason ?? t("flaggedNoReason")}</p><p className="mt-1 text-xs text-[var(--dim)]">{t("flaggedLine", { kt: fmt(f.ktBalance), count: f.paidWdCount, at: f.flaggedAt ? t("flaggedAt", { date: fmtDateTime(f.flaggedAt) }) : "" })}</p><button type="button" onClick={() => clear.mutate(f.playerId)} disabled={clear.isPending} aria-label={t("flaggedClearAria", { id: f.telegramId ?? f.playerId })} className="btn-press mt-2 rounded-lg border border-emerald-400 px-3 py-1.5 text-sm font-bold text-emerald-300">{t("flaggedClear")}</button></li>))}</ul>)}</div>);
}

function AdminWdCard({ wd, onDone }: { wd: Wd; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const [note, setNote] = useState(""); const [txRef, setTxRef] = useState("");
  const act = useMutation({ mutationFn: async (action: "approve" | "reject" | "pay") => await api.updateWithdrawal({ wdId: wd.id, action, adminNote: note.trim() ? note.trim() : undefined, txRef: txRef.trim() ? txRef.trim() : undefined }), onSuccess: (r, action) => { const good = action === "approve" ? t("wdApproveDone", { id: wd.id, usdt: fmt(wd.amountUsdt) }) : action === "pay" ? t("wdPayDone", { id: wd.id }) : t("wdRejectDone", { id: wd.id }); onDone(r.ok, r.error, good); } });
  return (<div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3"><div className="flex items-center justify-between gap-2"><p className="font-display text-base">#{wd.id} · {fmt(wd.amountUsdt)} USDT</p><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(wd.status)}`}>{statusLabel(wd.status)}</span></div>{wd.needsReview && (<p className="mt-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">{t("wdNeedsReview")}</p>)}<p className="mt-1 text-sm text-[var(--dim)]">{t("wdLockedLine", { kt: fmt(wd.amountKt), date: fmtDateTime(wd.createdAt) })}</p><p className="mt-2 break-all rounded-lg bg-[var(--surface2)] px-3 py-2 font-mono text-xs">{wd.walletAddress}</p>{wd.adminNote && <p className="mt-2 text-sm">{t("wdAdminNote", { note: wd.adminNote })}</p>}{wd.txRef && <p className="mt-1 break-all font-mono text-xs text-[var(--dim)]">{t("wdTxRefLabel", { ref: wd.txRef })}</p>}{(wd.status === "pending" || wd.status === "approved") && (<div className="mt-2.5 space-y-2"><div><label htmlFor={`note-${wd.id}`} className="text-xs font-bold">{t("wdNoteLabel")}</label><input id={`note-${wd.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("wdNotePlaceholder")} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" /></div>{wd.status === "approved" && (<div><label htmlFor={`tx-${wd.id}`} className="text-xs font-bold">{t("wdTxRefLabel2")}</label><input id={`tx-${wd.id}`} value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder={t("wdTxRefPlaceholder")} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm" /></div>)}<div className="flex flex-wrap gap-2">{wd.status === "pending" && (<button type="button" onClick={() => act.mutate("approve")} disabled={act.isPending} aria-label={t("wdApproveAria", { id: wd.id })} className="btn-press rounded-xl bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-40">{t("wdApprove")}</button>)}{wd.status === "approved" && (<button type="button" onClick={() => act.mutate("pay")} disabled={act.isPending} aria-label={t("wdPayAria", { id: wd.id })} className="btn-press rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40">{t("wdMarkPaid")}</button>)}<button type="button" onClick={() => act.mutate("reject")} disabled={act.isPending} aria-label={t("wdRejectAria", { id: wd.id })} className="btn-press rounded-xl border border-red-400 px-4 py-2 font-bold text-red-300 disabled:opacity-40">{t("wdRejectRefund")}</button></div></div>)}</div>);
}

// --- Tab Komunitas (2026-11-20) ---------------------------------------
// Untuk SEMUA pemain (Kendali tetap admin-only). Isinya: gabung channel
// resmi, gabung grup diskusi (segera hadir — belum ada link grup), dan
// referral. Referral SUDAH dilacak server: saat pemain membuka Mini
// App pertama kali lewat link startapp
// ?startapp=ref_<telegramId> (link langsung membuka Mini App dengan
// kode referral menempel — jauh lebih andal daripada ?start= yang
// hanya membuka chat bot dan kode bisa hilang), server mencatatnya
// di tabel referrals; saat pemain yang diundang menyelesaikan
// ekspedisi pertamanya, pengundang otomatis mendapat 10 KT (lihat
// api/_lib/game.ts — recordReferralAttribution /
// payReferralRewardIfPending). Statistiknya tampil di kartu referral.

/** Channel Telegram resmi ASTRA MINING. */
const CHANNEL_URL = "https://t.me/astra_mining_gram";
/** Hadiah referral per teman yang mulai bermain. */
const REFERRAL_REWARD_KT = 10;
/** Bonus referral untuk teman yang diundang (diterima saat ia
 *  menyelesaikan ekspedisi pertamanya). */
const REFERRAL_REFEREE_REWARD_KT = 5;

/** Buka link t.me di dalam Telegram bila tersedia, kalau tidak di tab
 *  baru. openTelegramLink menjaga pemain tetap di dalam Telegram. */
function openExternalLink(url: string) {
  try {
    const wa = window.Telegram?.WebApp;
    if (wa && typeof wa.openTelegramLink === "function") {
      wa.openTelegramLink(url);
      return;
    }
  } catch {
    // Jatuh ke window.open di bawah.
  }
  window.open(url, "_blank", "noopener");
}

// PvP (2026-11-22): Laboratorium Pasukan — dua jenis drone yang
// dibeli/di-upgrade pakai KT yang sama dengan saldo WD. Kartu
// ringkasan kekuatan (Serang / Bertahan) ada di ATAS tab ini.
function LabTab({ data, onBuy, onUpgrade, buying, upgrading }: {
  data: GameState;
  onBuy: (kind: "attack" | "defense") => void;
  onUpgrade: (kind: "attack" | "defense") => void;
  buying: boolean;
  upgrading: boolean;
}) {
  const pvp = data.pvp;
  const shielded = pvp.shieldUntil != null && new Date(pvp.shieldUntil).getTime() > Date.now();
  const attackOnCooldown = pvp.attackReadyAt != null && new Date(pvp.attackReadyAt).getTime() > Date.now();
  const troops = [
    { kind: "attack" as const, name: t("labTroopAttackName"), desc: t("labTroopAttackDesc"), state: pvp.troops.attack, icon: <AttackDroneIcon size={18} />, accent: "text-red-300", img: droneAttackImg },
    { kind: "defense" as const, name: t("labTroopDefenseName"), desc: t("labTroopDefenseDesc"), state: pvp.troops.defense, icon: <DefenseDroneIcon size={18} />, accent: "text-sky-300", img: droneDefenseImg },
  ];
  return (
    <section className="mt-3 space-y-3">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <h2 className="font-display text-lg">{t("labTitle")}</h2>
        <ExpandableText className="mt-1 text-sm text-[var(--dim)]">{t("labDesc")}</ExpandableText>
        <div className="mt-3 flex divide-x divide-[var(--border)] rounded-xl border border-[var(--border)] bg-black/20">
          <p className="flex flex-1 items-baseline justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-[var(--dim)]">{t("labAttackPower")} <span className="font-display text-base text-red-300">{fmt(pvp.attackPower)}</span></p>
          <p className="flex flex-1 items-baseline justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-[var(--dim)]">{t("labDefensePower")} <span className="font-display text-base text-sky-300">{fmt(pvp.defensePower)}</span></p>
        </div>
        {shielded && (<p className="mt-2 text-sm font-bold text-emerald-300">{t("labShielded", { date: fmtDate(pvp.shieldUntil!) })}</p>)}
        {attackOnCooldown && (<p className="mt-1 text-sm text-[var(--dim)]">{t("labCooldown", { dur: fmtDur(Math.max(0, Math.floor((new Date(pvp.attackReadyAt!).getTime() - Date.now()) / 1000))) })}</p>)}
        {pvp.attackPower === 0 && pvp.defensePower === 0 && (<p className="mt-2 text-sm text-[var(--dim)]">{t("labNoTroops")}</p>)}
      </div>
      {troops.map((tr) => (
        <div key={tr.kind} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex justify-center bg-[#151a48] py-2">
            <img src={tr.img} alt={tr.name} className="aspect-square h-44 w-44 object-cover" />
          </div>
          <div className="p-3">
            <h3 className="font-display inline-flex items-center gap-2 text-sm"><span className={tr.accent}>{tr.icon}</span> {tr.name}</h3>
            <ExpandableText className="mt-1 text-sm text-[var(--dim)]">{tr.desc}</ExpandableText>
            <p className="mt-2 text-sm font-bold">{t("labOwned", { count: tr.state.count, level: tr.state.level, power: tr.state.power })}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => onBuy(tr.kind)} disabled={buying || upgrading || tr.state.count >= tr.state.maxCount || data.player.ktBalance < tr.state.buyCost} className="btn-press rounded-xl bg-cyan-400 px-5 py-2 text-sm font-bold text-black disabled:opacity-40">
                {tr.state.count >= tr.state.maxCount ? t("labMaxCount") : t("labBuyBtn", { cost: fmt(tr.state.buyCost) })}
              </button>
              <button type="button" onClick={() => onUpgrade(tr.kind)} disabled={buying || upgrading || tr.state.count === 0 || tr.state.upgradeCost == null || data.player.ktBalance < tr.state.upgradeCost} className="btn-press rounded-xl border border-amber-400/50 bg-amber-400/10 px-5 py-2 text-sm font-bold text-amber-200 disabled:opacity-40">
                {tr.state.upgradeCost == null ? t("labMaxLevel") : t("labUpgradeBtn", { level: tr.state.level + 1, cost: fmt(tr.state.upgradeCost) })}
              </button>
            </div>
          </div>
        </div>
      ))}
      <details className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
        <summary className="font-display inline-flex cursor-pointer items-center gap-2 text-sm"><BookIcon size={15} /> {t("labHowTitle")}</summary>
        <ExpandableText className="mt-2 text-sm leading-relaxed">{t("labHowDesc")}</ExpandableText>
      </details>
    </section>
  );
}

function KomunitasTab({ userId, referrals, channelBonusClaimed, channelBonusKt, onClaimChannel, claimingChannel }: { userId: number | null; referrals: { invited: number; rewarded: number; earnedKt: number; list: Array<{ id: number; name: string; status: "pending" | "rewarded"; joinedAt: string }> }; channelBonusClaimed: boolean; channelBonusKt: number; onClaimChannel: () => void; claimingChannel: boolean }) {
  const [copied, setCopied] = useState(false);
  // Link referral: Mini App + startapp payload ref_<telegramId>.
  // startapp membuka Mini App LANGSUNG dengan kode menempel
  // (Telegram memasukkannya ke initData.start_param), jadi deteksi
  // dijamin — beda dengan ?start= yang hanya membuka chat bot.
  // Tanpa userId (pemain web/legacy) tidak ada link — minta buka
  // lewat Telegram.
  const refLink = userId != null ? `https://t.me/astra_mining_bot/astra_mining?startapp=ref_${userId}` : null;
  const copyLink = async () => {
    if (!refLink) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(refLink);
      ok = true;
    } catch {
      // Fallback untuk browser lama / WebView tanpa izin clipboard.
      try {
        const ta = document.createElement("textarea");
        ta.value = refLink;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <section className="mt-3 space-y-2.5">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)]"><SatelliteIcon size={20} /></span>
          <div>
            <h3 className="font-display text-sm">{t("commChannelTitle")}</h3>
            <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("commChannelDesc")}</ExpandableText>
          </div>
        </div>
        {!channelBonusClaimed && (
          <button type="button" onClick={() => openExternalLink(CHANNEL_URL)} aria-label={t("commChannelAria")} className="btn-press mt-2.5 w-full rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black">{t("commChannelBtn")}</button>
        )}
        {userId != null && (channelBonusClaimed ? (
          <p className="mt-2.5 text-center text-sm font-bold text-emerald-300">{t("commChannelClaimed")}</p>
        ) : (
          <button type="button" onClick={onClaimChannel} disabled={claimingChannel} aria-label={t("commChannelClaim", { kt: fmt(channelBonusKt) })} className="btn-press mt-2.5 w-full rounded-xl border-2 border-dashed border-amber-400 bg-amber-400/10 px-4 py-2 font-bold text-amber-200">{t("commChannelClaim", { kt: fmt(channelBonusKt) })}</button>
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)]"><UsersIcon size={20} /></span>
          <div>
            <h3 className="font-display text-sm">{t("commGroupTitle")}</h3>
            <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("commGroupDesc")}</ExpandableText>
          </div>
        </div>
        <button type="button" disabled aria-label={t("commGroupAria")} className="mt-2.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-2 font-bold text-[var(--dim)] disabled:opacity-60">{t("commGroupSoon")}</button>
      </div>
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)]"><GiftIcon size={20} /></span>
          <div>
            <h3 className="font-display text-sm">{t("commRefTitle")}</h3>
            <ExpandableText className="mt-0.5 text-sm text-[var(--dim)]">{t("commRefDesc", { kt: fmt(REFERRAL_REWARD_KT), refereeKt: fmt(REFERRAL_REFEREE_REWARD_KT) })}</ExpandableText>
          </div>
        </div>
        {refLink ? (
          <div className="mt-2.5">
            <label htmlFor="ref-link" className="text-xs font-bold">{t("commRefLinkLabel")}</label>
            <div className="mt-1 flex gap-2">
              <p id="ref-link" className="min-w-0 flex-1 break-all rounded-xl bg-[var(--surface2)] px-3 py-2 font-mono text-xs">{refLink}</p>
              <button type="button" onClick={copyLink} aria-label={t("commRefCopyAria")} className="btn-press shrink-0 rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black">{copied ? t("commRefCopied") : t("commRefCopy")}</button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--dim)]">{t("commRefNoTelegram")}</p>
        )}
        <p className="mt-2 text-xs text-[var(--dim)]">{t("commRefStats", { invited: fmt(referrals.invited), earned: fmt(referrals.earnedKt) })}</p>
        {referrals.list.length > 0 ? (
          <div className="mt-2.5">
            <p className="text-xs font-bold">{t("commRefListTitle")}</p>
            <ul className="mt-1.5 space-y-1.5">
              {referrals.list.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface2)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{f.name}</p>
                    <p className="text-xs text-[var(--dim)]">{fmtDate(f.joinedAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${f.status === "rewarded" ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300" : "border-amber-400/50 bg-amber-400/15 text-amber-300"}`}>{f.status === "rewarded" ? t("refRewarded", { kt: fmt(REFERRAL_REWARD_KT) }) : t("refPending")}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : referrals.invited === 0 ? (
          <p className="mt-2 text-xs text-[var(--dim)]">{t("commRefEmpty")}</p>
        ) : null}
      </div>
    </section>
  );
}
