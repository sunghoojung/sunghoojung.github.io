import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// `npm test` exports the static site to out/ before these run.
const out = new URL("../out/", import.meta.url);
const read = (file) => readFileSync(new URL(file, out), "utf8");

const pages = {
  about: read("index.html"),
  publications: read("publications.html"),
  projects: read("projects.html"),
  blog: read("blog.html"),
  notFound: read("404.html"),
};
const scholarConfig = JSON.parse(
  readFileSync(new URL("../app/scholar.json", import.meta.url), "utf8"),
);
const scholarSnapshot = read("scholar/profile.html");
const postFiles = readdirSync(
  new URL("../content/blog/", import.meta.url),
).filter((name) => name.endsWith(".md") && !name.startsWith("_"));

function imageSources(html) {
  return [...html.matchAll(/<img\b[^>]*\ssrc="\/([^"]+)"/g)].map(
    ([, source]) => source,
  );
}

test("every exported page is script-free and its files exist", () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /<script\b/i, name);
    assert.doesNotMatch(html, /<button\b/i, name);
    const stylesheet = html.match(
      /<link rel="stylesheet" href="\/([^"]+)"/,
    )?.[1];
    assert.ok(stylesheet, `${name} links a stylesheet`);
    assert.ok(existsSync(new URL(stylesheet, out)), `${stylesheet} exists`);
    for (const source of imageSources(html)) {
      assert.ok(existsSync(new URL(source, out)), `${source} exists`);
    }
  }
  assert.ok(existsSync(new URL(".nojekyll", out)));
  assert.ok(existsSync(new URL("favicon.svg", out)));
});

