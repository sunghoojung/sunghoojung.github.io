// Turns edited HTML back into Markdown, for the dev-only post editor. The
// editor keeps the original Markdown of every block that was not touched, so
// only changed blocks and pasted content pass through here.

const blockTags = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "UL",
]);
const ignoredTags = new Set([
  "HEAD",
  "META",
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "TITLE",
]);
const blockSelector = [...blockTags].join(",");

// Marks the edges of an italic span until the text around it is known: `_`
// is the house style, but it cannot open or close inside a word.
const italic = "\u0001";

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

export function isBlock(node: Node) {
  return isElement(node) && blockTags.has(node.tagName);
}

// Pictures in public/images/blog/<slug>/ are written by file name.
function pictureName(src: string, slug: string) {
  const folder = `/images/blog/${slug}/`;
  return src.startsWith(folder) ? decodeURI(src.slice(folder.length)) : src;
}

function destination(url: string) {
  return /[\s()<>]/.test(url)
    ? `<${url.replace(/[<>]/g, encodeURIComponent)}>`
    : url;
}

function quotedTitle(title: string | null) {
  return title ? ` "${title.replace(/"/g, '\\"')}"` : "";
}

function escapeText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/[*`~]/g, "\\$&")
    .replace(/_/g, (mark, at: number, all: string) =>
      /\w/.test(all[at - 1] ?? "") && /\w/.test(all[at + 1] ?? "")
        ? mark
        : "\\_",
    )
    .replace(/\](?=[([:])/g, "\\]")
    .replace(/<(?=[a-z/!?])/gi, "\\<")
    .replace(/&(?=#?\w+;)/g, "\\&");
}

// Text at the start of a line that Markdown would read as structure.
function escapeLineStart(line: string) {
  return line
    .replace(/^(#{1,6})(?=\s|$)/, "\\$1")
    .replace(/^>/, "\\>")
    .replace(/^([-+])(?=\s)/, "\\$1")
    .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2")
    .replace(/^(-+|=+)$/, "\\$1");
}

function wrap(content: string, mark: string) {
  const [, before, inner, after] = content.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return inner ? `${before}${mark}${inner}${mark}${after}` : content;
}

function codeSpan(text: string) {
  const code = text.replace(/\u00a0/g, " ").replace(/\s*\n\s*/g, " ");
  if (!code) return "";
  const longest = Math.max(
    0,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = /^`|`$/.test(code) || /^ .* $/.test(code) ? " " : "";
  return `${fence}${pad}${code}${pad}${fence}`;
}

function image(
  img: Element,
  slug: string,
  alt = img.getAttribute("alt") ?? "",
  title = img.getAttribute("title"),
) {
  // Marked reads only balanced brackets inside alt text.
  const text =
    alt.split("[").length === alt.split("]").length
      ? alt
      : alt.replace(/[[\]]/g, "");
  const src = pictureName(img.getAttribute("src") ?? "", slug);
  return `![${text}](${destination(src)}${quotedTitle(title)})`;
}

function inline(node: Node, slug: string): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText((node.textContent ?? "").replace(/\u00a0/g, " "));
  }
  if (!isElement(node) || ignoredTags.has(node.tagName)) return "";
  const tag = node.tagName;
  if (tag === "BR") return "\\\n";
  if (tag === "IMG") return image(node, slug);
  if (tag === "CODE" || tag === "KBD" || tag === "SAMP" || tag === "TT") {
    return codeSpan(node.textContent ?? "");
  }
  if (tag === "INPUT") {
    return (node as HTMLInputElement).type === "checkbox"
      ? (node as HTMLInputElement).checked || node.hasAttribute("checked")
        ? "[x] "
        : "[ ] "
      : "";
  }
  let content = inlineNodes([...node.childNodes], slug);
  if (blockTags.has(tag)) return `\n${content}\n`;
  if (tag === "A") {
    const href = node.getAttribute("href");
    if (!href) return content;
    if (!content.trim()) return "";
    const title = node.getAttribute("title");
    if (!title && node.textContent === href && /^https?:\/\/\S+$/.test(href))
      return href;
    return `[${content}](${destination(href)}${quotedTitle(title)})`;
  }
  const style = node.getAttribute("style") ?? "";
  const bold =
    tag === "B" || tag === "STRONG"
      ? !/font-weight\s*:\s*(normal|[1-5]00)/.test(style)
      : /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
  const italics =
    tag === "EM" || tag === "I" || /font-style\s*:\s*italic/.test(style);
  const strike =
    tag === "DEL" ||
    tag === "S" ||
    tag === "STRIKE" ||
    /text-decoration[^;]*line-through/.test(style);
  if (strike) content = wrap(content, "~~");
  if (italics) content = wrap(content, italic);
  if (bold) content = wrap(content, "**");
  return content;
}

function inlineNodes(nodes: Node[], slug: string) {
  return nodes.map((node) => inline(node, slug)).join("");
}

function resolveItalics(text: string) {
  const parts = text.split(italic);
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) {
    const inner = parts[i];
    const after = parts[i + 1] ?? "";
    const mark = /\w$/.test(out) || /^\w/.test(after) ? "*" : "_";
    out += `${mark}${inner}${mark}${after}`;
  }
  return out;
}

// Inline content as one Markdown paragraph. Line breaks inside it are kept,
// so a hard-wrapped paragraph stays wrapped.
export function paragraph(nodes: Node[], slug: string) {
  const lines = resolveItalics(inlineNodes(nodes, slug))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line && line !== "\\");
  if (lines.length)
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\\$/, "");
  return lines.map(escapeLineStart).join("\n").trim();
}

function oneLine(nodes: Node[], slug: string) {
  return resolveItalics(inlineNodes(nodes, slug))
    .replace(/\\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function list(element: HTMLElement, slug: string) {
  const ordered = element.tagName === "OL";
  let number = Number(element.getAttribute("start") ?? 1) || 1;
  const loose = [...element.children].some((item) =>
    [...item.children].some((child) => child.tagName === "P"),
  );
  const items: string[] = [];
  let marker = "-";
  for (const child of element.childNodes) {
    if (
      isElement(child) &&
      (child.tagName === "UL" || child.tagName === "OL")
    ) {
      // Indenting in a browser can nest a list straight inside a list.
      const nested = list(child, slug);
      if (!nested) continue;
      if (items.length) {
        items[items.length - 1] += `\n${indent(nested, marker.length + 1)}`;
      } else {
        items.push(nested);
      }
      continue;
    }
    if (!isElement(child) && !child.textContent?.trim()) continue;
    marker = ordered ? `${number++}.` : "-";
    const nodes =
      isElement(child) && child.tagName === "LI"
        ? [...child.childNodes]
        : [child];
    const item = listItem(nodes, marker, loose, slug);
    if (item) items.push(item);
  }
  return items.join(loose ? "\n\n" : "\n");
}

function indent(text: string, width: number) {
  const pad = " ".repeat(width);
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

function listItem(nodes: Node[], marker: string, loose: boolean, slug: string) {
  const parts = blocks(nodes, slug);
  if (!parts.length) return "";
  const [first, ...rest] = parts.join(loose ? "\n\n" : "\n").split("\n");
  const pad = marker.length + 1;
  return [
    `${marker} ${first}`,
    ...rest.map((line) => (line ? " ".repeat(pad) + line : line)),
  ].join("\n");
}

function table(element: HTMLElement, slug: string) {
  const rows = [...element.querySelectorAll("tr")].map((row) =>
    [...row.children].filter(
      (cell) => cell.tagName === "TD" || cell.tagName === "TH",
    ),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const cells = rows.map((row) =>
    Array.from({ length: width }, (_, i) =>
      row[i] ? oneLine([...row[i].childNodes], slug).replace(/\|/g, "\\|") : "",
    ),
  );
  const sides = Array.from({ length: width }, (_, i) => {
    const cell = rows[0][i];
    return (
      cell?.getAttribute("align") ??
      (cell as HTMLElement | undefined)?.style.textAlign ??
      ""
    );
  });
  // Columns padded to one width, as Prettier writes tables.
  const widths = sides.map((_, i) =>
    Math.max(3, ...cells.map((row) => row[i].length)),
  );
  const pad = (text: string, i: number) => {
    const room = widths[i] - text.length;
    if (sides[i] === "right") return " ".repeat(room) + text;
    if (sides[i] === "center") {
      const left = Math.floor(room / 2);
      return " ".repeat(left) + text + " ".repeat(room - left);
    }
    return text + " ".repeat(room);
  };
  const rule = sides.map((side, i) => {
    const dashes = "-".repeat(widths[i]);
    if (side === "center") return `:${dashes.slice(2)}:`;
    if (side === "right") return `${dashes.slice(1)}:`;
    if (side === "left") return `:${dashes.slice(1)}`;
    return dashes;
  });
  const line = (row: string[]) => `| ${row.join(" | ")} |`;
  const padded = (row: string[]) => line(row.map(pad));
  return [padded(cells[0]), line(rule), ...cells.slice(1).map(padded)].join(
    "\n",
  );
}

function fence(element: HTMLElement) {
  const code = element.querySelector("code");
  const language = code?.className.match(/language-(\S+)/)?.[1] ?? "";
  const text = (code ?? element).textContent?.replace(/\n$/, "") ?? "";
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const marks = "`".repeat(Math.max(3, longest + 1));
  return `${marks}${language}\n${text}\n${marks}`;
}

