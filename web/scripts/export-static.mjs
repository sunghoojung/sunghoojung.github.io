// Writes the built site to out/ as plain files for static hosting
// (GitHub Pages). Run after `npm run build`.
//
// Every page is fixed text, so the exported HTML carries no scripts: pages are
// rendered once here and linked with ordinary anchors.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const out = new URL("out/", root);

// GitHub Pages serves projects.html at /projects.
const pages = [
  { route: "/", file: "index.html", status: 200 },
  { route: "/publications", file: "publications.html", status: 200 },
  { route: "/projects", file: "projects.html", status: 200 },
  { route: "/page-that-does-not-exist", file: "404.html", status: 404 },
];

const { default: worker } = await import(
  new URL("dist/server/index.js", root).href
);

async function render(route) {
  return worker.fetch(
    new Request(`http://localhost${route}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function withoutScripts(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel="preload"[^>]*as="script"[^>]*>/gi, "");
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Stylesheets and public files; script chunks are not needed.
await cp(new URL("dist/client/", root), out, {
  recursive: true,
  filter: (source) =>
    !/\.(js|map)$/.test(source) &&
    !/(^|\/)(\.vite|\.assetsignore|_headers|vinext-client-entry-manifest\.json)$/.test(
      source,
    ),
});

for (const page of pages) {
  const response = await render(page.route);
  if (response.status !== page.status) {
    throw new Error(
      `${page.route} returned ${response.status}, expected ${page.status}.`,
    );
  }
  await writeFile(
    new URL(page.file, out),
    withoutScripts(await response.text()),
  );
}

// Serve the files as they are, including paths that begin with an underscore.
await writeFile(new URL(".nojekyll", out), "");
console.log(`Exported ${pages.length} pages to out/.`);
process.exit(0);
