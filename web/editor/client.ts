import "./editor.css";
import type { Token, TokensList } from "marked";
import {
  frontMatterPattern,
  markdown,
  pointPictures,
  readFrontMatter,
} from "../app/blog/markdown";
import {
  blockToMarkdown,
  htmlToMarkdown,
  isBlock,
  paragraph,
} from "./to-markdown";

// `npm run dev` only (app/blog/[slug]/page.tsx loads it): edits a post on its
// own page and saves it back to content/blog/<slug>.md as you type.
//
// The post is shown block by block with the site's own renderer. Each block
// remembers its Markdown and the HTML it rendered to; on save, a block whose
// HTML is unchanged writes back its original Markdown, byte for byte, and only
// edited blocks are converted from HTML. Code blocks, tables, and raw HTML are
// edited as Markdown: click one to open it.
//
// React owns the server-rendered post and re-renders it whenever a post file
// changes (each save hot-reloads it), so the editor hides it and edits a copy
// of its own.

type Block = {
  id: string;
  // The block's Markdown as written in the file.
  md: string;
  // The blank lines after it, up to the next block.
  gap: string;
  next?: string;
  // Whether it is the last block of the file.
  end?: boolean;
  // The HTML it rendered to; an element that still matches it is unchanged.
  snapshot: string;
};

type State = "saved" | "unsaved" | "saving" | "error" | "conflict";

const slug = decodeURIComponent(
  location.pathname.match(/^\/blog\/([^/]+?)\/?$/)?.[1] ?? "",
);
const page = document.querySelector<HTMLElement>("main article.post");
const title = element("h1");
const body = element("div", { className: "post-body" });
const article = element(
  "article",
  { className: "post pe-article" },
  title,
  body,
);
const api = `/__post-editor/post/${encodeURIComponent(slug)}`;
const headers = { "x-post-editor": "1" };

const blocks = new Map<string, Block>();
let links: TokensList["links"] = {};
let lead = "";
let frontMatter = "";
let fields: Record<string, string> = {};
let version = "";
let saved = "";
let blockCount = 0;
let markdownView: HTMLTextAreaElement | null = null;
let conflict: { source: string; version: string } | null = null;
let state: State = "saved";
let timer = 0;
let queue = Promise.resolve();
let leaving = false;
let plainPaste = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---- Rendering ------------------------------------------------------------

// Blocks that cannot be edited as rich text, or that hold something that
// would not survive the trip back to Markdown.
function editedAsSource(token: Token): boolean {
  if (["code", "table", "html", "def"].includes(token.type)) return true;
  const { tokens, items } = token as { tokens?: Token[]; items?: Token[] };
  return [...(tokens ?? []), ...(items ?? [])].some(editedAsSource);
}

function present(token: Token) {
  const template = document.createElement("template");
  template.innerHTML = markdown.parser(
    Object.assign([token], { links }) as TokensList,
  );
  const nodes = [...template.content.childNodes].filter(
    (node) => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim(),
  );
  let view: HTMLElement;
  if (nodes.length === 1 && nodes[0] instanceof HTMLElement) {
    view = nodes[0];
  } else {
    view = element("div");
    if (nodes.length) {
      view.append(...nodes);
    } else {
      // Renders to nothing, such as a link definition: show the Markdown.
      view.className = "pe-raw";
      view.append(element("pre", { textContent: token.raw.trim() }));
    }
  }
  if (view.tagName === "FIGURE") {
    view.contentEditable = "false";
    view.classList.add("pe-figure");
    const caption =
      view.querySelector("figcaption") ??
      view.appendChild(element("figcaption"));
    caption.contentEditable = "true";
    caption.dataset.placeholder = "Add a caption";
    // The caption came from the image's title; edits go back there.
    const image = (token as { tokens?: Token[] }).tokens?.[0];
    if (image?.type === "image" && image.title) view.dataset.caption = "title";
  } else if (editedAsSource(token) || view.tagName === "DIV") {
    view.contentEditable = "false";
    view.classList.add("pe-island");
    view.title = "Click to edit as Markdown";
  }
  return view;
}

