import {
  frontMatterPattern,
  pictureUrl,
  readFrontMatter,
  renderPost,
} from "./markdown";

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

function parsePost(path: string, source: string): Post {
  const slug = path.split("/").pop()!.replace(/\.md$/, "");
  const match = source.match(frontMatterPattern);
  if (!match) {
    throw new Error(`${path} must begin with a --- front matter block.`);
  }
  const fields = readFrontMatter(match[1]);
  if (!fields.title || !/^\d{4}-\d{2}-\d{2}$/.test(fields.date ?? "")) {
    throw new Error(`${path} needs a title and a date written as YYYY-MM-DD.`);
  }
  return {
    slug,
    title: fields.title,
    date: fields.date,
    description: fields.description || undefined,
    thumbnail: fields.thumbnail
      ? pictureUrl(fields.thumbnail, slug)
      : undefined,
    draft: fields.draft === "true",
    html: renderPost(match[2], slug),
  };
}

// Newest first.
export const posts: Post[] = Object.entries(files)
  .filter(([path]) => !path.split("/").pop()!.startsWith("_"))
  .map(([path, source]) => parsePost(path, source))
  .filter((post) => import.meta.env.DEV || !post.draft)
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

// The picture sites such as X show for a link to the post: its title beside its
// thumbnail. scripts/export-static.mjs draws it (scripts/share-card.mjs).
export function shareCardUrl(slug: string) {
  return `/og/${slug}.png`;
}

export function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
