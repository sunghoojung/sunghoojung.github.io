// Writes the built site to out/ as plain files for static hosting
// (GitHub Pages). Run after `npm run build`.
//
// Every page is fixed text, so the exported HTML carries no scripts: pages are
// rendered once here and linked with ordinary anchors.
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const out = new URL("out/", root);

const postSlugs = (await readdir(new URL("content/blog/", root)))
  .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
  .map((name) => name.replace(/\.md$/, ""));

// GitHub Pages serves projects.html at /projects. The blog list is written
// twice so /blog works whether Pages resolves it as a file or as the folder
// that holds the posts.
const pages = [
  { route: "/", files: ["index.html"], status: 200 },
  { route: "/publications", files: ["publications.html"], status: 200 },
  { route: "/projects", files: ["projects.html"], status: 200 },
  { route: "/blog", files: ["blog.html", "blog/index.html"], status: 200 },
  ...postSlugs.map((slug) => ({
    route: `/blog/${slug}`,
    files: [`blog/${slug}.html`],
    status: 200,
  })),
  { route: "/page-that-does-not-exist", files: ["404.html"], status: 404 },
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
  const html = withoutScripts(await response.text());
  for (const file of page.files) {
    const target = new URL(file, out);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, html);
  }
}

// Serve the files as they are, including paths that begin with an underscore.
await writeFile(new URL(".nojekyll", out), "");
console.log(`Exported ${pages.length} pages to out/.`);
process.exit(0);