// Markdown to elements, each tied to a Block that remembers its Markdown.
function build(source: string, whole = false) {
  const tokens = markdown.lexer(source);
  markdown.walkTokens(tokens, pointPictures(slug));
  links = whole ? tokens.links : { ...links, ...tokens.links };
  const elements: HTMLElement[] = [];
  let before = "";
  let previous: Block | undefined;
  for (const token of tokens) {
    if (token.type === "space") {
      if (previous) previous.gap += token.raw;
      else before += token.raw;
      continue;
    }
    const md = token.raw.replace(/\s+$/, "");
    const block: Block = {
      id: `b${blockCount++}`,
      md,
      gap: token.raw.slice(md.length),
      snapshot: "",
    };
    if (previous) previous.next = block.id;
    const view = present(token);
    view.dataset.b = block.id;
    block.snapshot = view.outerHTML;
    blocks.set(block.id, block);
    elements.push(view);
    previous = block;
  }
  if (whole && previous) previous.end = true;
  return { elements, before };
}

function load(source: string) {
  const match = source.match(frontMatterPattern);
  if (!match)
    throw new Error("The file must begin with a --- front matter block.");
  frontMatter = source.slice(0, source.length - match[2].length);
  fields = readFrontMatter(match[1]);
  blocks.clear();
  const { elements, before } = build(match[2], true);
  lead = before;
  body.replaceChildren(...elements);
  title.textContent = fields.title ?? "";
  settings.fill();
}

// ---- Back to Markdown -----------------------------------------------------

function markdownOf(view: HTMLElement) {
  const block = blocks.get(view.dataset.b ?? "");
  return block && view.outerHTML === block.snapshot
    ? block.md
    : blockToMarkdown(view, slug);
}

function bodyMarkdown() {
  const parts: { md: string; block?: Block }[] = [];
  const used = new Set<string>();
  let run: Node[] = [];
  const flush = () => {
    const md = paragraph(run, slug);
    if (md) parts.push({ md });
    run = [];
  };
  for (const node of body.childNodes) {
    const isView =
      node instanceof HTMLElement &&
      (isBlock(node) ||
        node.dataset.b !== undefined ||
        node.classList.contains("pe-source"));
    if (!isView) {
      if (node.nodeType === Node.COMMENT_NODE) continue;
      if (!run.length && !node.textContent?.trim()) continue;
      run.push(node);
      continue;
    }
    flush();
    if (node.classList.contains("pe-source")) {
      const md = node.querySelector("textarea")!.value.trim();
      if (md) parts.push({ md });
      continue;
    }
    const block = blocks.get(node.dataset.b ?? "");
    if (block && !used.has(block.id) && node.outerHTML === block.snapshot) {
      used.add(block.id);
      parts.push({ md: block.md, block });
      continue;
    }
    const md = blockToMarkdown(node, slug).trim();
    if (md) parts.push({ md });
  }
  flush();
  let out = lead;
  parts.forEach((part, i) => {
    const following = parts[i + 1];
    out += part.md;
    if (following) {
      // Neighbours in the file keep the blank lines they had.
      const neighbours =
        part.block && following.block && part.block.next === following.block.id;
      out += neighbours ? part.block!.gap : "\n\n";
    } else {
      out += part.block?.end ? part.block.gap : "\n";
    }
  });
  return out;
}

