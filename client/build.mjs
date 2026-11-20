// Standalone client build for the Vercel deployment (no Muse SDK).
//
//   1. esbuild bundles client/src/main.tsx -> client/dist/assets/index-<hash>.js
//      (React + TSX + WebP assets). The theme.css import is resolved to
//      empty here — esbuild cannot process Tailwind v4's
//      `@import "tailwindcss"`, so the CSS is built separately in step 2.
//   2. The Tailwind CSS v4 CLI compiles client/src/theme.css ->
//      client/dist/assets/theme.css (minified). This is what turns the
//      @theme tokens, the tailwindcss-safe-area utilities (pt-safe,
//      ...) and the custom keyframes in theme.css into real CSS.
//   3. client/index.html is copied to client/dist/index.html with the
//      built JS + CSS injected (replacing the dev entrypoint
//      ./src/main.tsx).
//
// Run with `bun run build:client`. Output is what vercel.json serves
// (outputDirectory: client/dist).

import { build } from "esbuild";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "client", "dist");
const assetsDir = path.join(outDir, "assets");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: root }, (err, stdout, stderr) => {
      if (err) {
        reject(
          new Error(
            `${cmd} ${args.join(" ")} failed:\n${stderr || err.message}`,
          ),
        );
      } else {
        resolve(stdout);
      }
    });
  });
}

await rm(outDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

// 1. JS bundle. CSS imports resolve to an empty module — the real
// stylesheet comes from the Tailwind CLI in step 2.
const cssEmptyPlugin = {
  name: "css-empty",
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (args) => ({
      path: args.path,
      namespace: "css-empty",
    }));
    b.onLoad({ filter: /.*/, namespace: "css-empty" }, () => ({
      // Loader "js" (not "css") so esbuild emits no CSS file at all —
      // the stylesheet comes from the Tailwind CLI in step 2.
      contents: "",
      loader: "js",
    }));
  },
};
const result = await build({
  entryPoints: [path.join(root, "client", "src", "main.tsx")],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  outdir: assetsDir,
  publicPath: "/assets",
  entryNames: "[name]-[hash]",
  assetNames: "[name]-[hash]",
  loader: { ".webp": "file", ".png": "file", ".jpg": "file" },
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  // Buffer polyfill DI ATAS bundle (lihat client/src/buffer-polyfill.ts):
  // @ton/core memakai Buffer di top-level modulnya — tanpa inject ini
  // browser melempar "Buffer is not defined" saat bundle dievaluasi
  // dan halaman jadi hitam total (2026-11-20).
  inject: [path.join(root, "client", "src", "buffer-polyfill.ts")],
  plugins: [cssEmptyPlugin],
  metafile: true,
  logLevel: "info",
});
const jsOut = Object.keys(result.metafile.outputs).find((o) =>
  o.endsWith(".js"),
);
if (!jsOut) throw new Error("esbuild produced no JS output");
const jsFile = path.basename(jsOut);

// 2. Tailwind CSS (v4 CLI, installed as a devDependency).
await run("bun", [
  "x",
  "@tailwindcss/cli",
  "-i",
  "client/src/theme.css",
  "-o",
  "client/dist/assets/theme.css",
  "--minify",
]);

// 3. Inject the built assets into index.html.
const html = await readFile(path.join(root, "client", "index.html"), "utf8");
const built = html.replace(
  '<script src="./src/main.tsx" type="module"></script>',
  `<link rel="stylesheet" href="./assets/theme.css" />\n    <script type="module" src="./assets/${jsFile}"></script>`,
);
if (built === html) {
  throw new Error(
    "client/index.html no longer contains the expected main.tsx script tag",
  );
}
await writeFile(path.join(outDir, "index.html"), built);

// 4. Root URL files copied verbatim (no hashing — TON Connect
// needs STABLE URLs): the manifest is fetched by wallets at
// /tonconnect-manifest.json, and its iconUrl points at /icon.webp
// (repo-root icon, copied under a fixed name).
await copyFile(path.join(root, "client", "public", "tonconnect-manifest.json"), path.join(outDir, "tonconnect-manifest.json"));
await copyFile(path.join(root, "icon.webp"), path.join(outDir, "icon.webp"));
console.log(`client build OK: dist/index.html + assets/${jsFile} + assets/theme.css + tonconnect-manifest.json + icon.webp`);