test("pages share navigation and mark the current page", () => {
  for (const [name, html] of Object.entries(pages)) {
    const nav = html.match(/<nav aria-label="Pages">[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, name);
    for (const href of ["/", "/publications", "/projects", "/blog"]) {
      assert.ok(nav.includes(`href="${href}"`), `${name} links ${href}`);
    }
  }
  assert.match(pages.about, /href="\/" aria-current="page"/);
  assert.match(pages.publications, /href="\/publications" aria-current="page"/);
  assert.match(pages.projects, /href="\/projects" aria-current="page"/);
  assert.match(pages.blog, /href="\/blog" aria-current="page"/);
  assert.doesNotMatch(pages.notFound, /aria-current="page"/);
  assert.match(pages.notFound, /Page not found/);
});

test("about page shows the photo, labs, and labelled contact links", () => {
  const html = pages.about;
  assert.match(html, /<title>Sunghoo Jung<\/title>/);
  assert.match(html, /<h1>Sunghoo Jung<\/h1>/);
  assert.match(html, /<img[^>]+class="profile-photo"[^>]+alt="Sunghoo Jung"/);
  assert.match(html, /Rutgers University/);
  assert.match(html, /Ruixiang Tang’s lab/);
  assert.match(html, /interpretability and model steering/);
  assert.match(html, /href="https:\/\/rail\.rutgers\.edu\/"[^>]*>Rail Lab</);
  assert.match(html, /Neurodegenerative Diseases Lab/);
  assert.match(html, /I began programming at 14/);
  // Icon-only links need a name for screen readers.
  for (const label of ["Email", "GitHub", "LinkedIn", "X", "Google Scholar"]) {
    assert.match(html, new RegExp(`<a[^>]+aria-label="${label}"`));
  }
  assert.match(html, /href="mailto:[^"]+"/);
  assert.match(html, /href="https:\/\/github\.com\/sunghoojung"/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/sunghoo-jung"/);
  assert.match(html, /href="https:\/\/x\.com\/sunny17347"/);
  assert.match(
    html,
    /rel="canonical" href="https:\/\/sunghoojung\.github\.io\/?"/,
  );
});

test("publications link to their DOIs", () => {
  const html = pages.publications;
  assert.match(html, /<h1>Publications<\/h1>/);
  assert.match(html, /Lipid droplets promote aberrant liquid-liquid phase/);
  assert.match(html, /Protocol for automated analysis of biological images/);
  assert.match(html, /href="https:\/\/doi\.org\/10\.1038\/s44319-026-00856-8"/);
  assert.match(
    html,
    /href="https:\/\/doi\.org\/10\.1016\/j\.xpro\.2026\.104368"/,
  );
});

test("Google Scholar is framed from a saved, inert copy", () => {
  const html = pages.publications;
  const frame = html.match(/<iframe\b[^>]*>/)?.[0];
  assert.ok(frame, "the page has a Scholar iframe");
  // Scholar forbids cross-site framing, so the frame must stay same-origin.
  assert.match(frame, /src="\/scholar\/profile\.html"/);
  assert.match(frame, /title="Google Scholar profile of Sunghoo Jung"/);
  assert.match(frame, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.ok(
    html.includes(
      `href="${scholarConfig.profileUrl.replaceAll("&", "&amp;")}"`,
    ),
    "the page links to the live Scholar profile",
  );

  assert.match(scholarConfig.savedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(scholarSnapshot, /id="gsc_prf"/);
  assert.match(scholarSnapshot, /id="gsc_a_t"/);
  assert.doesNotMatch(scholarSnapshot, /<script\b/i);
  assert.match(
    scholarSnapshot,
    /Content-Security-Policy[^>]+script-src 'none'/,
  );
  assert.match(
    scholarSnapshot,
    /<base href="https:\/\/scholar\.google\.com\/" target="_blank">/,
  );
});

test("each project has an image, a heading, and a one-line summary", () => {
  const html = pages.projects;
  assert.match(html, /<h1>Projects<\/h1>/);
  const articles = [
    ...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g),
  ].map(([article]) => article);
  assert.equal(articles.length, 4);
  for (const article of articles) {
    const heading = article.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(heading);
    assert.ok(article.includes(`id="${heading}"`));
    const image = article.match(/<img\b[^>]*>/)?.[0];
    assert.ok(image);
    assert.match(image, /alt="[^"]{20,}"/);
    assert.match(image, /width="[1-9]\d*"/);
    assert.match(image, /height="[1-9]\d*"/);
    const summary = article.match(/<p>([^<]+)<\/p>/)?.[1];
    assert.ok(summary, "has a summary");
    assert.ok(summary.length <= 140, `summary stays one line: ${summary}`);
    assert.equal(summary.match(/\.(\s|$)/g)?.length, 1, "one sentence");
  }
  assert.match(html, /Reverse Engineering Browser/);
  assert.match(html, /Astra NFT Bot/);
});

test("blog lists each post and exports a page for it", () => {
  assert.match(pages.blog, /<h1>Blog<\/h1>/);
  assert.equal(read("blog/index.html"), pages.blog);
  if (postFiles.length === 0) {
    assert.match(pages.blog, /No posts yet\./);
  }
  for (const file of postFiles) {
    const slug = file.replace(/\.md$/, "");
    assert.ok(pages.blog.includes(`href="/blog/${slug}"`), slug);
    const post = read(`blog/${slug}.html`);
    assert.doesNotMatch(post, /<script\b/i, slug);
    assert.match(post, /<article class="post">/);
  }
  // The template explains the format and must never be published.
  assert.ok(!existsSync(new URL("blog/_template.html", out)));
  assert.doesNotMatch(pages.blog, /Title of the post/);
});

test("no page carries the room or details of NDA-covered rail work", () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(
      html,
      /bedroom|\.glb|Loading room|lo-fi radio|eevee/i,
      name,
    );
    // The About page names the Rail Lab at a high level only.
    assert.doesNotMatch(
      html,
      /railway perception|railway monitoring|gate.state accuracy|8\.75|46\.7/i,
      name,
    );
  }
  for (const name of ["publications", "projects", "blog"]) {
    assert.doesNotMatch(pages[name], /Rail Lab|LiDAR/i, name);
  }
});
