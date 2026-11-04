import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { themeBootstrap } from "../src/lib/theme.js";

const root = new URL("../", import.meta.url).pathname;
const uri = async (p, type) =>
  `data:${type};base64,${(await readFile(root + p)).toString("base64")}`;

// Smaller flyer for the demo page
execFileSync("python3", ["-c", `
from PIL import Image
im=Image.open('${root}public/whatsapp/sunday-invitation.jpg'); im.thumbnail((720,900))
im.convert('RGB').save('/tmp/demo-flyer.jpg', quality=80)`]);
const flyer = `data:image/jpeg;base64,${(await readFile("/tmp/demo-flyer.jpg")).toString("base64")}`;
const logo = await uri("public/assets/image-7d4e31b34082.png", "image/png");

const out = await build({
  entryPoints: [root + "demo/entry.tsx"],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  loader: { ".css": "empty" },
  tsconfig: root + "tsconfig.json",
  define: {
    "process.env.NODE_ENV": '"production"',
    __FLYER__: JSON.stringify(flyer),
  },
  logLevel: "warning",
});
let js = out.outputFiles[0].text.replaceAll("/assets/image-7d4e31b34082.png", logo);

let css = "";
for (const f of [
  "src/app/tokens.css",
  "src/app/globals.css",
  "src/app/themes.css",
  "src/app/premium.css",
  "src/components/journey.css",
  "src/components/friend.css",
]) css += "\n" + (await readFile(root + f, "utf8"));
const urls = [...new Set([...css.matchAll(/url\(["']?(\/[^"')]+)["']?\)/g)].map((m) => m[1]))];
for (const u of urls) {
  const type = u.endsWith(".ttf") ? "font/ttf" : u.endsWith(".png") ? "image/png" : "image/jpeg";
  try {
    css = css.replaceAll(u, await uri("public" + u, type));
  } catch {
    css = css.replaceAll(u, "");
  }
}
css = css.replace(/<\/style/gi, "<\\/style");
js = js.replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>VBC Member Care — live demo (fictional data)</title>
<script>${themeBootstrap}</script>
<style>${css}
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
body{margin:0;background:var(--vb-bg)}
.demo-banner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:70;display:flex;gap:10px;align-items:center;max-width:calc(100vw - 24px);padding:8px 14px;border-radius:999px;background:var(--vb-fg);color:var(--vb-bg);font:600 12px/1.4 Poppins,system-ui,sans-serif;box-shadow:0 8px 24px #0004}
.demo-banner button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;min-height:28px;text-decoration:underline}
#demo-note{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:80;max-width:min(520px,calc(100vw - 24px));padding:12px 16px;border-radius:12px;background:var(--vb-surface);color:var(--vb-fg);border:1px solid var(--vb-line-strong);font:500 14px/1.5 Poppins,system-ui,sans-serif;box-shadow:0 10px 30px #0005}
@media (max-width:800px){.demo-banner{bottom:auto;top:calc(74px + env(safe-area-inset-top,0px));right:12px;left:auto;transform:none;padding:4px 4px 4px 12px}.demo-long{display:none}}
@media (min-width:801px){.demo-short{display:none}}
</style>
</head>
<body>
<div id="root"></div>
<div id="demo-note" role="status" hidden></div>
<div class="demo-banner" id="demo-banner"><span class="demo-long">Demo · fictional people · nothing is sent · resets on reload</span><span class="demo-short">Demo data</span> <button type="button" onclick="this.parentNode.remove()">Hide</button></div>
<script>${js}</script>
</body>
</html>`;
await writeFile("/mnt/user-data/outputs/vbc-member-care-demo.html", html);
console.log("bytes", html.length);
