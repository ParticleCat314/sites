/*
 * Builds `offline/` — a deployable copy of the app whose index.html is fully
 * self-contained: CSS, fonts, the bundle and VexFlow's music fonts are all
 * inlined, so the document has no subresources at all.
 *
 * That matters on iOS. A home-screen web app gets its own storage partition,
 * so the service worker cache starts out empty there; if the first standalone
 * launch has no network, Safari falls back to its HTTP cache and any page that
 * depends on sibling files renders as bare HTML. One self-contained document
 * cannot fail that way.
 *
 *   node scripts/build-offline.mjs [--with-piano]
 *
 * --with-piano also embeds the ~4 MB mezzo-forte sample layer (as m4a, the
 * format Safari uses), which makes playback work with no network whatsoever at
 * the cost of a much larger document.
 */

import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "offline");
const withPiano = process.argv.includes("--with-piano");

const read = (rel) => readFile(path.join(root, rel), "utf8");
const readBinary = (rel) => readFile(path.join(root, rel));

async function dataUri(rel, mime) {
  return `data:${mime};base64,${(await readBinary(rel)).toString("base64")}`;
}

/** Replace every url(...) in a stylesheet with the file's data URI. */
async function inlineCssUrls(css) {
  const urls = [...new Set([...css.matchAll(/url\(([^)'"]+)\)/g)].map((m) => m[1]))];
  for (const url of urls) {
    css = css.replaceAll(`url(${url})`, `url(${await dataUri(url, "font/woff2")})`);
  }
  return css;
}

/** The sample file names of the sampler's mezzo-forte layer. */
function mezzoForteSampleNames() {
  const require = createRequire(import.meta.url);
  const source = require.resolve("smplr/dist/index.js");
  const js = require("node:fs").readFileSync(source, "utf8");
  const layers = js.slice(js.indexOf("var LAYERS = ["));
  const mf = layers.slice(layers.indexOf('name: "MF"'));
  const body = mf.slice(0, mf.indexOf('name: "FF"'));
  return [...body.matchAll(/\[\d+, "([^"]+)"\]/g)].map((m) => m[1]);
}

async function fetchSamples() {
  const base = "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples";
  const names = mezzoForteSampleNames();
  const samples = {};
  let done = 0;
  await Promise.all(
    names.map(async (name) => {
      const file = `${name}.m4a`;
      const response = await fetch(`${base}/${encodeURIComponent(file)}`);
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      samples[file] = Buffer.from(await response.arrayBuffer()).toString("base64");
      process.stdout.write(`\r  samples ${++done}/${names.length}`);
    })
  );
  process.stdout.write("\n");
  return samples;
}

const html = await read("index.html");
const fontsCss = await inlineCssUrls(await read("fonts.css"));
const styles = await read("styles.css");
const app = await read("dist/app.js");

const vexflowFonts = {
  Bravura: await dataUri("fonts/vexflow/bravura/bravura.woff2", "font/woff2"),
  Academico: await dataUri("fonts/vexflow/academico/academico.woff2", "font/woff2"),
};

const globals = [`globalThis.__VEXFLOW_FONT_URLS__=${JSON.stringify(vexflowFonts)};`];
if (withPiano) globals.push(`globalThis.__PIANO_SAMPLES__=${JSON.stringify(await fetchSamples())};`);

/*
 * A stamp in plain markup near the top of the body. It renders even when
 * everything else has failed, which makes "is the phone actually loading this
 * build?" a question you can answer by looking at the screen — a stale cached
 * document simply will not carry the current timestamp.
 */
const buildId = new Date().toISOString().slice(0, 16).replace("T", " ");
const stamp =
  `<p class="buildstamp" style="font:12px/1.4 monospace;opacity:0.55;padding:8px 20px 0">` +
  `self-contained build ${buildId}${withPiano ? " · piano embedded" : ""}</p>`;

const inlined = html
  .replace(
    /<link rel="preload"[^>]*>\s*/,
    ""
  )
  .replace("<body>", `<body>\n${stamp}`)
  .replace(
    /<link rel="stylesheet" href="fonts\.css">\s*<link rel="stylesheet" href="styles\.css">/,
    `<style>\n${fontsCss}\n</style>\n<style>\n${styles}\n</style>`
  )
  .replace(
    '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">',
    `<link rel="icon" href="${await dataUri("icons/icon.svg", "image/svg+xml")}" type="image/svg+xml">`
  )
  .replace(
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
    `<link rel="apple-touch-icon" href="${await dataUri("icons/apple-touch-icon.png", "image/png")}">`
  )
  .replace(
    '<script src="dist/app.js"></script>',
    `<script>${globals.join("")}</script>\n<script>\n${app}\n</script>`
  );

if (inlined.includes('href="styles.css"') || inlined.includes('src="dist/app.js"')) {
  throw new Error("index.html markup changed — inlining patterns no longer match");
}

/*
 * The inlined document has no subresources, so the shell list shrinks to the
 * document, the manifest and the icons the manifest points at — those are
 * still separate files, and an install prompt or icon refresh while offline
 * needs them cached.
 */
const offlineShell = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

const sw = (await read("sw.js"))
  .replace(
    /const SHELL = \[[\s\S]*?\];/,
    `const SHELL = [\n${offlineShell.map((url) => `  ${JSON.stringify(url)},`).join("\n")}\n];`
  )
  .replace('const VERSION = "v1";', `const VERSION = "offline-${Date.now()}";`);

if (!sw.includes("offline-") || sw.includes('"./styles.css"')) {
  throw new Error("sw.js changed — the offline rewrite no longer matches");
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
/*
 * The installed app gets a URL unique to this build. iOS keeps a home-screen
 * app's storage keyed by origin, and it will happily launch a stale document
 * from its HTTP cache; a start_url no previous build ever used cannot be
 * answered from that cache.
 */
const manifest = JSON.parse(await read("manifest.webmanifest"));
manifest.start_url = `./index.html?build=${Date.now()}`;
// start_url changes every build; `id` is what keeps this one installed app
// rather than a new one each time.
manifest.id = "./";

await writeFile(path.join(out, "index.html"), inlined);
await writeFile(path.join(out, "sw.js"), sw);
await writeFile(path.join(out, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
await cp(path.join(root, "icons"), path.join(out, "icons"), { recursive: true });

const mb = (Buffer.byteLength(inlined) / 1048576).toFixed(1);
console.log(`offline/index.html — ${mb} MB, self-contained${withPiano ? " (piano samples embedded)" : ""}`);
