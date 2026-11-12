import { marked } from "marked";

// Posts are Markdown files in web/content/blog. The file name is the URL:
// content/blog/my-post.md is served at /blog/my-post. Files whose names begin
// with an underscore are not published.
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
  summary?: string;
  html: string;
};

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
    summary: fields.summary || undefined,
    html: marked.parse(match[2], { async: false }),
  };
}

// Newest first.
export const posts: Post[] = Object.entries(files)
  .filter(([path]) => !path.split("/").pop()!.startsWith("_"))
  .map(([path, source]) => parsePost(path, source))
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

export function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
