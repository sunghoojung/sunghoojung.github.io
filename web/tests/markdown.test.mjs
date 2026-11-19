import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// The post renderer, loaded through Vite so its TypeScript and its imports
// resolve the way the site's build resolves them. Drafts are not exported, so
// code blocks are checked here rather than in out/.
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true },
});
const { renderPost } = await server.ssrLoadModule("/app/blog/markdown.ts");
after(() => server.close());

const block = (fence, code) =>
  renderPost(`${fence}\n${code}\n\`\`\`\n`, "post");

test("code blocks are colored with VS Code's Dark+ theme and labeled", () => {
  const html = block("```python", 'def check():\n    return " yes"');
  assert.match(html, /<pre class="shiki dark-plus"[^>]*data-lang="python"/);
  assert.match(html, /<code class="language-python">/);
  assert.match(html, /<span style="color:#569CD6">def<\/span>/);
  assert.match(html, /<span style="color:#CE9178">\s*" yes"<\/span>/);
  assert.doesNotMatch(html, /<script/);
});

test("language aliases are colored too", () => {
  for (const [fence, label] of [
    ["```py", "py"],
    ["```ts", "ts"],
    ["```bash", "bash"],
    ["```json", "json"],
  ]) {
    assert.match(block(fence, "x"), new RegExp(`data-lang="${label}"`), fence);
  }
});

test("plain and unknown code blocks get no label and stay escaped", () => {
  for (const fence of ["```", "```text", "```cobol"]) {
    const html = block(fence, '<answer>{"op":"submit"}</answer>');
    assert.match(html, /<pre class="shiki dark-plus"/, fence);
    assert.doesNotMatch(html, /data-lang=/, fence);
    assert.doesNotMatch(html, /<answer>/, fence);
    assert.match(html, /answer>\{"op":"submit"\}/, fence);
  }
});
