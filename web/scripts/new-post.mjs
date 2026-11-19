// Starts a draft: npm run new-post -- "My post title"
// Creates content/blog/<slug>.md with `draft: true`; see the README. The
// editor's "New post" form under `npm run dev` calls createPost too.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

// Returns the new post's slug.
export function createPost(
  title,
  directory = fileURLToPath(new URL("../content/blog/", import.meta.url)),
) {
  const slug = slugify(title);
  if (!slug)
    throw new Error("A post title needs at least one letter or digit.");
  const file = join(directory, `${slug}.md`);
  if (existsSync(file))
    throw new Error(`content/blog/${slug}.md already exists`);
  const date = new Date().toLocaleDateString("en-CA");
  writeFileSync(
    file,
    `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\ndraft: true\ndescription: One sentence shown under the title on the blog page.\n---\n\nStart writing here.\n`,
  );
  return slug;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const title = process.argv.slice(2).join(" ").trim();
  if (!slugify(title)) {
    console.error('usage: npm run new-post -- "My post title"');
    process.exit(1);
  }
  try {
    const slug = createPost(title);
    console.log(`Created content/blog/${slug}.md (a draft).`);
    console.log(`Run npm run dev and open /blog/${slug}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
