import { Marked, type Token } from "marked";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import python from "shiki/langs/python.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import darkPlus from "shiki/themes/dark-plus.mjs";

// How a post's Markdown becomes HTML. The site (posts.ts) and the dev-only
// editor (editor/client.ts) both use this, so the editor shows a post exactly
// as the site renders it.

export { frontMatterPattern, readFrontMatter } from "./front-matter";

// Code blocks are colored the way VS Code colors them, with its grammars and
// its Dark+ theme. The colors are written into the HTML when the page is
// built, so no script ships. A block in another language, or none, keeps the
// theme's plain text color.
const highlighter = createHighlighterCoreSync({
  themes: [darkPlus],
  langs: [javascript, json, python, shellscript, tsx, typescript],
  engine: createJavaScriptRegexEngine(),
});
const plainText = ["", "text", "txt", "plain", "plaintext"];

function highlight(text: string, lang?: string) {
  const name = (lang ?? "").trim().split(/\s+/)[0].toLowerCase();
  const known =
    !plainText.includes(name) &&
    highlighter.getLoadedLanguages().includes(name);
  return highlighter.codeToHtml(text, {
    lang: known ? name : "text",
    theme: "dark-plus",
    transformers: [
      {
        // The language label (globals.css shows it), and the class the
        // editor reads back when it turns a block into Markdown.
        pre(node) {
          if (known) node.properties["data-lang"] = name;
        },
        code(node) {
          if (name) node.properties.class = `language-${name}`;
        },
      },
    ],
  });
}

// Pictures are written by file name (fig1.png) and live in
// public/images/blog/<slug>/. Paths and full URLs are left alone.
export function pictureUrl(href: string, slug: string) {
  return /^(\/|[a-z]+:)/i.test(href) ? href : `/images/blog/${slug}/${href}`;
}

export function pointPictures(slug: string) {
  return (token: Token) => {
    if (token.type === "image") token.href = pictureUrl(token.href, slug);
  };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function picture(href: string, alt: string, title?: string | null) {
  const tooltip = title ? ` title="${escapeHtml(title)}"` : "";
  return `<img src="${href}" alt="${escapeHtml(alt)}"${tooltip} loading="lazy">`;
}

export const markdown = new Marked({
  renderer: {
    // Headings get ids, so a link such as [results](#results) can jump to them.
    heading({ tokens, depth }) {
      const id = headingId(tokens);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    // An image alone on a line becomes a figure. Its caption is the image's
    // title, as in ![Alt text](chart.png "Caption"), or else its alt text.
    paragraph({ tokens }) {
      const [only] = tokens;
      if (tokens.length === 1 && only.type === "image") {
        const img = picture(only.href, only.text);
        const caption = escapeHtml(only.title || only.text);
        return `<figure>${img}<figcaption>${caption}</figcaption></figure>\n`;
      }
      return `<p>${this.parser.parseInline(tokens)}</p>\n`;
    },
    image({ href, title, text }) {
      return picture(href, text, title);
    },
    code({ text, lang }) {
      return `${highlight(text, lang)}\n`;
    },
  },
});

export function renderPost(body: string, slug: string) {
  return markdown
    .parse(body, {
      async: false,
      walkTokens: pointPictures(slug),
    })
    .replace("<!-- contents -->", () => contents(body));
}
