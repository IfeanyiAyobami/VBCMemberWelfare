import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, extname } from "node:path";
import { shellMarkup } from "../src/lib/shell-markup.js";
import { themeBootstrap } from "../src/lib/theme.js";

const root = fileURLToPath(new URL("../", import.meta.url));
let css = await readFile(join(root, "src/app/globals.css"), "utf8");
css += "\n" + (await readFile(join(root, "src/app/themes.css"), "utf8"));
let shell = shellMarkup;
let seed = (
  await readFile(join(root, "src/lib/demo-state.js"), "utf8")
).replace("export function", "function");
let runtime = (await readFile(join(root, "src/lib/care-runtime.js"), "utf8"))
  .replace(
    /import\s*\{[^}]*\}\s*from\s*["']\.\/(demo-state|theme)\.js["'];?/g,
    "",
  )
  .replace("export function", "function");
const theme = (await readFile(join(root, "src/lib/theme.js"), "utf8")).replace(
  /^export /gm,
  "",
);
const mime = {
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
};
for (const file of await readdir(join(root, "public/assets"))) {
  if (!mime[extname(file)]) continue;
  const data = await readFile(join(root, "public/assets", file));
  const uri = `data:${mime[extname(file)]};base64,${data.toString("base64")}`;
  const path = `/assets/${file}`;
  css = css.replaceAll(path, uri);
  shell = shell.replaceAll(path, uri);
  seed = seed.replaceAll(path, uri);
  runtime = runtime.replaceAll(path, uri);
}
const script =
  `${theme}\n${seed}\n${runtime}\nmountCareUI(document.getElementById('care-app'));`.replaceAll(
    "</script",
    "<\\/script",
  );
const html = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Vine Branch · Frontend Review</title><script id="care-theme-init">${themeBootstrap}</script><style>${css}</style></head><body><div id="care-app">${shell}</div><script>${script}</script></body></html>`;
await writeFile(join(root, "preview.html"), html);
console.log(
  "Built self-contained preview.html (fonts, graphics, CSS and JS included).",
);
