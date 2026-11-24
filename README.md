# Sunghoo Website

A small personal site with four pages: About, Publications (with a Google
Scholar embed), Projects, and Blog. It is text first, follows the visitor's
light or dark setting, and ships no scripts.

The application lives in `web`.

- `web/app/page.tsx` is the About page; its text is written there.
- `web/app/content.ts` holds the profile links, publications, and projects.
- `web/app/publications/page.tsx`, `web/app/projects/page.tsx`, and
  `web/app/blog` render the other pages inside the shared header and footer in
  `web/app/site-shell.tsx`. `web/app/globals.css` styles them.
- `web/public/images` holds the profile photo and project images.
- `web/editor` is the post editor, which exists only under `npm run dev`.

Content sources and the list of excluded material are in
[`docs/project-sources.md`](docs/project-sources.md).

## Writing a blog post

Each post is one Markdown file in `web/content/blog`; the file name is the
address (`my-post.md` is `/blog/my-post`). From `web`:

```sh
npm run dev   # open http://localhost:3000/blog
```

A new post starts with `draft: true` in its front matter. A draft appears only
under `npm run dev` (marked "Draft"); builds leave out its page, its link, and
its pictures. To publish, untick Draft (or delete the `draft: true` line), then
commit and push to `main`.

### Editing on the page

Under `npm run dev`, each post has an **Edit post** button, and the blog page
has **Edit** links and a **New post** form. Click into the post and type: it
saves to the Markdown file as you go, and **Done** shows the finished page.

- Format with the toolbar or the usual keys: Ctrl+B, Ctrl+I, Ctrl+K (link),
  Ctrl+Alt+2 and 3 (headings), Ctrl+Shift+8 and 7 (lists). Typing `## `, `- `,
  `1. ` or `> ` at the start of a paragraph works too, and ` ``` ` then Enter
  starts a code block.
- Paste or drop a picture, or use **Image**. It is saved in
  `web/public/images/blog/<post>/` and added as a figure; type its caption under
  it.
- Pasted text keeps its bold, italics, links, lists, and headings, including
  from Google Docs. Ctrl+Shift+V pastes plain text.
- Code blocks and tables open as Markdown when clicked. **Markdown** edits the
  whole file, front matter included.
- The date, draft setting, description, and thumbnail sit under the title.

Only the paragraphs you change are rewritten; the rest of the file stays exactly
as it was. If the file changes on disk while you edit, the editor asks before
overwriting it. You can still edit the files in any editor (or create one with
`npm run new-post -- "My post title"`); an open page updates when you save.
None of the editor is in the built site.

The top of a post is `title`, `date` (`YYYY-MM-DD`), an optional `description`
for the blog list, an optional `thumbnail` (a picture's file name, shown on the
blog list), and `draft: true` while it is unfinished. Posts are listed newest
first. Files whose names begin with an underscore, such as `_template.md`, are
never published.

A link to a post shared on X, LinkedIn, Slack and the like shows a 1200×630
card: the post's title beside its thumbnail. `npm run export` draws one per post
into `web/out/og/` (`web/scripts/share-card.mjs`).

Write plain Markdown. Pictures go in `web/public/images/blog/my-post/` and are
written by file name, `![Caption](chart.png)`; a picture alone on its line
becomes a captioned figure. For a caption longer than a short description, put
it in quotes after the file name: `![Chart of X](chart.png "Figure 1. …")`
shows the quoted text as the caption and keeps the alt text for screen readers. Headings get anchors, so `[results](#results)`
jumps to `## Results`.

Code blocks look like VS Code's editor: its Dark+ colors, from VS Code's own
grammars through [Shiki](https://shiki.style), written into the page when it is
built, so no script ships. Name the language after the opening fence, as in
` ```python `. Python, JavaScript, TypeScript, TSX, JSON and shell (`bash`,
`sh`) are colored and labeled with their language; a block in any other
language, or with none, keeps the same dark style as plain text. To color
another language, add its grammar to the highlighter in
`web/app/blog/markdown.ts`.

## Google Scholar embed

Google Scholar sends `X-Frame-Options: SAMEORIGIN`, so its pages cannot be
framed from another site. The page instead frames a saved copy of the profile,
`web/public/scholar/profile.html`, and links to the live profile beneath it.

Refresh the copy, and the "saved on" date shown on the page, from `web`:

```sh
npm run scholar:snapshot
```

Commit the two files it changes; pushing them redeploys the site. If Scholar
answers the script with a CAPTCHA, save the profile page from a browser and pass
the file: `npm run scholar:snapshot -- ~/Downloads/profile.html`. The profile
URL is set in `web/app/scholar.json`.

The copy has its scripts removed and is framed in a sandbox, so it shows the
profile, citation metrics, and article list; its links open Scholar in a new tab.

## Development

From `web`:

```sh
npm ci
npm run dev
```

Verify a change with `npm run lint`, `npm run typecheck`, and `npm test`. To
publish, commit and push to `main`; the deployment below does the rest.

## GitHub Pages deployment

The site is published at [sunghoojung.github.io](https://sunghoojung.github.io)
from the `sunghoojung.github.io` repository. Pages serve from the domain root,
so the code must live in that user-site repository, not a project repository.

`.github/workflows/deploy.yml` runs on every push to `main`: it lints, type
checks, builds, exports the pages as static files, tests them, and deploys them.
The repository's Settings > Pages source must be "GitHub Actions".

`npm run export` in `web` produces the same files locally in `web/out`:
`index.html`, `publications.html`, `projects.html`, the blog pages, `404.html`,
the stylesheet, images, and the saved Scholar profile. `web/scripts/export-static.mjs` renders each page
once and removes the framework's scripts, since no page needs them.
