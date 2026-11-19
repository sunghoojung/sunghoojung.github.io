// Starts a draft: npm run new-post -- "My post title"
// Creates content/blog/<slug>.md with `draft: true`; see the README.
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const title = process.argv.slice(2).join(" ").trim();
const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60)
  .replace(/-+$/, "");
if (!slug) {
  console.error('usage: npm run new-post -- "My post title"');
  process.exit(1);
}

const file = fileURLToPath(
  new URL(`../content/blog/${slug}.md`, import.meta.url),
);
if (existsSync(file)) {
  console.error(`content/blog/${slug}.md already exists`);
  process.exit(1);
}

const date = new Date().toLocaleDateString("en-CA");
writeFileSync(
  file,
  `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\ndraft: true\ndescription: One sentence shown under the title on the blog page.\n---\n\nStart writing here.\n`,
);
console.log(`Created content/blog/${slug}.md (a draft).`);
console.log(`Run npm run dev and open /blog/${slug}`);
