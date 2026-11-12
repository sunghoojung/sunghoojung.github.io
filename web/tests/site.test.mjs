import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// `npm test` exports the static site to out/ before these run.
const out = new URL("../out/", import.meta.url);
const read = (file) => readFileSync(new URL(file, out), "utf8");

const pages = {
  about: read("index.html"),
  publications: read("publications.html"),
  projects: read("projects.html"),
  notFound: read("404.html"),
};
const scholarConfig = JSON.parse(
  readFileSync(new URL("../app/scholar.json", import.meta.url), "utf8"),
);
const scholarSnapshot = read("scholar/profile.html");

test("every exported page is script-free and links a stylesheet that exists", () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /<script\b/i, name);
    assert.doesNotMatch(html, /<button\b/i, name);
    const stylesheet = html.match(
      /<link rel="stylesheet" href="\/([^"]+)"/,
    )?.[1];
    assert.ok(stylesheet, `${name} links a stylesheet`);
    assert.ok(
      existsSync(new URL(stylesheet, out)),
      `${stylesheet} is exported`,
    );
  }
  assert.ok(existsSync(new URL(".nojekyll", out)));
  assert.ok(existsSync(new URL("favicon.svg", out)));
});

test("pages share navigation and mark the current page", () => {
  for (const [name, html] of Object.entries(pages)) {
    const nav = html.match(/<nav aria-label="Pages">[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, name);
    assert.match(nav, /href="\/"/);
    assert.match(nav, /href="\/publications"/);
    assert.match(nav, /href="\/projects"/);
  }
  assert.match(pages.about, /href="\/" aria-current="page"/);
  assert.match(pages.publications, /href="\/publications" aria-current="page"/);
  assert.match(pages.projects, /href="\/projects" aria-current="page"/);
  assert.doesNotMatch(pages.notFound, /aria-current="page"/);
  assert.match(pages.notFound, /Page not found/);
});

test("about page introduces Sunghoo with research and contact links", () => {
  const html = pages.about;
  assert.match(html, /<title>Sunghoo Jung<\/title>/);
  assert.match(html, /<h1>Sunghoo Jung<\/h1>/);
  assert.match(html, /I began programming at 14/);
  assert.match(html, /Trustworthy ML Lab/);
  assert.match(html, /Neurodegenerative Diseases Lab/);
  assert.match(html, /href="mailto:[^"]+"/);
  assert.match(html, /href="https:\/\/github\.com\/sunghoojung"/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/sunghoo-jung"/);
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

test("each project has a labelled heading and a description", () => {
  const html = pages.projects;
  assert.match(html, /<h1>Projects<\/h1>/);
  const articles = [
    ...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g),
  ].map(([article]) => article);
  assert.equal(articles.length, 7);
  for (const article of articles) {
    const heading = article.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(heading);
    assert.ok(article.includes(`id="${heading}"`));
    assert.ok(article.match(/<p>[^<]{80,}<\/p>/), "has a description");
  }
  assert.match(html, /Reverse Engineering Browser/);
  assert.match(html, /Astra NFT Bot/);
});

test("no page carries the room or NDA-covered rail work", () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(
      html,
      /bedroom|\.glb|Loading room|lo-fi radio|eevee/i,
      name,
    );
    assert.doesNotMatch(
      html,
      /Rail Lab|railway perception|railway monitoring|LiDAR|gate.state accuracy|8\.75|46\.7/i,
      name,
    );
  }
});