export function blockToMarkdown(element: HTMLElement, slug: string): string {
  const tag = element.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const text = oneLine([...element.childNodes], slug);
    return text ? `${"#".repeat(Number(tag[1]))} ${text}` : "";
  }
  if (tag === "UL" || tag === "OL") return list(element, slug);
  if (tag === "LI") return listItem([...element.childNodes], "-", false, slug);
  if (tag === "BLOCKQUOTE") {
    const inner = blocks([...element.childNodes], slug).join("\n\n");
    return inner
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
  }
  if (tag === "PRE") return fence(element);
  if (tag === "TABLE") return table(element, slug);
  if (tag === "HR") return "---";
  if (tag === "FIGURE") {
    const img = element.querySelector("img");
    if (!img) return blocks([...element.childNodes], slug).join("\n\n");
    const caption = (element.querySelector("figcaption")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    // The site captions a figure with the image's title if it has one, and
    // with its alt text if not.
    return element.dataset.caption === "title"
      ? image(img, slug, undefined, caption)
      : image(img, slug, caption);
  }
  if (element.querySelector(blockSelector)) {
    return blocks([...element.childNodes], slug).join("\n\n");
  }
  return paragraph([...element.childNodes], slug);
}

// Markdown for a run of sibling nodes: block elements become blocks, and
// inline content between them becomes paragraphs.
export function blocks(nodes: Node[], slug: string) {
  const out: string[] = [];
  let run: Node[] = [];
  const flush = () => {
    const text = paragraph(run, slug);
    if (text) out.push(text);
    run = [];
  };
  for (const node of nodes) {
    // An inline wrapper around blocks, such as the <b> that Google Docs puts
    // around everything it copies, is only a container.
    const container =
      isElement(node) && !isBlock(node) && node.querySelector(blockSelector);
    if (isBlock(node) || container) {
      flush();
      const text = isBlock(node)
        ? blockToMarkdown(node as HTMLElement, slug)
        : blocks([...node.childNodes], slug).join("\n\n");
      if (text) out.push(text);
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

export function htmlToMarkdown(html: string, slug: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return blocks([...document.body.childNodes], slug).join("\n\n");
}
