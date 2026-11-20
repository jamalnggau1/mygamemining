// Buffer polyfill — file `inject` esbuild (lihat client/build.mjs).
//
// Browser TIDAK punya global `Buffer`, tapi @ton/core membuat
// BitString.EMPTY = new BitString(Buffer.alloc(0), ...) di TOP-LEVEL
// modulnya. Modul itu dievaluasi SEBELUM body main.tsx berjalan,
// jadi polyfill yang dipasang di main.tsx saja TIDAK cukup: browser
// melempar "ReferenceError: Buffer is not defined" saat bundle
// di-evaluasi dan SELURUH halaman jadi hitam (tidak ada React,
// tidak ada layar error).
//
// File ini di-inject esbuild ke paling atas bundle: setiap modul
// yang memakai `Buffer` sebagai variabel bebas (termasuk @ton/core
// dan tonconnect.ts) mendapat import ini, sehingga Buffer sudah
// tersedia sebelum modul mana pun dievaluasi. Penugasan
// globalThis.Buffer di main.tsx tetap dipertahankan untuk kode yang
// membaca Buffer lewat global saat runtime.
import { Buffer } from "buffer";
export { Buffer };
