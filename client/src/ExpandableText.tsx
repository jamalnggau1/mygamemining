// ExpandableText — deskripsi panjang tampil sebagai PREVIEW pendek
// (clamp 2 baris) dan pemain mengetuk untuk membaca SELURUH teks;
// ketuk lagi untuk menutup. Dipakai di semua deskripsi panjang
// (kartu upgrade Hanggar, kartu peta, aturan misi, deskripsi Premium,
// Komunitas, Kendali, aturan WD) supaya layar tetap padat tapi tidak
// ada informasi yang hilang.
//
// Perilaku:
// - Tertutup: teks di-clamp ke `lines` baris; di bawahnya muncul
//   tombol kecil "Lihat selengkapnya ▾" (warna aksen, chevron).
// - Terbuka: teks penuh tampil; tombol menjadi "Tutup ▴".
// - Mengetuk teksnya sendiri juga membuka/menutup (bila teksnya
//   memang lebih panjang dari preview).
// - Bila teksnya muat dalam preview, tombol tidak muncul dan teks
//   tidak bisa diklik (tidak ada yang perlu dibuka) — diukur lewat
//   scrollHeight vs clientHeight, dicek ulang setelah font dimuat
//   dan saat ukuran layar berubah.
// - Inline expand/collapse saja — tidak ada modal atau layar baru.
// - children berupa ReactNode, jadi bekerja dengan trich()
//   (**tebal**/*miring*) maupun string biasa.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "./i18n";

// Tailwind hanya menghasilkan class yang tertulis statis di source —
// nama class yang dirangkai dinamis (`line-clamp-${n}`) tidak akan
// terdeteksi. Karena itu hanya 2 dan 3 yang didukung, via map statis.
const CLAMP_CLASS: Record<number, string> = {
  2: "line-clamp-2",
  3: "line-clamp-3",
};

export function ExpandableText({
  children,
  lines = 2,
  className = "",
}: {
  children: ReactNode;
  lines?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => {
      // Hanya ukur saat tertutup: saat terbuka teks tidak di-clamp
      // sehingga scrollHeight == clientHeight dan hasil ukurnya salah.
      if (!open) setOverflows(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    const timer = window.setTimeout(measure, 350); // font telat dimuat
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [children, open]);

  const interactive = overflows || open;
  const toggle = () => {
    if (interactive) setOpen((v) => !v);
  };

  return (
    <div>
      <div
        ref={textRef}
        onClick={toggle}
        className={`${className} ${open ? "" : CLAMP_CLASS[lines] ?? "line-clamp-2"}${interactive ? " cursor-pointer" : ""}`}
      >
        {children}
      </div>
      {interactive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-cyan-300 hover:underline"
        >
          {open ? t("expandLess") : t("expandMore")}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