// A value as the site's front matter reader and YAML both read it.
function yamlValue(value: string) {
  if (/^[\w(][^:#'"]*$/.test(value) && !/\s$/.test(value)) return value;
  if (!/["\\]/.test(value)) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return value;
}

function setField(text: string, key: string, value: string | null) {
  const lines = text.split("\n");
  const end = lines.indexOf("---", 1);
  const at = lines.findIndex(
    (line, i) => i > 0 && i < end && new RegExp(`^${key}\\s*:`).test(line),
  );
  if (value === null) {
    if (at > 0) lines.splice(at, 1);
  } else if (at > 0) {
    lines[at] = `${key}: ${value}`;
  } else {
    lines.splice(end, 0, `${key}: ${value}`);
  }
  return lines.join("\n");
}

function frontMatterNow() {
  let text = frontMatter;
  const now = settings.values();
  const heading = title.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (heading && heading !== (fields.title ?? ""))
    text = setField(text, "title", yamlValue(heading));
  if (/^\d{4}-\d{2}-\d{2}$/.test(now.date) && now.date !== fields.date) {
    text = setField(text, "date", now.date);
  }
  if (now.draft !== (fields.draft === "true"))
    text = setField(text, "draft", now.draft ? "true" : null);
  for (const key of ["description", "thumbnail"] as const) {
    if (now[key] !== (fields[key] ?? "")) {
      text = setField(text, key, now[key] ? yamlValue(now[key]) : null);
    }
  }
  return text;
}

function serialize() {
  return markdownView ? markdownView.value : frontMatterNow() + bodyMarkdown();
}

// ---- Saving ---------------------------------------------------------------

function setStatus(next: State, text?: string) {
  state = next;
  status.dataset.state = next;
  status.textContent =
    text ??
    {
      saved: "Saved",
      unsaved: "Editing…",
      saving: "Saving…",
      error: "",
      conflict: "",
    }[next];
  conflictTools.hidden = next !== "conflict";
}

function changed() {
  if (conflict) return;
  if (state !== "error") setStatus("unsaved");
  clearTimeout(timer);
  timer = window.setTimeout(save, 600);
}

async function write() {
  if (conflict) return;
  let source: string;
  try {
    source = serialize();
  } catch (error) {
    return setStatus(
      "error",
      `Could not read the page: ${(error as Error).message}`,
    );
  }
  if (source === saved) {
    if (state !== "error") setStatus("saved");
    return;
  }
  setStatus("saving");
  try {
    const response = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ source, version }),
    });
    const result = await response.json();
    if (response.status === 409) {
      conflict = result;
      return setStatus("conflict", "The file changed on disk.");
    }
    if (!response.ok)
      return setStatus(
        "error",
        result.error ?? `Save failed (${response.status}).`,
      );
    version = result.version;
    saved = source;
    setStatus(serialize() === saved ? "saved" : "unsaved");
  } catch {
    setStatus(
      "error",
      "Could not reach the dev server. Is npm run dev running?",
    );
  }
}

function save() {
  clearTimeout(timer);
  queue = queue.then(write);
  return queue;
}

function resolveConflict(keepMine: boolean) {
  if (!conflict) return;
  const disk = conflict;
  conflict = null;
  version = disk.version;
  if (keepMine) return void save();
  if (markdownView) markdownView.value = disk.source;
  else load(disk.source);
  saved = disk.source;
  setStatus("saved");
}

async function finish() {
  await save();
  if (
    serialize() !== saved &&
    !confirm("Some changes are not saved. Leave anyway?")
  )
    return;
  leaving = true;
  // Without ?edit. If the editor saved, the server restarts before serving it.
  location.href = location.pathname;
}

// ---- Selection helpers ----------------------------------------------------

function selectionRange() {
  const selection = getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return body.contains(range.commonAncestorContainer) ? range : null;
}

function restore(range: Range) {
  body.focus({ preventScroll: true });
  const selection = getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function closestIn(node: Node | null, selector: string) {
  const start = node instanceof Element ? node : node?.parentElement;
  const found = start?.closest<HTMLElement>(selector);
  return found && body.contains(found) ? found : null;
}

// The child of the post body that holds a node.
function topLevel(node: Node | null) {
  while (node && node.parentNode !== body) node = node.parentNode;
  return node instanceof HTMLElement ? node : null;
}

function inSource(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(".pe-source");
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
  changed();
  updateToolbar();
}

// ---- Formatting -----------------------------------------------------------

function setBlock(tag: "p" | "h1" | "h2" | "h3") {
  const range = selectionRange();
  if (!range) return;
  const heading = closestIn(range.startContainer, "h1,h2,h3,h4,h5,h6");
  exec(
    "formatBlock",
    `<${heading?.tagName.toLowerCase() === tag ? "p" : tag}>`,
  );
}

function toggleQuote() {
  const range = selectionRange();
  if (!range) return;
  const quote = closestIn(range.startContainer, "blockquote");
  if (!quote) return exec("formatBlock", "<blockquote>");
  const out: Node[] = [];
  let run: Node[] = [];
  const flush = () => {
    if (run.some((node) => node.textContent?.trim()))
      out.push(element("p", {}, ...run));
    run = [];
  };
  for (const node of [...quote.childNodes]) {
    if (isBlock(node)) {
      flush();
      out.push(node);
    } else {
      run.push(node);
    }
  }
  flush();
  quote.replaceWith(...out);
  changed();
}

function toggleCode() {
  const range = selectionRange();
  if (!range) return;
  const code = closestIn(range.startContainer, "code");
  if (code && !code.closest("pre")) {
    code.replaceWith(document.createTextNode(code.textContent ?? ""));
    return changed();
  }
  const text = range.toString();
  if (text) exec("insertHTML", `<code>${escapeHtml(text)}</code>`);
}

function editLink() {
  const range = selectionRange();
  if (!range) return;
  const kept = range.cloneRange();
  const anchor = closestIn(range.startContainer, "a");
  const box = (
    range.collapsed && anchor ? anchor : range
  ).getBoundingClientRect();
  linkInput.value = anchor?.getAttribute("href") ?? "";
  linkRemove.hidden = !anchor;
  popover.hidden = false;
  popover.style.top = `${box.bottom + scrollY + 8}px`;
  popover.style.left = `${Math.max(8, Math.min(box.left + scrollX, innerWidth - popover.offsetWidth - 8))}px`;
  linkInput.focus();
  linkInput.select();
  popover.onsubmit = (event) => {
    event.preventDefault();
    const url = linkInput.value.trim();
    popover.hidden = true;
    restore(kept);
    if (!url) {
      if (anchor) unlink(anchor);
    } else if (anchor) {
      anchor.setAttribute("href", url);
      changed();
    } else if (kept.collapsed) {
      exec("insertHTML", `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    } else {
      exec("createLink", url);
    }
  };
  linkRemove.onclick = () => {
    popover.hidden = true;
    restore(kept);
    if (anchor) unlink(anchor);
  };
  linkInput.onkeydown = (event) => {
    if (event.key === "Escape") {
      popover.hidden = true;
      restore(kept);
    }
  };
}

function unlink(anchor: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(anchor);
  restore(range);
  exec("unlink");
}

// Typing a Markdown marker and a space at the start of a paragraph.
function autoformat() {
  const selection = getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode) return false;
  const block = topLevel(selection.anchorNode);
  if (block?.tagName !== "P") return false;
  const before = document.createRange();
  before.setStart(block, 0);
  before.setEnd(selection.anchorNode, selection.anchorOffset);
  const action = (
    {
      "#": "<h1>",
      "##": "<h2>",
      "###": "<h3>",
      ">": "<blockquote>",
      "-": "ul",
      "*": "ul",
      "1.": "ol",
    } as Record<string, string>
  )[before.toString()];
  if (!action) return false;
  selection.removeAllRanges();
  selection.addRange(before);
  document.execCommand("delete");
  if (action === "ul") exec("insertUnorderedList");
  else if (action === "ol") exec("insertOrderedList");
  else exec("formatBlock", action);
  return true;
}

// ```, optionally with a language, then Enter: a code block.
function fenceShortcut() {
  const block = topLevel(getSelection()?.anchorNode ?? null);
  const match =
    block?.tagName === "P" && block.textContent?.trim().match(/^```(\S*)$/);
  if (!block || !match) return false;
  const box = sourceBox(`\`\`\`${match[1]}\n\n\`\`\``);
  block.replaceWith(box);
  openBox(box, match[0].length + 1);
  changed();
  return true;
}

// ---- Blocks edited as Markdown --------------------------------------------

function fit(area: HTMLTextAreaElement) {
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight + 2}px`;
}

function sourceBox(md: string) {
  const area = element("textarea", { value: md, spellcheck: false });
  area.setAttribute("aria-label", "Markdown");
  const done = element("button", { type: "button", textContent: "Done" });
  const box = element(
    "div",
    { className: "pe-source", contentEditable: "false" },
    area,
    element(
      "div",
      { className: "pe-source-bar" },
      "Markdown · Esc when done",
      done,
    ),
  );
  area.addEventListener("input", () => {
    fit(area);
    changed();
  });
  area.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" ||
      (event.key === "Enter" && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      closeBox(box);
    }
  });
  area.addEventListener("blur", () => closeBox(box));
  done.addEventListener("mousedown", (event) => event.preventDefault());
  done.addEventListener("click", () => closeBox(box));
  return box;
}

function openBox(box: HTMLElement, caret?: number) {
  const area = box.querySelector("textarea")!;
  fit(area);
  area.focus();
  if (caret !== undefined) area.setSelectionRange(caret, caret);
}

function openSource(view: HTMLElement) {
  hideChrome();
  const box = sourceBox(markdownOf(view));
  view.replaceWith(box);
  openBox(box);
}

const closed = new WeakSet<HTMLElement>();

function closeBox(box: HTMLElement) {
  // Removing the box blurs its textarea, which would close it again.
  if (closed.has(box) || !box.isConnected) return;
  closed.add(box);
  const { elements } = build(box.querySelector("textarea")!.value.trim());
  if (elements.length) box.replaceWith(...elements);
  else box.remove();
  changed();
}

// ---- Inserting ------------------------------------------------------------

function insertBlocks(elements: HTMLElement[]) {
  const range = selectionRange();
  const top = range && topLevel(range.startContainer);
  if (!range || !top) {
    body.append(...elements);
  } else if (
    top.tagName === "P" &&
    !top.textContent?.trim() &&
    !top.querySelector("img")
  ) {
    top.replaceWith(...elements);
  } else if (top.tagName === "P") {
    // Split the paragraph at the cursor.
    range.deleteContents();
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(top, top.childNodes.length);
    const rest = element("p", {}, tail.extractContents());
    top.after(...elements, ...(rest.textContent?.trim() ? [rest] : []));
    if (!top.textContent?.trim()) top.remove();
  } else {
    top.after(...elements);
  }
  changed();
}

function insertMarkdown(md: string) {
  const tokens = markdown.lexer(md).filter((token) => token.type !== "space");
  if (!tokens.length) return;
  if (tokens.length === 1 && tokens[0].type === "paragraph") {
    markdown.walkTokens(tokens, pointPictures(slug));
    const html = markdown
      .parser(Object.assign(tokens, { links }) as TokensList)
      .trim();
    if (html.startsWith("<p>")) return exec("insertHTML", html.slice(3, -4));
  }
  insertBlocks(build(md).elements);
}

const pictureExtensions: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

function caretInto(target: HTMLElement) {
  target.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

async function addPictures(files: File[]) {
  let at = selectionRange()?.cloneRange();
  for (const file of files) {
    const name =
      file.name && file.name !== "image.png"
        ? file.name
        : `pasted-${new Date().toISOString().slice(0, 19).replace(/\D/g, "")}.${pictureExtensions[file.type] ?? "png"}`;
    setStatus("saving", `Adding ${name}…`);
    try {
      const response = await fetch(
        `/__post-editor/picture/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`,
        { method: "POST", headers, body: file },
      );
      const result = await response.json();
      if (!response.ok) return setStatus("error", result.error);
      if (at) restore(at);
      at = undefined;
      const { elements } = build(`![](${result.name})`);
      insertBlocks(elements);
      // Ready for a caption; the next picture goes after this one.
      const caption = elements[0]?.querySelector<HTMLElement>("figcaption");
      if (caption) caretInto(caption);
    } catch {
      return setStatus("error", "Could not reach the dev server.");
    }
  }
}

// ---- Page furniture -------------------------------------------------------

const status = element("span", { className: "pe-status" });
status.setAttribute("role", "status");
const conflictTools = element(
  "span",
  { hidden: true },
  element("button", {
    type: "button",
    textContent: "Load it",
    onclick: () => resolveConflict(false),
  }),
  element("button", {
    type: "button",
    textContent: "Keep mine",
    onclick: () => resolveConflict(true),
  }),
);
const toolbar = element("div", { className: "pe-toolbar" });
toolbar.setAttribute("role", "toolbar");
toolbar.setAttribute("aria-label", "Formatting");
const stateful: [HTMLButtonElement, () => boolean][] = [];
const formatting: HTMLButtonElement[] = [];

function tool(
  label: string,
  hint: string,
  action: () => void,
  options: { className?: string; on?: () => boolean; rich?: boolean } = {},
) {
  const button = element("button", {
    type: "button",
    textContent: label,
    title: hint,
  });
  if (options.className) button.className = options.className;
  button.setAttribute("aria-label", hint);
  // Keep the cursor where it is.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", action);
  if (options.on) stateful.push([button, options.on]);
  if (options.rich !== false) formatting.push(button);
  return button;
}

const sep = () => element("span", { className: "pe-sep" });
const isIn = (selector: string) => () =>
  !!closestIn(selectionRange()?.startContainer ?? null, selector);
const command = (name: string) => () =>
  !!selectionRange() && document.queryCommandState(name);
const pictureInput = element("input", {
  type: "file",
  accept: "image/*",
  multiple: true,
  hidden: true,
});
let pictureRange: Range | undefined;
pictureInput.addEventListener("change", () => {
  if (pictureRange) restore(pictureRange);
  void addPictures([...(pictureInput.files ?? [])]);
  pictureInput.value = "";
});
const markdownButton = tool(
  "Markdown",
  "Edit the whole file as Markdown",
  () => toggleMarkdown(),
  {
    rich: false,
  },
);

toolbar.append(
  tool("Text", "Normal text (Ctrl+Alt+0)", () => setBlock("p")),
  tool("H2", "Heading (Ctrl+Alt+2)", () => setBlock("h2"), { on: isIn("h2") }),
  tool("H3", "Subheading (Ctrl+Alt+3)", () => setBlock("h3"), {
    on: isIn("h3"),
  }),
  sep(),
  tool("B", "Bold (Ctrl+B)", () => exec("bold"), {
    className: "pe-bold",
    on: command("bold"),
  }),
  tool("I", "Italic (Ctrl+I)", () => exec("italic"), {
    className: "pe-italic",
    on: command("italic"),
  }),
  tool("<>", "Code (Ctrl+Shift+E)", toggleCode, {
    className: "pe-mono",
    on: isIn("code"),
  }),
  tool("Link", "Link (Ctrl+K)", editLink, { on: isIn("a") }),
  sep(),
  tool("•", "Bulleted list (Ctrl+Shift+8)", () => exec("insertUnorderedList"), {
    className: "pe-bullet",
    on: isIn("ul"),
  }),
  tool("1.", "Numbered list (Ctrl+Shift+7)", () => exec("insertOrderedList"), {
    on: isIn("ol"),
  }),
  tool("Quote", "Quote", toggleQuote, { on: isIn("blockquote") }),
  sep(),
  tool("Image", "Add a picture (or paste or drop one)", () => {
    pictureRange = selectionRange()?.cloneRange();
    pictureInput.click();
  }),
  tool("{ }", "Code block (or type ``` and Enter)", () => {
    const box = sourceBox("```\n\n```");
    insertBlocks([box]);
    openBox(box, 4);
  }),
  tool("Table", "Table", () => {
    const box = sourceBox(
      "| Column | Column |\n| --- | --- |\n| Cell | Cell |",
    );
    insertBlocks([box]);
    openBox(box);
  }),
  element(
    "span",
    { className: "pe-end" },
    status,
    conflictTools,
    markdownButton,
    tool("Done", "Stop editing and show the page", finish, {
      className: "pe-done",
      rich: false,
    }),
  ),
  pictureInput,
);

function updateToolbar() {
  for (const [button, on] of stateful) button.classList.toggle("pe-on", on());
}

const settings = (() => {
  const date = element("input", { type: "date" });
  const draft = element("input", { type: "checkbox" });
  const description = element("textarea", {
    rows: 2,
    placeholder: "One sentence shown under the title on the blog page",
  });
  const thumbnail = element("input", {
    placeholder: "A picture's file name, shown on the blog page",
  });
  const panel = element(
    "div",
    { className: "pe-settings" },
    element("label", {}, "Date", date),
    element(
      "label",
      { className: "pe-check" },
      draft,
      "Draft (shown only under npm run dev)",
    ),
    element("label", { className: "pe-wide" }, "Description", description),
    element("label", { className: "pe-wide" }, "Thumbnail", thumbnail),
  );
  panel.addEventListener("input", changed);
  description.addEventListener("input", () => fit(description));
  return {
    panel,
    fill() {
      date.value = fields.date ?? "";
      draft.checked = fields.draft === "true";
      description.value = fields.description ?? "";
      thumbnail.value = fields.thumbnail ?? "";
      fit(description);
    },
    values() {
      return {
        date: date.value,
        draft: draft.checked,
        description: description.value.replace(/\s+/g, " ").trim(),
        thumbnail: thumbnail.value.trim(),
      };
    },
  };
})();

const linkInput = element("input", {
  placeholder: "Paste a link, or #a-heading",
});
const linkRemove = element("button", { type: "button", textContent: "Remove" });
const popover = element(
  "form",
  { className: "pe-popover", hidden: true },
  linkInput,
  element("button", { type: "submit", textContent: "Apply" }),
  linkRemove,
);

// Shown over a picture, code block, or table under the pointer.
let chromeTarget: HTMLElement | null = null;
const chrome = element(
  "div",
  { className: "pe-chrome", hidden: true },
  element("button", {
    type: "button",
    textContent: "Edit Markdown",
    onclick: () => chromeTarget && openSource(chromeTarget),
  }),
  element("button", {
    type: "button",
    textContent: "Remove",
    onclick: () => {
      chromeTarget?.remove();
      hideChrome();
      changed();
    },
  }),
);

function showChrome(target: HTMLElement) {
  chromeTarget = target;
  chrome.hidden = false;
  // Inside the block's corner, so the pointer can reach it without leaving.
  const box = target.getBoundingClientRect();
  chrome.style.top = `${box.top + scrollY + 8}px`;
  chrome.style.left = `${box.right + scrollX - chrome.offsetWidth - 8}px`;
}

function hideChrome() {
  chromeTarget = null;
  chrome.hidden = true;
}

function toggleMarkdown() {
  if (!markdownView) {
    const area = element("textarea", {
      className: "pe-markdown",
      value: serialize(),
      spellcheck: false,
    });
    area.setAttribute("aria-label", "The post as Markdown");
    area.addEventListener("input", changed);
    article.hidden = true;
    article.after(area);
    markdownView = area;
    markdownButton.textContent = "Page";
    markdownButton.title = "Back to editing the page";
    area.focus();
  } else {
    try {
      load(markdownView.value);
    } catch (error) {
      return setStatus("error", (error as Error).message);
    }
    markdownView.remove();
    markdownView = null;
    article.hidden = false;
    markdownButton.textContent = "Markdown";
    markdownButton.title = "Edit the whole file as Markdown";
  }
  for (const button of formatting) button.disabled = !!markdownView;
}

// ---- Events ---------------------------------------------------------------

function listen() {
  body.addEventListener("input", (event) => {
    if (!inSource(event.target)) changed();
  });

  body.addEventListener("keydown", (event) => {
    if (inSource(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const anchor = getSelection()?.anchorNode ?? null;
    if (closestIn(anchor, "figcaption") && event.key === "Enter")
      return event.preventDefault();
    if (mod && event.altKey) {
      const level = (
        { Digit0: "p", Digit1: "h1", Digit2: "h2", Digit3: "h3" } as Record<
          string,
          "p" | "h1" | "h2" | "h3"
        >
      )[event.code];
      if (level) {
        event.preventDefault();
        setBlock(level);
      }
      return;
    }
    if (
      mod &&
      event.shiftKey &&
      (event.code === "Digit7" || event.code === "Digit8")
    ) {
      event.preventDefault();
      return exec(
        event.code === "Digit7" ? "insertOrderedList" : "insertUnorderedList",
      );
    }
    if (event.altKey && event.shiftKey && event.code === "Digit5") {
      event.preventDefault();
      return exec("strikeThrough");
    }
    if (mod && event.shiftKey && key === "e") {
      event.preventDefault();
      return toggleCode();
    }
    if (mod && key === "k") {
      event.preventDefault();
      return editLink();
    }
    // Markdown has no underline.
    if (mod && key === "u") return event.preventDefault();
    if (mod && key === "\\") {
      event.preventDefault();
      return exec("removeFormat");
    }
    if (mod && event.shiftKey && key === "v") plainPaste = true;
    if (event.key === "Tab" && closestIn(anchor, "li")) {
      event.preventDefault();
      return exec(event.shiftKey ? "outdent" : "indent");
    }
    if (event.key === " " && !mod && autoformat())
      return event.preventDefault();
    if (event.key === "Enter" && !event.shiftKey && fenceShortcut())
      return event.preventDefault();
  });

  body.addEventListener("paste", (event) => {
    if (inSource(event.target) || !event.clipboardData) return;
    event.preventDefault();
    const data = event.clipboardData;
    const pictures = [...data.files].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (pictures.length) return void addPictures(pictures);
    const text = data.getData("text/plain");
    const html = data.getData("text/html");
    const caption = closestIn(getSelection()?.anchorNode ?? null, "figcaption");
    if (caption || plainPaste) {
      plainPaste = false;
      document.execCommand(
        "insertText",
        false,
        caption ? text.replace(/\s+/g, " ") : text,
      );
      return changed();
    }
    insertMarkdown(html ? htmlToMarkdown(html, slug) : text);
  });

  body.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  body.addEventListener("drop", (event) => {
    const pictures = [...(event.dataTransfer?.files ?? [])].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!pictures.length) return;
    event.preventDefault();
    const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (at) restore(at);
    void addPictures(pictures);
  });

  body.addEventListener("click", (event) => {
    const island = (event.target as Element).closest?.<HTMLElement>(
      ".pe-island",
    );
    if (island?.parentElement === body) openSource(island);
  });

  document.addEventListener("mouseover", (event) => {
    const target = event.target as Element;
    if (chrome.contains(target)) return;
    const view = target.closest?.<HTMLElement>(".pe-island, .pe-figure");
    if (view?.parentElement === body) showChrome(view);
    else if (chromeTarget) hideChrome();
  });

  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      body.focus();
    }
  });
  title.addEventListener("input", changed);
  title.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text.replace(/\s+/g, " "));
  });

  document.addEventListener("selectionchange", updateToolbar);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  });
  addEventListener("beforeunload", (event) => {
    if (leaving || (!conflict && serialize() === saved)) return;
    void save();
    event.preventDefault();
  });
}

