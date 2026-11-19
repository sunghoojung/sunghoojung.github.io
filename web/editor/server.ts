import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join } from "node:path";
import type { Plugin } from "vite";
import { frontMatterPattern, readFrontMatter } from "../app/blog/front-matter";
import { createPost } from "../scripts/new-post.mjs";

// `npm run dev` only. Answers the post editor (editor/client.ts) and keeps
// the dev server in step with content/blog.

const postFile = /[\\/]content[\\/]blog[\\/][^\\/]+\.md$/;
const slugPattern = /^[a-z0-9_][a-z0-9_-]*$/i;
const pictureTypes = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const megabyte = 1024 * 1024;

const hash = (text: string) => createHash("sha1").update(text).digest("hex");
const lf = (text: string) => text.replace(/\r\n/g, "\n");

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendPage(res: ServerResponse, status: number, html: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<style>body{display:grid;place-items:center;height:100vh;margin:0;font:15px system-ui,sans-serif;color:#888}</style>
${html}`);
}

function readBody(req: IncomingMessage, limit: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`Larger than ${limit / megabyte} MB.`));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Other sites cannot send a custom header here: that needs the dev server's
// consent (CORS), which it never gives.
function fromEditor(req: IncomingMessage) {
  const site = req.headers["sec-fetch-site"];
  return (
    req.headers["x-post-editor"] === "1" && (!site || site === "same-origin")
  );
}

export function postEditor(): Plugin {
  let root = "";
  const postPath = (slug: string) =>
    join(root, "content", "blog", `${slug}.md`);

  // GET returns the post with \n line endings; PUT saves it if the file is
  // still the version the editor loaded.
  async function handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    slug: string,
  ) {
    const file = postPath(slug);
    if (!existsSync(file)) {
      return send(res, 404, { error: `No post at content/blog/${slug}.md.` });
    }
    const current = readFileSync(file, "utf8");
    const version = hash(current);
    if (req.method === "GET") {
      return send(res, 200, { source: lf(current), version });
    }
    if (req.method !== "PUT")
      return send(res, 405, { error: "Use GET or PUT." });

    const body = JSON.parse((await readBody(req, 10 * megabyte)).toString());
    if (typeof body.source !== "string") {
      return send(res, 400, { error: "No source." });
    }
    if (body.version !== version) {
      return send(res, 409, { source: lf(current), version });
    }
    // A post the site cannot read would break every page.
    const match = body.source.match(frontMatterPattern);
    const fields = match ? readFrontMatter(match[1]) : {};
    if (!fields.title || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date ?? "")) {
      return send(res, 422, {
        error: "A post needs a title and a date (YYYY-MM-DD).",
      });
    }
    // Keep the file's own line endings.
    const text: string = current.includes("\r\n")
      ? body.source.replace(/\r?\n/g, "\r\n")
      : body.source;
    writeFileSync(file, text);
    send(res, 200, { version: hash(text) });
  }

  // Saves a picture to public/images/blog/<slug>/ and returns its file name.
  async function handlePicture(
    req: IncomingMessage,
    res: ServerResponse,
    slug: string,
    name: string,
  ) {
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
    if (!existsSync(postPath(slug))) {
      return send(res, 404, { error: "No such post." });
    }
    const extension = extname(name).toLowerCase();
    if (!pictureTypes.has(extension)) {
      return send(res, 415, {
        error: `Pictures must be ${[...pictureTypes].join(", ")}.`,
      });
    }
    const stem =
      name
        .slice(0, -extension.length)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "picture";
    const folder = join(root, "public", "images", "blog", slug);
    mkdirSync(folder, { recursive: true });
    let file = `${stem}${extension}`;
    for (let n = 2; existsSync(join(folder, file)); n++) {
      file = `${stem}-${n}${extension}`;
    }
    writeFileSync(join(folder, file), await readBody(req, 25 * megabyte));
    send(res, 200, { name: file });
  }

  // The blog page's "New post" form.
  async function handleNew(req: IncomingMessage, res: ServerResponse) {
    // A plain form post carries no custom header, but browsers mark it.
    if (
      req.method !== "POST" ||
      req.headers["sec-fetch-site"] !== "same-origin"
    ) {
      return send(res, 403, { error: "Use the form on /blog." });
    }
    const form = new URLSearchParams(
      (await readBody(req, megabyte)).toString(),
    );
    let slug: string;
    try {
      slug = createPost(
        form.get("title")?.trim() ?? "",
        join(root, "content", "blog"),
      );
    } catch (error) {
      return sendPage(
        res,
        400,
        `<p>${(error as Error).message} · <a href="/blog">Back</a></p>`,
      );
    }
    // Opens the post once the server has picked up the new file.
    const next = JSON.stringify(`/blog/${slug}?edit`);
    sendPage(
      res,
      200,
      `<title>New post</title><p>Creating the post…</p>
<script>
  (async function wait() {
    try {
      if ((await fetch(${next})).ok) return location.replace(${next});
    } catch {}
    setTimeout(wait, 200);
  })();
</script>`,
    );
  }

  return {
    name: "post-editor",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    // A changed post reaches the page through hot reload. Its file also has a
    // bare `.md` entry in the module graph; reloading that as JavaScript
    // would fail and stop the update, so only the `?raw` import is passed on.
    hotUpdate({ file, modules }) {
      if (!postFile.test(file)) return;
      return modules.filter((module) => module.id?.endsWith("?raw"));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/__post-editor/")) return next();
        const [kind, slug = "", name = ""] = url.pathname
          .slice("/__post-editor/".length)
          .split("/")
          .map(decodeURIComponent);
        const work = (async () => {
          if (kind === "new") return handleNew(req, res);
          if (!fromEditor(req)) {
            return send(res, 403, { error: "Only the editor may call this." });
          }
          if (!slugPattern.test(slug)) {
            return send(res, 400, { error: "Bad post name." });
          }
          if (kind === "post") return handlePost(req, res, slug);
          if (kind === "picture") return handlePicture(req, res, slug, name);
          send(res, 404, { error: "Unknown editor request." });
        })();
        work.catch((error: Error) => {
          if (!res.headersSent) send(res, 500, { error: error.message });
        });
      });
    },
  };
}
