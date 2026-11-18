import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import heroImg from "./assets/hero.webp";
import asteroidImg from "./assets/asteroid.webp";
import oresImg from "./assets/ores.webp";
import stationImg from "./assets/station.webp";
import moonImg from "./assets/map-moon.webp";
import psycheImg from "./assets/map-psyche.webp";
import kuiperImg from "./assets/map-kuiper.webp";
import ktLogoImg from "./assets/kt-logo.webp";

const MAP_IMAGES: Record<string, string> = {
  hero: heroImg,
  asteroid: asteroidImg,
  moon: moonImg,
  psyche: psycheImg,
  kuiper: kuiperImg,
};

type GameState = ApiResponse<typeof api, "getGameState">;
type Wd = GameState["withdrawals"][number];
const fmt = (n: number) => n.toLocaleString("id-ID");
const STATUS_LABEL: Record<Wd["status"], string> = {
  pending: "Menunggu",
  approved: "Disetujui — kirim GRAM",
  paid: "Sudah Dibayar",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
function statusClass(status: Wd["status"]): string {
  switch (status) {
    case "pending": return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "approved": return "bg-sky-500/20 text-sky-300 border-sky-500/40";
    case "paid": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "rejected": return "bg-red-500/20 text-red-300 border-red-500/40";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(sec: number): string {
  if (sec < 60) return `${sec} dtk`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m} mnt ${s} dtk` : `${m} mnt`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`;
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

type Tab = "tambang" | "peta" | "pasar" | "upgrade" | "wd" | "admin";

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("tambang");
  const [banner, setBanner] = useState<{ kind: "good" | "bad" | "info"; text: ReactNode } | null>(null);
  const [bannerId, setBannerId] = useState(0);
  const showBanner = (kind: "good" | "bad" | "info", text: ReactNode) => { setBanner({ kind, text }); setBannerId((i) => i + 1); };
  const [burst, setBurst] = useState<Burst | null>(null);
  const [balanceGlow, setBalanceGlow] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);
  const state = useQuery({ queryKey: ["game-state"], queryFn: () => api.getGameState({}), refetchInterval: 5000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["game-state"] });
  const showResult = (ok: boolean, error: string | null, goodText: ReactNode) => showBanner(ok ? "good" : "bad", ok ? goodText : (error ?? "Gagal, coba lagi."));
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

  const startScan = useMutation({
    mutationFn: () => api.startScan({}),
    onSuccess: (r) => { showResult(r.ok, r.error, <>Spektrometer mulai memindai asteroid — operasi selesai dalam {fmtDur(r.durationSec)}. Sensor bekerja dengan waktu nyata.</>); refresh(); },
  });
  const startMine = useMutation({
    mutationFn: (veinIndex: number) => api.startMine({ veinIndex }),
    onSuccess: (r) => { showResult(r.ok, r.error, <>Lengan bor mulai mengebor urat {r.oreName ?? "mineral"} — selesai dalam {fmtDur(r.durationSec)}. Kamu boleh menutup halaman, bor tetap bekerja.</>); refresh(); },
  });
  const collect = useMutation({
    mutationFn: () => api.collectJob({}),
    onSuccess: (r) => {
      if (!r.ok) { showBanner("bad", r.error ?? "Belum bisa diambil."); refresh(); return; }
      if (r.kind === "scan") {
        showBanner("good", "Scan selesai — komposisi urat mineral asteroid terbuka. Pilih urat yang mau dibor.");
        fireBurst("scan");
      } else if (r.jammed) {
        showBanner("bad", (<span className="inline-flex items-center gap-1.5"><AlertIcon size={15} /> BOR MACET! Mata bor patah saat mengebor urat {r.oreName} — urat ini hilang tanpa hasil. Risiko khas peta ini; coba urat berikutnya.</span>));
      } else if (r.isRare) {
        showBanner("good", (<span className="inline-flex items-center gap-1.5"><SparkleIcon size={15} /> LANGKA! Dapat {r.oreName} ×{r.qty} dari urat asteroid!{r.hullHit ? ` Tapi lambung kapal terkena serpihan — biaya perbaikan ${fmt(r.repairFeeKt)} KT dipotong dari saldo.` : ""}</span>));
        fireBurst("rare");
      } else if (r.hullHit) {
        showBanner("bad", `Hasil tambang masuk kargo: ${r.oreName} ×${r.qty}. Tapi lambung kapal terkena serpihan tajam — biaya perbaikan ${fmt(r.repairFeeKt)} KT dipotong dari saldo.`);
        fireBurst("mine");
      } else {
        showBanner("info", `Hasil tambang masuk kargo: ${r.oreName} ×${r.qty}.`);
        fireBurst("mine");
      }
      refresh();
    },
  });
  const cancelJob = useMutation({ mutationFn: () => api.cancelJob({}), onSuccess: (r) => { showResult(r.ok, r.error, "Operasi dibatalkan. Daya yang sudah terpakai tidak kembali."); refresh(); } });
  const complete = useMutation({
    mutationFn: () => api.completeExpedition({}),
    onSuccess: (r) => {
      showResult(r.ok, r.error, <>Ekspedisi tuntas! Bonus +{fmt(r.bonusKt)} KT. Warp ke Sektor {r.layer} — asteroid baru menanti.</>);
      if (r.ok) fireBurst("expedition");
      refresh();
    },
  });
  const abandon = useMutation({ mutationFn: () => api.abandonAsteroid({}), onSuccess: (r) => { showResult(r.ok, r.error, `Warp ke ${r.asteroidName ?? "asteroid baru"} di sektor yang sama.`); refresh(); } });
  const travel = useMutation({
    mutationFn: (zoneIndex: number) => api.travelToMap({ zoneIndex }),
    onSuccess: (r) => { showResult(r.ok, r.error, <>Perjalanan selesai — kamu tiba di peta {r.mapName}. Asteroid baru: {r.asteroidName}. Batu mulia &amp; tantangan peta ini sekarang berlaku.</>); if (r.ok) setTab("tambang"); refresh(); },
  });
  const orderPremium = useMutation({
    mutationFn: (plan: "standard" | "pro") => api.createPremiumOrder({ plan }),
    onSuccess: (r) => { showResult(r.ok, r.error, <>Pesanan Premium #{r.orderId ?? ""} dibuat — bayar <b>{fmt(r.stars)} Telegram Stars</b> ke pemilik di Telegram, lalu pemilik mengonfirmasi pesananmu dan Premium langsung aktif.</>); refresh(); },
  });
  const claimBonus = useMutation({ mutationFn: () => api.claimDailyBonus({}), onSuccess: (r) => { showResult(r.ok, r.error, `Bonus misi harian +${fmt(r.bonusKt)} KT masuk ke saldo!`); refresh(); } });
  const watchAd = useMutation({ mutationFn: () => api.watchAd({}), onSuccess: (r) => { showResult(r.ok, r.error, <>Iklan selesai — hadiah +{fmt(r.rewardKt)} KT masuk ke saldo! Sisa kuota iklan hari ini: {r.remainingToday}×.</>); if (r.ok) fireBurst("mine"); refresh(); } });
  const sellAll = useMutation({ mutationFn: () => api.sellAllOre({}), onSuccess: (r) => { showResult(r.ok, r.error, `Semua mineral terjual di Stasiun Orbital: +${fmt(r.ktGained)} KT.`); refresh(); } });
  const sellOne = useMutation({ mutationFn: (args: { oreId: string; qty: number }) => api.sellOre(args), onSuccess: (r) => { showResult(r.ok, r.error, `Terjual: +${fmt(r.ktGained)} KT.`); refresh(); } });
  const buy = useMutation({ mutationFn: (upgradeId: string) => api.buyUpgrade({ upgradeId }), onSuccess: (r) => { showResult(r.ok, r.error, `Upgrade terpasang (level ${r.newLevel ?? "?"}) seharga ${fmt(r.costPaid)} KT.`); refresh(); } });
  const cancelWd = useMutation({ mutationFn: (wdId: number) => api.cancelWithdrawal({ wdId }), onSuccess: (r) => { showResult(r.ok, r.error, "WD dibatalkan — KT dikembalikan ke saldo."); refresh(); } });

  if (state.isPending) return (<div className="min-h-screen bg-[var(--bg)] text-[var(--text)]"><SafeAreaTopScrim backgroundColor="var(--bg)" /><main className="mx-auto max-w-3xl px-4 py-16 text-center"><p className="font-display text-2xl tracking-widest">ASTRA MINING</p><p className="mt-2 text-sm text-[var(--dim)]">Menghubungkan ke stasiun orbital…</p></main></div>);
  if (state.error || !state.data) return (<div className="min-h-screen bg-[var(--bg)] text-[var(--text)]"><SafeAreaTopScrim backgroundColor="var(--bg)" /><main className="mx-auto max-w-3xl px-4 py-16 text-center"><p className="font-display text-xl">Sinyal stasiun terputus</p><p className="mt-2 text-sm text-[var(--dim)]">Koneksi ke server misi gagal. Coba muat ulang.</p><button type="button" onClick={() => state.refetch()} className="btn-press mt-4 rounded-xl bg-cyan-500 px-5 py-2 font-bold text-black">Coba Lagi</button></main></div>);

  const data = state.data; const p = data.player; const exp = data.expedition; const job = data.job;
  const pendingCount = data.withdrawals.filter((w) => w.status === "pending").length;
  const approvedCount = data.withdrawals.filter((w) => w.status === "approved").length;
  const pendingOrders = data.premiumOrders.filter((o) => o.status === "pending").length;
  const adminCount = pendingCount + approvedCount + pendingOrders;
  const totalOreQty = data.ores.reduce((a, o) => a + o.qty, 0);
  const ktToNextGram = p.ktBalance >= p.wdMinKt ? 0 : p.wdMinKt - p.ktBalance;
  const tabs: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "tambang", label: "Jelajah Asteroid", icon: <RocketIcon size={16} /> },
    { id: "peta", label: "Peta Tambang", icon: <MapIcon size={16} /> },
    { id: "pasar", label: "Stasiun Jual", icon: <SatelliteIcon size={16} />, badge: totalOreQty > 0 ? totalOreQty : undefined },
    { id: "upgrade", label: "Hanggar", icon: <WrenchIcon size={16} /> },
    { id: "wd", label: "WD GRAM", icon: <GemIcon size={16} /> },
    { id: "admin", label: "Kendali", icon: <DishIcon size={16} />, badge: adminCount > 0 ? adminCount : undefined },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] starfield">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      {burst && <ConfettiLayer burst={burst} />}
      {/* HERO REALISTIS */}
      <div className="relative overflow-hidden">
        <img src={heroImg} alt="Rig tambang raksasa mengebor permukaan asteroid di luar angkasa dengan Bumi terlihat di kejauhan" className="animate-hero-zoom h-[300px] w-full object-cover sm:h-[380px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050810] via-[#050810]/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-4 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300">Play-to-Earn • Jelajah Asteroid • Dapatkan GRAM</p>
          <h1 className="font-display title-shine mt-1 text-3xl font-black leading-none sm:text-5xl">ASTRA MINING</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-snug text-slate-200">Jelajahi asteroid satu per satu: <b>scan</b> komposisinya, <b>bor urat mineralnya</b> — setiap operasi butuh waktu nyata — jual hasilnya jadi <b>Kredit Tambang Antariksa (KT)</b>, lalu tarik jadi <b>GRAM</b> asli.</p>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-12">
        <section className="-mt-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--dim)]">Saldo Kredit Antariksa</p>
              <div className="mt-1 flex items-center gap-3">
                <img src={ktLogoImg} alt="Logo token KT — koin emas bertuliskan KT dikelilingi kristal dan asteroid dengan latar luar angkasa biru tua" className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/50" />
                <p className="font-display text-4xl leading-tight text-cyan-300"><span className={balanceGlow ? "balance-glow" : undefined}>{fmt(p.ktBalance)}</span> <span className="text-xl">KT</span></p>
              </div>
              <p className="text-sm text-[var(--dim)]">≈ {p.gramEquivalent.toLocaleString("id-ID", { maximumFractionDigits: 3 })} GRAM · {ktToNextGram > 0 ? `kurang ${fmt(ktToNextGram)} KT lagi untuk WD` : (<span className="inline-flex items-center gap-1 font-bold text-emerald-300"><CheckIcon size={14} /> sudah bisa WD!</span>)}</p>
              {p.premium.active ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300"><CrownIcon size={13} /> PREMIUM {p.premium.tier === "pro" ? "PRO · BOR GANDA" : "STANDARD"} AKTIF{p.premium.until ? ` — s/d ${new Date(p.premium.until).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : ""}</p>
              ) : (
                <button type="button" onClick={() => setTab("upgrade")} className="btn-press mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold text-amber-200"><CrownIcon size={13} /> Aktifkan Premium — bor lebih cepat, harga jual +15%</button>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--dim)]">Posisi Misi</p>
              <p className="font-display text-xl leading-tight">SEKTOR {p.layer}</p>
              <p className="text-sm text-[var(--dim)]">{fmt(p.depthMeters)} km dari Bumi</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs font-bold"><span className="inline-flex items-center gap-1"><ZapIcon size={13} /> Daya Kapal {p.energy}/{p.maxEnergy}</span><span className="text-[var(--dim)]">isi ulang 1 per {fmtDur(p.regenSeconds)}{p.energy < p.maxEnergy ? ` · penuh ±${fmtDur(p.regenSeconds * (p.maxEnergy - p.energy))}` : ""}</span></div>
            <div className="energy-shimmer mt-1 h-3 overflow-hidden rounded-full bg-[var(--surface2)]" role="progressbar" aria-valuenow={p.energy} aria-valuemin={0} aria-valuemax={p.maxEnergy} aria-label="Daya kapal"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-600 transition-all" style={{ width: `${p.maxEnergy ? (p.energy / p.maxEnergy) * 100 : 0}%` }} /></div>
          </div>
          {p.canClaimDailyBonus && (<button type="button" onClick={() => claimBonus.mutate()} disabled={claimBonus.isPending} className="btn-press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-400/10 px-4 py-2 font-bold text-cyan-200"><GiftIcon size={17} /> Klaim Bonus Misi Harian +{fmt(p.dailyBonusKt)} KT</button>)}
          <div className="mt-3">
            <button type="button" onClick={() => watchAd.mutate()} disabled={watchAd.isPending || !p.ads.canWatch} aria-label={`Tonton iklan sponsor dan dapatkan ${fmt(p.ads.rewardKt)} KT, sisa ${p.ads.remainingToday} dari ${p.ads.dailyCap} kali hari ini`} className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2.5 font-display text-sm text-black shadow-lg shadow-amber-500/20 disabled:opacity-40">
              <PlayIcon size={18} />
              {p.ads.remainingToday <= 0
                ? "Kuota Iklan Hari Ini Habis"
                : p.ads.cooldownRemainingSec > 0
                  ? `Iklan Berikutnya dalam ${p.ads.cooldownRemainingSec} dtk…`
                  : `Tonton Iklan — Dapat +${fmt(p.ads.rewardKt)} KT`}
            </button>
            <p className="mt-1.5 text-center text-xs text-[var(--dim)]">
              Slot iklan sponsor stasiun — penyedia iklan akan dipasang pemilik di tombol ini. Hadiah {fmt(p.ads.rewardKt)} KT per tontonan, maks {p.ads.dailyCap}× sehari ({p.ads.watchedToday}/{p.ads.dailyCap} terpakai), jeda {p.ads.cooldownSeconds} detik antar-iklan — semua batas dihitung &amp; divalidasi server.
            </p>
          </div>
        </section>

        <nav aria-label="Menu misi" className="sticky top-0 z-20 mt-4 grid grid-cols-3 gap-2 bg-[var(--bg)]/95 py-2 backdrop-blur">
          {tabs.map((t) => (<button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`btn-press relative inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-center text-[13px] font-bold leading-tight ${tab === t.id ? "bg-cyan-400 text-black" : "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]"}`}><span className="shrink-0">{t.icon}</span><span className="min-w-0">{t.label}</span>{t.badge != null && (<span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{t.badge}</span>)}</button>))}
        </nav>

        {banner && (<div key={bannerId} role="status" className={`banner-in mt-3 rounded-xl border px-4 py-3 text-sm font-semibold ${banner.kind === "good" ? "border-emerald-500/40 bg-emerald-500/15" : banner.kind === "bad" ? "border-red-500/40 bg-red-500/15" : "border-[var(--border)] bg-[var(--surface)]"}`}>{banner.text}</div>)}

        <div key={tab} className="tab-content">

        {tab === "tambang" && (
          <section className="mt-4 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="relative h-44 overflow-hidden">
                <img src={MAP_IMAGES[data.maps[exp.zoneIndex]?.image ?? "asteroid"] ?? asteroidImg} alt={`Pemandangan peta tambang ${exp.zoneName}`} className="animate-drift h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] to-transparent" />
                <div className="absolute bottom-2 left-4 right-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg leading-tight">{exp.name}</h2>
                      <p className="text-xs text-slate-300">{exp.klass} · ⌀ {exp.diameterKm.toLocaleString("id-ID")} km · {exp.zoneName}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-cyan-300 border border-cyan-500/40"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE FEED • CAM 04</span>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-[var(--dim)]">{p.zoneDesc}</p>
                {(() => { const cm = data.maps[exp.zoneIndex]; if (!cm) return null; const chips: ReactNode[] = [];
                  if (cm.jamChancePct > 0) chips.push(<span key="jam" className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-[11px] font-bold text-red-300"><AlertIcon size={12} /> Bor macet {cm.jamChancePct}%</span>);
                  if (cm.damageChancePct > 0) chips.push(<span key="dmg" className="inline-flex items-center gap-1 rounded-full border border-orange-400/40 bg-orange-400/10 px-2 py-0.5 text-[11px] font-bold text-orange-300"><ShieldIcon size={12} /> Risiko lambung {cm.damageChancePct}% · perbaikan {fmt(cm.damageFeeKt)} KT</span>);
                  if (cm.radiation > 0) chips.push(<span key="rad" className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[11px] font-bold text-violet-300"><RadiationIcon size={12} /> Radiasi +{cm.radiation} daya/operasi</span>);
                  if (cm.timeFactor > 1) chips.push(<span key="time" className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[11px] font-bold text-sky-300">Jarak jauh — scan &amp; bor {Math.round((cm.timeFactor - 1) * 100)}% lebih lama</span>);
                  return chips.length > 0 ? (<div className="mt-2 flex flex-wrap gap-1.5" aria-label="Tantangan peta aktif">{chips}</div>) : (<p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300"><ShieldIcon size={12} /> Peta aman — tanpa tantangan, cocok untuk pemula</p>);
                })()}
                {exp.scanned && (<p className="mt-2 text-sm font-bold">Urat tertambang: {exp.minedCount} dari {exp.veinCount}{exp.allMined ? " — asteroid ini sudah tandas." : ""}</p>)}

                {job ? (
                  <JobPanel job={job} dualDrill={p.premium.dualDrill} onCollect={() => collect.mutate()} collecting={collect.isPending} onCancel={() => cancelJob.mutate()} cancelling={cancelJob.isPending} onRefresh={refresh} />
                ) : !exp.scanned ? (
                  <div className="mt-4 rounded-xl border border-cyan-500/30 bg-[var(--surface2)] p-4">
                    <h3 className="font-display inline-flex items-center gap-2 text-sm"><span className="text-cyan-300"><TelescopeIcon size={17} /></span> Komposisi Belum Dipindai</h3>
                    <p className="mt-1 text-sm text-[var(--dim)]">Radar pasif menangkap pantulan dari <b className="text-[var(--text)]">{exp.veinCount} urat mineral</b>, tapi jenis dan jumlahnya belum diketahui. Jalankan scan spektrometer untuk membuka komposisi asteroid ini — tanpa scan, lengan bor tidak bisa dikunci ke urat mana pun.</p>
                    <button type="button" onClick={() => startScan.mutate()} disabled={startScan.isPending || p.energy < exp.scanEnergyCost} className="btn-press mt-3 w-full rounded-xl bg-cyan-400 px-4 py-3 font-display text-sm text-black disabled:opacity-40">
                      {p.energy < exp.scanEnergyCost ? `Daya kurang — scan butuh ${exp.scanEnergyCost} daya` : `Mulai Scan Spektrometer — ${exp.scanEnergyCost} daya • ±${fmtDur(exp.scanDurationSec)}`}
                    </button>
                    <p className="mt-2 text-xs text-[var(--dim)]">Scan adalah operasi berwaktu nyata yang dicatat di server misi — sengaja dibuat lama, dan klik berulang tidak mempercepatnya. Mau scan lebih cepat? Naikkan <b className="text-[var(--text)]">Spektrometer Inti</b> di Hanggar (−7% waktu scan per level).</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {exp.anomalyText && (<p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200"><span className="mt-0.5 shrink-0"><AlertIcon size={15} /></span> Anomali terdeteksi: {exp.anomalyText}</p>)}
                    <ul className="space-y-3">
                      {exp.veins.map((v) => {
                        const rare = RARE_ORE_IDS.has(v.oreId);
                        return (
                          <li key={v.index} className={`vein-tile rounded-xl border p-3 ${v.mined ? "border-[var(--border)] bg-black/30 opacity-70" : "border-cyan-500/25 bg-[var(--surface2)]"}`}>
                            <div className="flex items-start gap-3">
                              <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 ${v.mined ? "" : "ore-glow"} ${rare && !v.mined ? "crystal-shine" : ""}`} style={{ backgroundColor: v.color + "33" }}><OreIcon id={v.icon} color={v.color} size={26} /></span>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold leading-tight">{v.name} <span className="text-sm font-semibold text-[var(--dim)]">×{v.qty} unit</span></p>
                                <p className="mt-0.5 text-xs text-[var(--dim)]">
                                  Kekerasan batuan {"●".repeat(v.hardness)}{"○".repeat(4 - v.hardness)} · Kekayaan urat {v.richness}%{v.richness >= 85 ? " (urat kaya: +1 unit bonus)" : ""}
                                </p>
                                <p className="text-xs text-[var(--dim)]">Perkiraan nilai jual ≈ {fmt(v.qty * (data.ores.find((o) => o.id === v.oreId)?.sellPrice ?? 0))} KT</p>
                              </div>
                              {v.mined && (<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-bold text-emerald-300"><CheckIcon size={12} /> Sudah Ditambang</span>)}
                            </div>
                            {!v.mined && (
                              <button type="button" onClick={() => startMine.mutate(v.index)} disabled={startMine.isPending || p.energy < v.energyCost} aria-label={`Bor urat ${v.name}, butuh ${v.energyCost} daya dan waktu ${fmtDur(v.durationSec)}`} className="btn-press mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 font-bold text-black disabled:opacity-40">
                                <DrillIcon size={16} /> {p.energy < v.energyCost ? `Daya kurang — bor butuh ${v.energyCost} daya` : `Bor Urat Ini — ${v.energyCost} daya • ±${fmtDur(v.durationSec)}`}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {exp.allMined ? (
                      <button type="button" onClick={() => complete.mutate()} disabled={complete.isPending} className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-display text-sm text-black disabled:opacity-40"><RocketIcon size={16} /> Selesaikan Ekspedisi &amp; Warp ke Asteroid Berikutnya — Bonus +{fmt(exp.completionBonusKt)} KT</button>
                    ) : (
                      <p className="text-xs text-[var(--dim)]">Tambang semua urat untuk menyelesaikan ekspedisi dan menerima bonus {fmt(exp.completionBonusKt)} KT.</p>
                    )}
                  </div>
                )}

                {!job && (
                  <button type="button" onClick={() => abandon.mutate()} disabled={abandon.isPending || p.energy < exp.abandonEnergyCost} className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--dim)] disabled:opacity-40">
                    <SatelliteIcon size={15} /> Tinggalkan asteroid ini &amp; warp ke asteroid lain ({exp.abandonEnergyCost} daya, tanpa bonus)
                  </button>
                )}
                {p.energy < 5 && !job && (<p className="mt-3 text-sm font-bold text-red-300">Daya hampir habis — reaktor sedang mengisi ulang, 1 daya per {fmtDur(p.regenSeconds)}. Isi ulang memang sengaja lambat; naikkan Reaktor Fusi Mini di Hanggar untuk mempercepatnya, atau Tangki O₂ &amp; Baterai Surya untuk kapasitas yang lebih besar.</p>)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[{ label: "Operasi tambang selesai", value: fmt(p.totalDigs) }, { label: "Asteroid dituntaskan", value: fmt(p.asteroidsDone) }, { label: "GRAM sudah dibayar", value: fmt(p.totalWdPaidGram) }].map((s, i) => (<div key={s.label} className="animate-float-slow rounded-xl bg-[var(--surface)] border border-[var(--border)] px-2 py-3" style={{ animationDelay: `${i * 0.9}s` }}><p className="font-display text-lg">{s.value}</p><p className="text-[11px] font-semibold text-[var(--dim)]">{s.label}</p></div>))}
            </div>

            <details className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
              <summary className="font-display inline-flex cursor-pointer items-center gap-2 text-sm"><BookIcon size={15} /> Aturan Misi &amp; Ekonomi Antariksa</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                <li>Kapalmu mengorbit <strong>satu asteroid dalam satu waktu</strong>. Setiap asteroid punya komposisi urat mineral yang berbeda — tidak ada dua asteroid yang sama.</li>
                <li><strong>Scan dulu, baru bor.</strong> Scan spektrometer membuka jenis, jumlah, kekerasan, dan kekayaan tiap urat. Tanpa scan, urat tidak bisa dibor.</li>
                <li><strong>Semua operasi memakai waktu nyata.</strong> Scan butuh ±{fmtDur(exp.scanDurationSec)}, pengeboran urat butuh waktu sesuai kekerasan batuannya (urat keras &amp; besar = lebih lama). Waktu berjalan di server misi — klik berulang tidak mempercepat apa pun, dan operasi tetap selesai walau halaman ditutup.</li>
                <li>Satu operasi dalam satu waktu. Membatalkan operasi tidak mengembalikan daya yang sudah terpakai.</li>
                <li><strong>Daya kapal adalah rem utama ekonomi misi.</strong> Setiap scan &amp; bor memakai daya, dan isi ulangnya <strong>sengaja lambat: 1 daya per {fmtDur(p.regenSeconds)}</strong> (tangki penuh {p.maxEnergy} daya butuh ±{fmtDur(p.regenSeconds * p.maxEnergy)}). Jadi tidak ada yang bisa menambang tanpa henti — semua penambang dibatasi kecepatan isi ulang yang sama.</li>
                <li><strong>Bedakan dua upgrade daya di Hanggar.</strong> <strong>Tangki O₂ &amp; Baterai Surya</strong> menaikkan <em>kapasitas</em> (+6 daya maksimum per level): napas misi lebih panjang, lebih banyak operasi dalam satu sesi, dan daya yang terisi selama kamu pergi tidak terbuang karena tangki cepat penuh — tapi upgrade ini tidak mempercepat isi ulang. <strong>Reaktor Fusi Mini</strong> menaikkan <em>kecepatan</em> isi ulang (−10% waktu per level). Mau menunggu lebih singkat? Naikkan Reaktor. Mau sesi menambang lebih panjang? Naikkan Tangki.</li>
                <li>Jual mineral di Stasiun Orbital untuk mendapat <strong>Kredit Tambang Antariksa (KT)</strong>. KT dipakai untuk upgrade kapal &amp; alat di Hanggar, atau ditarik jadi GRAM.</li>
                <li>Tambang semua urat dalam satu asteroid untuk menyelesaikan ekspedisi: bonus KT + warp ke sektor yang lebih jauh, tempat mineral langka lebih sering muncul.</li>
                <li>Rasio tetap: <strong>1.000 KT = 1 GRAM</strong>, dan jumlah WD bergerak dalam kelipatan 500 KT (0,5 GRAM). <strong>Minimum WD naik bertahap:</strong> WD pertamamu cukup 500 KT (0,5 GRAM), tapi setiap WD yang berhasil dibayar menaikkan minimum berikutnya — 1.000 → 2.000 → 3.000 → 5.000 → sampai 10.000 KT. Minimum yang berlaku untukmu selalu dihitung server dari riwayat WD terbayarmu, dan tertulis di tab WD GRAM.</li>
                <li>WD diproses <strong>manual oleh pemilik misi</strong>. KT dikunci saat pengajuan, pemilik mengirim GRAM ke dompetmu lalu menandai Dibayar di Pusat Kendali.</li>
                <li>WD ditolak/dibatalkan = KT kembali utuh. <strong>Anti-cheat:</strong> semua saldo, waktu operasi, harga, dan minimum WD dihitung &amp; divalidasi di server misi — browser hanya mengirim perintah (scan, bor, jual, WD), tidak pernah menentukan hasilnya. Mengedit tampilan atau mengirim angka palsu dari browser tidak mengubah apa pun di server.</li>
                <li>Bonus ekspedisi tiap asteroid tuntas, dan bonus harian {fmt(p.dailyBonusKt)} KT sekali sehari — sengaja kecil, karena sumber KT utama memang hasil tambang, bukan bonus gratis.</li>
                <li><strong>Iklan sponsor:</strong> tombol Tonton Iklan di kartu saldo memberi +{fmt(p.ads.rewardKt)} KT per tontonan, dibatasi server maks {p.ads.dailyCap}× sehari dengan jeda {p.ads.cooldownSeconds} detik antar-iklan (maks {fmt(p.ads.rewardKt * p.ads.dailyCap)} KT/hari) — cukup untuk membantu, tidak cukup untuk menggantikan menambang.</li>
                <li><strong>Lima peta tambang</strong> terbuka bertahap mengikuti sektormu: Orbit Rendah (Sektor 1) → Sabuk Asteroid (3) → Bulan (6) → Psyche (10) → Sabuk Kuiper (15). Peta yang sudah terbuka bisa dikunjungi lagi kapan pun dari tab Peta Tambang (biaya perjalanan naik mengikuti jarak peta — {data.maps[0]?.travelCost ?? 4} daya untuk peta terdekat sampai {data.maps[4]?.travelCost ?? 12} daya untuk yang terjauh; gratis untuk Premium) — tapi asteroid yang sedang kamu tambang akan ditinggalkan tanpa bonus.</li>
                <li><strong>Setiap peta punya batu mulia khas</strong> yang tidak ditemukan di peta lain — dari Opal Pelangi &amp; Topaz Emas di Orbit Rendah sampai Opal Es Hitam &amp; Kristal Voidium di Sabuk Kuiper. Harga jualnya jauh di atas mineral biasa.</li>
                <li><strong>Semakin jauh peta, semakin lama semua operasi.</strong> Jarak dan kekerasan batuan membuat scan &amp; pengeboran di Sabuk Asteroid 30% lebih lama dari Orbit Rendah, di Bulan 60%, di Psyche 2× lipat, dan di Sabuk Kuiper 2,5× lipat — waktu pastinya tertulis di kartu setiap peta. <strong>Tantangan juga naik bersama peta.</strong> Peta pertama aman sepenuhnya. Peta berikutnya membawa risiko bor macet (urat hilang), serpihan yang merusak lambung kapal (biaya perbaikan KT), dan radiasi yang menguras daya ekstra. Persentase pastinya tertulis di kartu setiap peta — risiko diputuskan server saat pengeboran dimulai, bukan saat tombol ditekan.</li>
                <li><strong>Premium Pass</strong> (di Hanggar) dibayar dengan <strong>Telegram Stars</strong>: Standard (150 Stars / 7 hari) memberi regen daya 2× lebih cepat, scan &amp; bor 25% lebih cepat, harga jual +15%, dan perjalanan antar-peta gratis; Pro (500 Stars / 30 hari) menambahkan <strong>Bor Ganda</strong> — dua lengan bor bekerja bersamaan sehingga pengeboran 2× lebih cepat. Premium tidak mengubah rasio WD.</li>
              </ol>
            </details>

            {data.activity.length > 0 && (() => {
              const missionLog = data.activity.filter((a) => a.category === "mission").slice(0, 8);
              const economyLog = data.activity.filter((a) => a.category === "economy").slice(0, 8);
              const renderLog = (items: typeof data.activity) => items.length === 0
                ? (<p className="mt-2 text-sm text-[var(--dim)]">Belum ada catatan.</p>)
                : (<ul className="mt-2 space-y-2">{items.map((a) => (<li key={a.id} className="flex items-baseline justify-between gap-3 text-sm"><span>{a.message}{a.amountKt != null && (<span className={`ml-1.5 whitespace-nowrap font-bold ${a.amountKt >= 0 ? "text-emerald-300" : "text-red-300"}`}>{a.amountKt >= 0 ? "+" : ""}{fmt(a.amountKt)} KT</span>)}</span><span className="shrink-0 text-xs text-[var(--dim)]">{fmtDate(a.createdAt)}</span></li>))}</ul>);
              return (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
                    <h3 className="font-display inline-flex items-center gap-2 text-sm"><span className="text-cyan-300"><RocketIcon size={15} /></span> Log Misi</h3>
                    <p className="mt-0.5 text-xs text-[var(--dim)]">Scan, pengeboran, temuan langka, dan ekspedisi.</p>
                    {renderLog(missionLog)}
                  </div>
                  <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
                    <h3 className="font-display inline-flex items-center gap-2 text-sm"><span className="text-emerald-300"><GemIcon size={15} /></span> Log Ekonomi</h3>
                    <p className="mt-0.5 text-xs text-[var(--dim)]">Penjualan mineral, upgrade, bonus, iklan, Premium, dan WD.</p>
                    {renderLog(economyLog)}
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {tab === "peta" && (
          <PetaTab data={data} onTravel={(i) => travel.mutate(i)} travelling={travel.isPending} jobActive={job != null} onGoPremium={() => setTab("upgrade")} />
        )}

        {tab === "pasar" && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <img src={oresImg} alt="Kristal dan mineral berharga hasil tambang asteroid di nampan laboratorium stasiun luar angkasa" className="h-44 w-full object-cover" />
            <div className="p-4">
              <div className="flex items-center justify-between gap-3"><h2 className="font-display text-base">Stasiun Orbital — Jual Mineral</h2><button type="button" onClick={() => sellAll.mutate()} disabled={sellAll.isPending || totalOreQty === 0} className="btn-press rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-40">Jual Semua</button></div>
              <p className="mt-1 text-sm text-[var(--dim)]">Harga sudah termasuk bonus Negosiator Stasiun{p.premium.active ? " dan bonus Premium +15%" : ""}. Mineral terjual berubah jadi KT.</p>
              <ul className="mt-3 divide-y divide-[var(--border)]">{data.ores.map((o) => { const rare = RARE_ORE_IDS.has(o.id); return (<li key={o.id} className="flex items-center gap-3 py-3"><span aria-hidden="true" className={`ore-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 ${rare ? "crystal-shine" : ""}`} style={{ backgroundColor: o.color + "33" }}><OreIcon id={o.icon} color={o.color} size={24} /></span><div className="min-w-0 flex-1"><p className="font-bold leading-tight">{o.name}</p><p className="text-xs text-[var(--dim)]">{fmt(o.sellPrice)} KT/unit · di kargo {fmt(o.qty)}</p></div><p className="font-display text-sm">{fmt(o.sellPrice * o.qty)} KT</p><button type="button" onClick={() => sellOne.mutate({ oreId: o.id, qty: o.qty })} disabled={sellOne.isPending || o.qty === 0} aria-label={`Jual semua ${o.name}`} className="btn-press rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm font-bold disabled:opacity-40">Jual</button></li>); })}</ul>
              {totalOreQty === 0 && (<p className="py-4 text-center text-sm text-[var(--dim)]">Kargo kosong. Jelajahi asteroid di tab Jelajah Asteroid, lalu kembali ke sini untuk menjual.</p>)}
            </div>
          </section>
        )}

        {tab === "upgrade" && (
          <section className="mt-4 space-y-3">
            <PremiumCard data={data} onOrder={(plan) => orderPremium.mutate(plan)} ordering={orderPremium.isPending} />
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]"><img src={stationImg} alt="Astronot di dalam stasiun luar angkasa menyerahkan kontainer mineral ke lengan robot" className="h-40 w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4"><p className="text-sm font-semibold text-white">Hanggar Stasiun — KT yang dibelanjakan tidak bisa di-WD, tapi alat yang lebih canggih membuat scan &amp; bor jauh lebih cepat dan misimu lebih jauh.</p></div></div>
            {data.upgrades.map((u) => (<div key={u.id} className="vein-tile rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface2)]"><UpgradeIcon id={u.id} size={22} /></span><div><h3 className="font-display text-sm">{u.name}</h3><p className="mt-1 text-sm text-[var(--dim)]">{u.desc}</p><div className="mt-2 flex gap-1" aria-label={`Level ${u.level} dari ${u.maxLevel}`}>{Array.from({ length: u.maxLevel }, (_, i) => (<span key={i} className={`h-2 w-4 rounded-full ${i < u.level ? "bg-cyan-400" : "bg-[var(--surface2)]"}`} />))}</div></div></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-[var(--dim)]">Level</p><p className="font-display text-xl">{u.level}<span className="text-sm text-[var(--dim)]">/{u.maxLevel}</span></p></div></div>{u.nextCost != null ? (<button type="button" onClick={() => buy.mutate(u.id)} disabled={buy.isPending || p.ktBalance < u.nextCost} aria-label={`Beli ${u.name} level ${u.level + 1} seharga ${fmt(u.nextCost)} KT`} className="btn-press mt-3 w-full rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black disabled:opacity-40">{p.ktBalance < u.nextCost ? `Butuh ${fmt(u.nextCost)} KT — saldo kurang` : `Pasang Upgrade — ${fmt(u.nextCost)} KT`}</button>) : (<p className="mt-3 rounded-xl bg-[var(--surface2)] px-4 py-2 text-center font-bold">Level Maksimum</p>)}</div>))}
          </section>
        )}

        {tab === "wd" && (<WdTab data={data} onCancel={(id) => cancelWd.mutate(id)} cancelling={cancelWd.isPending} onDone={(ok, err, good) => { showResult(ok, err, good); refresh(); }} />)}
        {tab === "admin" && (<AdminTab data={data} onDone={(ok, err, good) => { showResult(ok, err, good); refresh(); }} />)}
        </div>
      </main>
    </div>
  );
}

function PremiumCard({ data, onOrder, ordering }: { data: GameState; onOrder: (plan: "standard" | "pro") => void; ordering: boolean }) {
  const p = data.player;
  const pendingOrder = data.premiumOrders.find((o) => o.status === "pending");
  const benefits = [
    "Regen daya 2× lebih cepat — lebih sedikit menunggu, lebih banyak menambang",
    "Scan & pengeboran 25% lebih cepat di semua peta",
    "Harga jual semua mineral & batu mulia +15% di Stasiun Orbital",
    "Perjalanan antar-peta gratis, tanpa biaya daya",
  ];
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-400/15 to-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display inline-flex items-center gap-2 text-base text-amber-300"><CrownIcon size={19} /> Premium Pass</h3>
          <p className="mt-1 text-sm text-[var(--dim)]">Lisensi penambang prioritas stasiun orbital, dibayar dengan <b className="text-amber-200">Telegram Stars</b> — mata uang resmi Telegram, tempat game ini diluncurkan. Premium mempercepat semua yang kamu lakukan — tanpa mengubah rasio WD 1.000 KT = 1 GRAM.</p>
        </div>
        {p.premium.active && (<span className="shrink-0 rounded-full border border-amber-400/60 bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-200">{p.premium.tier === "pro" ? "PRO" : "STANDARD"} AKTIF{p.premium.until ? ` s/d ${new Date(p.premium.until).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : ""}</span>)}
      </div>
      <ul className="mt-3 space-y-1.5">
        {benefits.map((b) => (<li key={b} className="flex items-start gap-2 text-sm"><span className="mt-0.5 shrink-0 text-amber-300"><CheckIcon size={14} /></span>{b}</li>))}
        <li className="flex items-start gap-2 text-sm"><span className="mt-0.5 shrink-0 text-amber-300"><DrillIcon size={14} /></span><span><b className="text-amber-200">Khusus Pro — Bor Ganda:</b> dua lengan bor bekerja bersamaan, waktu pengeboran setiap urat jadi 2× lebih cepat.</span></li>
      </ul>
      {pendingOrder ? (
        <div className="mt-4 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3">
          <p className="font-display text-sm text-amber-200">Pesanan #{pendingOrder.id} — Premium {pendingOrder.tier === "pro" ? "Pro" : "Standard"} · {fmt(pendingOrder.stars)} Stars</p>
          <p className="mt-1 text-sm text-[var(--dim)]">Status: <b className="text-amber-300">menunggu pembayaran &amp; konfirmasi pemilik</b>. Bayar {fmt(pendingOrder.stars)} Telegram Stars ke pemilik di Telegram (kirim tangkapan layar bukti bayar + nomor pesanan #{pendingOrder.id}), lalu pemilik mengonfirmasinya dari Pusat Kendali dan Premium-mu langsung aktif.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {p.premium.plans.map((plan) => (
            <button key={plan.id} type="button" onClick={() => onOrder(plan.id as "standard" | "pro")} disabled={ordering} aria-label={`Pesan Premium ${plan.label} seharga ${fmt(plan.stars)} Telegram Stars`} className={`btn-press rounded-xl px-3 py-3 text-black disabled:opacity-40 ${plan.tier === "pro" ? "bg-gradient-to-b from-amber-300 to-amber-500 ring-2 ring-amber-200/60" : "bg-amber-400"}`}>
              <span className="block font-display text-sm">{plan.tier === "pro" ? "PRO" : "STANDARD"} · {plan.days} hari</span>
              <span className="mt-0.5 flex items-center justify-center gap-1 text-sm font-bold"><SparkleIcon size={14} /> {fmt(plan.stars)} Telegram Stars</span>
              <span className="block text-xs font-semibold">{plan.tier === "pro" ? "Semua benefit Standard + BOR GANDA" : "Regen 2× · operasi 25% lebih cepat · jual +15%"}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--dim)]">Cara beli: tekan paketnya untuk membuat pesanan, bayar Stars-nya ke pemilik lewat Telegram, dan pemilik mengaktifkan Premium-mu setelah pembayaran terkonfirmasi. Premium tidak bisa dibeli pakai KT — KT murni untuk upgrade kapal dan WD GRAM.</p>
    </div>
  );
}

function PetaTab({ data, onTravel, travelling, jobActive, onGoPremium }: { data: GameState; onTravel: (index: number) => void; travelling: boolean; jobActive: boolean; onGoPremium: () => void }) {
  const p = data.player;
  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
        <h2 className="font-display text-base">Bagan Navigasi — Lima Peta Tambang</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">Setiap peta punya batu mulia khas dan tantangannya sendiri. Peta terbuka mengikuti sektormu (sekarang <b className="text-[var(--text)]">Sektor {p.layer}</b>); pindah peta meninggalkan asteroid yang sedang kamu tambang tanpa bonus. Ingat: <b className="text-[var(--text)]">semakin jauh petanya, semakin lama scan &amp; pengeborannya</b> — tapi batu mulianya juga semakin mahal.</p>
        {jobActive && (<p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200"><span className="mt-0.5 shrink-0"><AlertIcon size={15} /></span> Ada operasi yang sedang berjalan — selesaikan atau batalkan dulu sebelum pindah peta.</p>)}
      </div>
      {data.maps.map((m) => {
        const img = MAP_IMAGES[m.image] ?? asteroidImg;
        return (
          <article key={m.index} className={`vein-tile overflow-hidden rounded-2xl border bg-[var(--surface)] ${m.isCurrent ? "border-cyan-400/70" : "border-[var(--border)]"}`}>
            <div className="relative h-36 overflow-hidden">
              <img src={img} alt={`Pemandangan peta ${m.name}`} className={`h-full w-full object-cover ${m.unlocked ? "" : "opacity-50 saturate-50"}`} loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent" />
              <div className="absolute bottom-2 left-4 right-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Peta {m.index + 1} · {m.tagline}</p>
                  <h3 className="font-display text-base leading-tight">{m.name}</h3>
                </div>
                {m.isCurrent ? (
                  <span className="shrink-0 rounded-full border border-cyan-400/60 bg-cyan-400/20 px-2.5 py-1 text-[11px] font-bold text-cyan-200">SEDANG DITAMBANG</span>
                ) : !m.unlocked ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-400/50 bg-black/60 px-2.5 py-1 text-[11px] font-bold text-slate-300"><LockIcon size={12} /> Sektor {m.minLayer}</span>
                ) : null}
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-[var(--dim)]">{m.desc}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[11px] font-bold text-sky-200"><SatelliteIcon size={12} /> {m.distanceLabel} · scan ±{fmtDur(m.scanSeconds)}</p>
              <h4 className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Mineral &amp; batu mulia di peta ini</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {m.gems.map((g) => (
                  <li key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface2)] py-1 pl-1.5 pr-2.5 text-xs font-semibold">
                    <OreIcon id={g.icon} color={g.color} size={16} /> {g.name} <span className="text-[var(--dim)]">· {fmt(g.price)} KT</span>
                  </li>
                ))}
              </ul>
              <h4 className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Tantangan peta</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {m.jamChancePct === 0 && m.damageChancePct === 0 && m.radiation === 0 && m.timeFactor <= 1 ? (
                  <li className="flex items-center gap-2 text-emerald-300"><ShieldIcon size={14} /> Aman — tanpa risiko bor macet, kerusakan lambung, atau radiasi. Scan tercepat (±{fmtDur(m.scanSeconds)}). Peta belajar terbaik.</li>
                ) : (
                  <>
                    {m.jamChancePct > 0 && (<li className="flex items-center gap-2"><span className="text-red-300"><AlertIcon size={14} /></span> Bor macet {m.jamChancePct}% per pengeboran — urat yang sedang dibor hilang tanpa hasil.</li>)}
                    {m.damageChancePct > 0 && (<li className="flex items-center gap-2"><span className="text-orange-300"><ShieldIcon size={14} /></span> Lambung terkena serpihan {m.damageChancePct}% — biaya perbaikan {fmt(m.damageFeeKt)} KT dipotong dari saldo.</li>)}
                    {m.radiation > 0 && (<li className="flex items-center gap-2"><span className="text-violet-300"><RadiationIcon size={14} /></span> Radiasi +{m.radiation} daya untuk setiap scan &amp; pengeboran.</li>)}
                    {m.timeFactor > 1 && (<li className="flex items-center gap-2"><span className="text-sky-300"><DrillIcon size={14} /></span> Jarak jauh &amp; batuan keras — scan ±{fmtDur(m.scanSeconds)} dan semua operasi {Math.round((m.timeFactor - 1) * 100)}% lebih lama dari peta pertama.</li>)}
                  </>
                )}
              </ul>
              {!m.isCurrent && (
                m.unlocked ? (
                  <button type="button" onClick={() => onTravel(m.index)} disabled={travelling || jobActive || p.energy < m.travelCost} aria-label={`Terbang ke peta ${m.name}`} className="btn-press mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 font-bold text-black disabled:opacity-40">
                    <RocketIcon size={16} /> {jobActive ? "Operasi sedang berjalan — tidak bisa pindah" : p.energy < m.travelCost ? `Daya kurang — perjalanan butuh ${m.travelCost} daya` : m.travelCost === 0 ? "Terbang ke Peta Ini — Gratis (Premium)" : `Terbang ke Peta Ini — ${m.travelCost} daya`}
                  </button>
                ) : (
                  <p className="mt-4 rounded-xl bg-[var(--surface2)] px-4 py-2.5 text-center text-sm font-bold text-[var(--dim)]">Terkunci — selesaikan ekspedisi sampai Sektor {m.minLayer} untuk membuka peta ini</p>
                )
              )}
            </div>
          </article>
        );
      })}
      {!p.premium.active && (
        <button type="button" onClick={onGoPremium} className="btn-press flex w-full items-center gap-3 rounded-2xl border-2 border-amber-400/50 bg-amber-400/10 p-4 text-left">
          <span className="text-amber-300"><CrownIcon size={26} /></span>
          <span><span className="block font-display text-sm text-amber-200">Premium Pass — perjalanan antar-peta GRATIS</span><span className="block text-sm text-[var(--dim)]">Plus regen daya 2× lebih cepat, operasi 25% lebih cepat, dan harga jual +15%. Lihat di Hanggar.</span></span>
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
    ? (<span className="inline-flex items-center gap-2"><span className="text-emerald-300"><CheckIcon size={16} /></span> Operasi Selesai!</span>)
    : isScan
      ? (<span className="inline-flex items-center gap-2"><span className="text-cyan-300"><TelescopeIcon size={16} /></span> Spektrometer sedang memindai asteroid…</span>)
      : (<span className="inline-flex items-center gap-2"><span className="text-amber-300"><DrillIcon size={16} /></span> {dualDrill ? "Dua lengan bor (BOR GANDA)" : "Lengan bor"} sedang mengebor urat {job.oreName ?? "mineral"}…</span>);
  const sparks = [
    { left: "18%", top: "62%", sx: "-16px", sy: "12px", delay: "0s" },
    { left: "30%", top: "70%", sx: "-8px", sy: "18px", delay: "0.28s" },
    { left: "24%", top: "78%", sx: "-20px", sy: "8px", delay: "0.55s" },
  ];
  return (
    <div className="mt-4 rounded-xl border border-cyan-500/30 bg-[var(--surface2)] p-4" role="status" aria-label="Operasi sedang berjalan">
      <div className="flex items-center gap-4">
        {!ready && isScan && (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-cyan-400/50 bg-[#04121f]" aria-hidden="true">
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
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-400/40 bg-[#170f04]" aria-hidden="true">
            {dualDrill ? (
              <>
                <span className="drill-working absolute left-[16%] top-[24%] text-amber-300"><DrillIcon size={34} /></span>
                <span className="drill-working absolute bottom-[16%] right-[14%] text-amber-200" style={{ animationDelay: "0.11s" }}><DrillIcon size={34} /></span>
              </>
            ) : (
              <span className="drill-working text-amber-300"><DrillIcon size={44} /></span>
            )}
            {sparks.map((s, i) => (
              <span key={i} className="spark" style={{ left: s.left, top: s.top, animationDelay: s.delay, "--sx": s.sx, "--sy": s.sy } as CSSProperties} />
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm">{title}</h3>
          {!ready && (<p className="mt-1 text-sm font-bold">Sisa waktu: {fmtDur(remaining)}</p>)}
          <p className="mt-1 text-xs text-[var(--dim)]">{ready
            ? (isScan
              ? "Hasil scan sudah siap — buka komposisi urat mineral asteroid ini."
              : job.jammed
                ? "Ada yang tidak beres — suara bor berhenti mendadak di tengah jalan. Ambil laporannya untuk melihat apa yang terjadi."
                : job.hullHit
                  ? "Pengeboran selesai, tapi teknisi melaporkan lambung kapal terkena serpihan selama operasi. Ambil hasil tambang dan laporan perbaikannya."
                  : "Pengeboran selesai — ambil hasil tambangnya ke kargo.")
            : "Operasi ini berjalan dengan waktu nyata di server misi. Kamu boleh menutup halaman ini — alat tetap bekerja dan hasilnya bisa diambil saat kamu kembali."}</p>
        </div>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan operasi">
        <div className={`h-full rounded-full transition-all ${ready ? "bg-emerald-400" : "job-working"}`} style={{ width: `${ready ? 100 : progress}%` }} />
      </div>
      {ready ? (
        <button type="button" onClick={onCollect} disabled={collecting} className="btn-press collect-pop mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 font-display text-sm text-black disabled:opacity-40">{isScan ? "Buka Hasil Scan" : "Ambil Hasil Tambang"}</button>
      ) : (
        <button type="button" onClick={onCancel} disabled={cancelling} className="btn-press mt-3 rounded-xl border border-red-400 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40">Batalkan Operasi</button>
      )}
    </div>
  );
}

function WdTab({ data, onCancel, cancelling, onDone }: { data: GameState; onCancel: (id: number) => void; cancelling: boolean; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const p = data.player; const [wallet, setWallet] = useState(""); const [gram, setGram] = useState(p.wdMinGram);
  const ktCost = Math.round(gram * p.ktPerGram); const enough = p.ktBalance >= ktCost;
  const belowMin = ktCost < p.wdMinKt; const offStep = ktCost % p.wdStepKt !== 0;
  const request = useMutation({ mutationFn: () => api.requestWithdrawal({ walletAddress: wallet.trim(), amountKt: ktCost }), onSuccess: (r) => { if (r.ok) setWallet(""); onDone(r.ok, r.error, `Permintaan WD #${r.wdId ?? ""} terkirim — ${fmt(ktCost)} KT dikunci dan masuk antrean Pusat Kendali.`); } });
  return (
    <section className="mt-4 space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"><img src={stationImg} alt="Interior stasiun luar angkasa tempat penukaran mineral" className="h-36 w-full object-cover" /><div className="p-4">
        <div className="flex items-center gap-3">
          <img src={ktLogoImg} alt="Logo token KT — koin emas bertuliskan KT" className="h-12 w-12 shrink-0 rounded-xl object-cover ring-2 ring-amber-400/50" />
          <div>
            <h2 className="font-display text-base leading-tight">Tarik KT jadi GRAM</h2>
            <p className="text-xs text-[var(--dim)]">Token resmi misi: Kredit Tambang Antariksa (KT)</p>
          </div>
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed"><li>Rasio tetap <strong>1.000 KT = 1 GRAM</strong>, jumlah WD dalam kelipatan 0,5 GRAM (500 KT).</li><li><strong>Minimum WD naik bertahap:</strong> minimum WD pertamamu hanya <strong>{fmt(p.wdMinGram)} GRAM ({fmt(p.wdMinKt)} KT)</strong>{p.wdPaidCount > 0 ? (<> — kamu sudah {p.wdPaidCount}× WD terbayar, dan setelah WD ini dibayar minimum berikutnya jadi {fmt(p.wdNextMinKt)} KT</>) : (<> — setelah WD ini dibayar, minimum berikutnya naik jadi {fmt(p.wdNextMinKt)} KT, dan terus naik di setiap WD yang terbayar</>)}. Minimum dihitung server dari riwayat WD-mu, tidak bisa diturunkan dari browser.</li><li>Isi alamat dompet GRAM (TON) dan jumlah GRAM. KT langsung dikunci.</li><li>Permintaan masuk ke Pusat Kendali — pemilik mengirim GRAM <strong>secara manual</strong> ke dompetmu.</li><li>Status jadi Dibayar setelah pemilik mengirim &amp; mencatat referensi transaksi. Ditolak = KT kembali utuh.</li></ol>
        <div className="mt-4"><div className="flex justify-between text-xs font-bold"><span>Progres menuju WD ({fmt(p.wdMinGram)} GRAM)</span><span className="text-[var(--dim)]">{fmt(Math.min(p.ktBalance, p.wdMinKt))} / {fmt(p.wdMinKt)} KT</span></div><div className="mt-1 h-3 overflow-hidden rounded-full bg-[var(--surface2)]"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, (p.ktBalance / p.wdMinKt) * 100)}%` }} /></div></div>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
          <div><label htmlFor="wallet" className="text-sm font-bold">Alamat dompet GRAM (TON)</label><input id="wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Contoh: UQ… atau EQ…" autoComplete="off" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm" /></div>
          <div><label htmlFor="gram" className="text-sm font-bold">Jumlah GRAM (kelipatan 0,5)</label><input id="gram" type="number" min={p.wdMinGram} step={0.5} value={gram} onChange={(e) => setGram(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2" /><p className="mt-1 text-xs text-[var(--dim)]">Biaya: {fmt(ktCost)} KT · saldo kamu {fmt(p.ktBalance)} KT · minimum saat ini {fmt(p.wdMinGram)} GRAM</p>{belowMin && (<p className="mt-1 text-xs font-bold text-red-300">Di bawah minimum WD saat ini ({fmt(p.wdMinGram)} GRAM / {fmt(p.wdMinKt)} KT).</p>)}{!belowMin && offStep && (<p className="mt-1 text-xs font-bold text-red-300">Jumlah harus kelipatan 0,5 GRAM (500 KT).</p>)}</div>
          <button type="submit" disabled={request.isPending || wallet.trim().length < 10 || !enough || belowMin || offStep} className="btn-press w-full rounded-xl bg-cyan-400 px-4 py-3 font-display text-sm text-black disabled:opacity-40">{belowMin || offStep ? "Periksa jumlah WD dulu" : !enough ? `Saldo kurang ${fmt(ktCost - p.ktBalance)} KT lagi` : `Ajukan WD ${fmt(gram)} GRAM`}</button>
          {wallet.trim().length > 0 && wallet.trim().length < 10 && (<p className="text-xs font-bold text-red-300">Alamat dompet terlalu pendek — periksa lagi.</p>)}
        </form>
      </div></div>
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4"><h3 className="font-display text-sm">Riwayat WD Saya</h3>{data.withdrawals.length === 0 ? (<p className="mt-2 text-sm text-[var(--dim)]">Belum ada permintaan WD. Kumpulkan {fmt(p.wdMinKt)} KT untuk WD pertamamu ({fmt(p.wdMinGram)} GRAM).</p>) : (<ul className="mt-3 space-y-3">{data.withdrawals.map((w) => (<li key={w.id} className="rounded-xl bg-[var(--surface2)] p-3"><div className="flex items-center justify-between gap-2"><p className="font-display text-sm">#{w.id} · {fmt(w.amountGram)} GRAM</p><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(w.status)}`}>{STATUS_LABEL[w.status]}</span></div><p className="mt-1 break-all font-mono text-xs text-[var(--dim)]">{w.walletAddress}</p><p className="mt-1 text-xs text-[var(--dim)]">{fmt(w.amountKt)} KT · diajukan {fmtDate(w.createdAt)}{w.processedAt ? ` · diproses ${fmtDate(w.processedAt)}` : ""}</p>{w.adminNote && <p className="mt-1 text-xs">Catatan pemilik: {w.adminNote}</p>}{w.txRef && <p className="mt-1 break-all font-mono text-xs">Ref: {w.txRef}</p>}{w.status === "pending" && (<button type="button" onClick={() => onCancel(w.id)} disabled={cancelling} aria-label={`Batalkan WD nomor ${w.id}`} className="btn-press mt-2 rounded-lg border border-red-400 px-3 py-1.5 text-sm font-bold text-red-300">Batalkan &amp; Kembalikan KT</button>)}</li>))}</ul>)}</div>
    </section>
  );
}

function GrantPremiumCard({ data, onDone }: { data: GameState; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const [days, setDays] = useState(30);
  const [tier, setTier] = useState<"standard" | "pro">("pro");
  const grant = useMutation({
    mutationFn: () => api.grantPremium({ days, tier }),
    onSuccess: (r) => onDone(r.ok, r.error, `Premium ${tier === "pro" ? "Pro (bor ganda)" : "Standard"} ${days} hari diaktifkan — berlaku sampai ${r.premiumUntil ? new Date(r.premiumUntil).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : ""}.`),
  });
  const confirm = useMutation({
    mutationFn: (orderId: number) => api.confirmPremiumOrder({ orderId }),
    onSuccess: (r) => onDone(r.ok, r.error, `Pesanan Stars terkonfirmasi — Premium aktif sampai ${r.premiumUntil ? new Date(r.premiumUntil).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : ""}.`),
  });
  const reject = useMutation({
    mutationFn: (orderId: number) => api.rejectPremiumOrder({ orderId }),
    onSuccess: (r) => onDone(r.ok, r.error, "Pesanan Premium ditolak — pemain bisa membuat pesanan baru."),
  });
  const p = data.player;
  const pendingOrders = data.premiumOrders.filter((o) => o.status === "pending");
  const pastOrders = data.premiumOrders.filter((o) => o.status !== "pending").slice(0, 5);
  return (
    <div className="rounded-2xl border-2 border-amber-400/50 bg-[var(--surface)] p-4">
      <h3 className="font-display inline-flex items-center gap-2 text-sm text-amber-300"><CrownIcon size={16} /> Monetisasi — Premium via Telegram Stars</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">Premium dijual dengan <b className="text-[var(--text)]">Telegram Stars</b>: pemain membuat pesanan di Hanggar, membayar Stars ke kamu di Telegram, lalu kamu konfirmasi pesanannya di bawah ini — Premium langsung aktif. Tier <b className="text-[var(--text)]">Pro</b> membuka Bor Ganda (pengeboran 2× lebih cepat).</p>
      <p className="mt-2 text-sm">Status pemain saat ini: {p.premium.active ? (<b className="text-amber-300">PREMIUM {p.premium.tier === "pro" ? "PRO" : "STANDARD"} aktif{p.premium.until ? ` sampai ${new Date(p.premium.until).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}` : ""}</b>) : (<b>Pemain gratis (belum Premium)</b>)}</p>

      <h4 className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Pesanan Stars menunggu konfirmasi</h4>
      {pendingOrders.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--dim)]">Belum ada pesanan menunggu. Pesanan baru muncul di sini begitu pemain menekan paket Premium di Hanggar.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {pendingOrders.map((o) => (
            <li key={o.id} className="rounded-xl bg-[var(--surface2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm">#{o.id} · Premium {o.tier === "pro" ? "Pro" : "Standard"} · {o.days} hari</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-200"><SparkleIcon size={11} /> {fmt(o.stars)} Stars</span>
              </div>
              <p className="mt-1 text-xs text-[var(--dim)]">Dibuat {fmtDate(o.createdAt)} · pastikan {fmt(o.stars)} Stars dari pemain ini sudah masuk di Telegram sebelum konfirmasi.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => confirm.mutate(o.id)} disabled={confirm.isPending} aria-label={`Konfirmasi pesanan Premium nomor ${o.id} dan aktifkan Premium`} className="btn-press rounded-xl bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40">Stars Masuk — Aktifkan Premium</button>
                <button type="button" onClick={() => reject.mutate(o.id)} disabled={reject.isPending} aria-label={`Tolak pesanan Premium nomor ${o.id}`} className="btn-press rounded-xl border border-red-400 px-4 py-2 font-bold text-red-300 disabled:opacity-40">Tolak Pesanan</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pastOrders.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--dim)]">
          {pastOrders.map((o) => (<li key={o.id}>#{o.id} · {o.tier === "pro" ? "Pro" : "Standard"} · {fmt(o.stars)} Stars — {o.status === "confirmed" ? "terkonfirmasi" : "ditolak"}{o.processedAt ? ` · ${fmtDate(o.processedAt)}` : ""}</li>))}
        </ul>
      )}

      <h4 className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[var(--dim)]">Aktifkan manual (pembayaran di luar alur pesanan)</h4>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); grant.mutate(); }}>
        <div>
          <label htmlFor="grant-tier" className="text-xs font-bold">Tier</label>
          <select id="grant-tier" value={tier} onChange={(e) => setTier(e.target.value as "standard" | "pro")} className="mt-1 block rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
            <option value="standard">Standard</option>
            <option value="pro">Pro — Bor Ganda</option>
          </select>
        </div>
        <div>
          <label htmlFor="grant-days" className="text-xs font-bold">Durasi (hari)</label>
          <input id="grant-days" type="number" min={1} max={365} step={1} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Math.floor(Number(e.target.value) || 1))))} className="mt-1 w-28 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2" />
        </div>
        <button type="submit" disabled={grant.isPending} className="btn-press rounded-xl bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40">{p.premium.active ? "Perpanjang Premium" : "Aktifkan Premium"}</button>
      </form>
      <p className="mt-2 text-xs text-[var(--dim)]">Mengaktifkan saat Premium masih berjalan menambah durasinya dari tanggal berakhir saat ini; mengaktifkan Pro tidak pernah menurunkan tier yang sedang aktif.</p>
    </div>
  );
}

function AdminTab({ data, onDone }: { data: GameState; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const order: Record<Wd["status"], number> = { pending: 0, approved: 1, paid: 2, rejected: 3, cancelled: 4 };
  const queue = [...data.withdrawals].sort((a, b) => order[a.status] - order[b.status] || b.id - a.id);
  const lockedKt = data.withdrawals.filter((w) => w.status === "pending" || w.status === "approved").reduce((a, w) => a + w.amountKt, 0);
  const owedGram = data.withdrawals.filter((w) => w.status === "approved").reduce((a, w) => a + w.amountGram, 0);
  return (<section className="mt-4 space-y-4"><GrantPremiumCard data={data} onDone={onDone} /><div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4"><h2 className="font-display text-base">Pusat Kendali — Antrean WD Pemilik</h2><p className="mt-1 text-sm text-[var(--dim)]">Alur manual: periksa dompet → Setujui → kirim GRAM dari dompetmu sendiri → Tandai Dibayar (isi referensi transaksi). Tolak bila alamat tidak valid; KT pemain kembali otomatis.</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[var(--surface2)] px-2 py-3"><p className="font-display text-base">{fmt(lockedKt)} KT</p><p className="text-[11px] font-semibold text-[var(--dim)]">KT terkunci</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-3"><p className="font-display text-base">{fmt(owedGram)} GRAM</p><p className="text-[11px] font-semibold text-[var(--dim)]">Siap kirim</p></div><div className="rounded-xl bg-[var(--surface2)] px-2 py-3"><p className="font-display text-base">{fmt(data.player.totalWdPaidGram)} GRAM</p><p className="text-[11px] font-semibold text-[var(--dim)]">Sudah dibayar</p></div></div></div>{queue.length === 0 ? (<p className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 text-sm text-[var(--dim)]">Antrean kosong — belum ada penambang yang mengajukan WD.</p>) : (queue.map((w) => <AdminWdCard key={w.id} wd={w} onDone={onDone} />))}</section>);
}

function AdminWdCard({ wd, onDone }: { wd: Wd; onDone: (ok: boolean, error: string | null, good: string) => void }) {
  const [note, setNote] = useState(""); const [txRef, setTxRef] = useState("");
  const act = useMutation({ mutationFn: async (action: "approve" | "reject" | "pay") => await api.updateWithdrawal({ wdId: wd.id, action, adminNote: note.trim() ? note.trim() : undefined, txRef: txRef.trim() ? txRef.trim() : undefined }), onSuccess: (r, action) => { const good = action === "approve" ? `WD #${wd.id} disetujui. Kirim ${fmt(wd.amountGram)} GRAM ke dompet pemain, lalu tandai Dibayar.` : action === "pay" ? `WD #${wd.id} ditandai Dibayar. Selesai!` : `WD #${wd.id} ditolak — KT pemain sudah dikembalikan.`; onDone(r.ok, r.error, good); } });
  return (<div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4"><div className="flex items-center justify-between gap-2"><p className="font-display text-base">#{wd.id} · {fmt(wd.amountGram)} GRAM</p><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(wd.status)}`}>{STATUS_LABEL[wd.status]}</span></div><p className="mt-1 text-sm text-[var(--dim)]">{fmt(wd.amountKt)} KT terkunci · diajukan {fmtDate(wd.createdAt)}</p><p className="mt-2 break-all rounded-lg bg-[var(--surface2)] px-3 py-2 font-mono text-xs">{wd.walletAddress}</p>{wd.adminNote && <p className="mt-2 text-sm">Catatan: {wd.adminNote}</p>}{wd.txRef && <p className="mt-1 break-all font-mono text-xs text-[var(--dim)]">Ref: {wd.txRef}</p>}{(wd.status === "pending" || wd.status === "approved") && (<div className="mt-3 space-y-2"><div><label htmlFor={`note-${wd.id}`} className="text-xs font-bold">Catatan admin (opsional)</label><input id={`note-${wd.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. alamat valid, diproses malam ini" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm" /></div>{wd.status === "approved" && (<div><label htmlFor={`tx-${wd.id}`} className="text-xs font-bold">Referensi transaksi GRAM</label><input id={`tx-${wd.id}`} value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="Tempel hash transaksi setelah GRAM terkirim" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm" /></div>)}<div className="flex flex-wrap gap-2">{wd.status === "pending" && (<button type="button" onClick={() => act.mutate("approve")} disabled={act.isPending} aria-label={`Setujui WD nomor ${wd.id}`} className="btn-press rounded-xl bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-40">Setujui</button>)}{wd.status === "approved" && (<button type="button" onClick={() => act.mutate("pay")} disabled={act.isPending} aria-label={`Tandai WD nomor ${wd.id} sudah dibayar`} className="btn-press rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40">Tandai Dibayar</button>)}<button type="button" onClick={() => act.mutate("reject")} disabled={act.isPending} aria-label={`Tolak WD nomor ${wd.id} dan kembalikan KT`} className="btn-press rounded-xl border border-red-400 px-4 py-2 font-bold text-red-300 disabled:opacity-40">Tolak &amp; Refund KT</button></div></div>)}</div>);
}