// ---- Start ----------------------------------------------------------------

async function start() {
  editButton.remove();
  let result: { source?: string; version?: string; error?: string };
  try {
    const response = await fetch(api, { headers });
    result = await response.json();
    if (!response.ok) throw new Error(result.error);
  } catch (error) {
    alert(`Could not open the post: ${(error as Error).message}`);
    return document.body.append(editButton);
  }
  version = result.version!;
  saved = result.source!;
  history.replaceState(null, "", `${location.pathname}?edit`);
  document.execCommand("defaultParagraphSeparator", false, "p");
  document.execCommand("enableObjectResizing", false, "false");
  page!.hidden = true;
  page!.before(toolbar);
  page!.after(article);
  article.insertBefore(settings.panel, body);
  document.body.append(popover, chrome);
  load(saved);
  try {
    title.contentEditable = "plaintext-only";
  } catch {
    title.contentEditable = "true";
  }
  body.contentEditable = "true";
  setStatus("saved");
  listen();
}

const editButton = element("button", {
  type: "button",
  className: "pe-edit",
  textContent: "Edit post",
});
editButton.addEventListener("click", () => void start());

// Change the page only once React has hydrated it, or React would see a
// mismatch and render it again from scratch.
async function hydrated(target: HTMLElement) {
  for (let waited = 0; waited < 4000; waited += 50) {
    if (Object.keys(target).some((key) => key.startsWith("__react"))) return;
    await sleep(50);
  }
}

if (slug && page) {
  void hydrated(page).then(() => {
    if (new URLSearchParams(location.search).has("edit")) void start();
    else document.body.append(editButton);
  });
}
