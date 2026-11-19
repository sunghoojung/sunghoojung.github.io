import { Marked, type Token } from "marked";

// Posts are Markdown files in web/content/blog. The file name is the URL:
// content/blog/my-post.md is served at /blog/my-post. Files whose names begin
// with an underscore are never published. A post with `draft: true` in its
// front matter shows up only under `npm run dev`; builds leave it out.
const files = import.meta.glob<string>("../../content/blog/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export type Post = {
  slug: string;
  title: string;
  // ISO date, such as 2026-11-12.
  date: string;
  description?: string;
  // Shown on the blog list. A file name in public/images/blog/<slug>/.
  thumbnail?: string;
  draft: boolean;
  html: string;
};

function headingId(tokens: Token[]) {
  return tokens
    .map((token) => token.raw)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The list of ## and ### headings that replaces <!-- contents --> in a post.
function contents(body: string) {
  let html = "";
  let open = false;
  let sub = false;
  for (const token of markdown.lexer(body)) {
    if (token.type !== "heading" || token.depth > 3) continue;
    if (token.depth === 2 && token.text === "Contents") continue;
    const link = `<a href="#${headingId(token.tokens ?? [])}">${token.text}</a>`;
    if (token.depth === 2) {
      html += `${sub ? "</ul></li>" : open ? "</li>" : ""}<li>${link}`;
      open = true;
      sub = false;
    } else if (open) {
      html += `${sub ? "" : "<ul>"}<li>${link}</li>`;
      sub = true;
    }
  }
  return `<nav class="toc" aria-label="Contents"><ol>${html}${sub ? "</ul></li>" : "</li>"}</ol></nav>`;
}

const markdown = new Marked({
  renderer: {
    // Headings get ids, so a link such as [results](#results) can jump to them.
    heading({ tokens, depth }) {
      const id = headingId(tokens);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    // An image alone on a line becomes a figure captioned with its alt text.
    paragraph({ tokens }) {
      const inline = this.parser.parseInline(tokens);
      const [only] = tokens;
      if (tokens.length === 1 && only.type === "image") {
        return `<figure>${inline}<figcaption>${only.text}</figcaption></figure>\n`;
      }
      return `<p>${inline}</p>\n`;
    },
    image({ href, title, text }) {
      const caption = title ? ` title="${title}"` : "";
      return `<img src="${href}" alt="${text}"${caption} loading="lazy">`;
    },
  },
});

function parsePost(path: string, source: string): Post {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`${path} must begin with a --- front matter block.`);
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    fields[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  }
  if (!fields.title || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date ?? "")) {
    throw new Error(`${path} needs a title and a date written as YYYY-MM-DD.`);
  }
  return {
    slug,
    title: fields.title,
    date: fields.date,
    description: fields.description || undefined,
    thumbnail: fields.thumbnail
      ? /^(\/|[a-z]+:)/i.test(fields.thumbnail)
        ? fields.thumbnail
        : `/images/blog/${slug}/${fields.thumbnail}`
      : undefined,
    draft: fields.draft === "true",
    html: markdown
      .parse(match[2], {
        async: false,
        // Pictures are written by file name (fig1.png) and live in
        // public/images/blog/<slug>/.
        walkTokens(token) {
          if (token.type === "image" && !/^(\/|[a-z]+:)/i.test(token.href)) {
            token.href = `/images/blog/${slug}/${token.href}`;
          }
        },
      })
      .replace("<!-- contents -->", () => contents(match[2])),
  };
}

// Newest first.
export const posts: Post[] = Object.entries(files)
  .filter(([path]) => !path.split("/").pop()!.startsWith("_"))
  .map(([path, source]) => parsePost(path, source))
  .filter((post) => import.meta.env.DEV || !post.draft)
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

export function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
