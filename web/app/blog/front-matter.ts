// The --- block at the top of a post. Its own file because the dev server's
// config loads it (editor/server.ts checks posts before saving them), and
// Vite restarts the dev server whenever a file the config loads changes.

export const frontMatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// The `key: value` lines of a front matter block. Surrounding quotes are
// dropped; other lines, such as list items, are ignored.
export function readFrontMatter(block: string) {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    fields[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}
