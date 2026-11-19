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

Content sources and the list of excluded material are in
[`docs/project-sources.md`](docs/project-sources.md).

## Writing a blog post

Each post is one Markdown file in `web/content/blog`; the file name is the
address (`my-post.md` is `/blog/my-post`). From `web`:

```sh
npm run new-post -- "My post title"   # creates content/blog/my-post-title.md
npm run dev                           # open http://localhost:3000/blog
```

Edit the file in any editor and save; the dev server restarts and the page
reloads with your change. A new post starts with `draft: true` in its front
matter. A draft appears only under `npm run dev` (marked "Draft"); builds leave
out its page, its link, and its pictures. To publish, delete the `draft: true`
line, then commit and push to `main`.

The top of a post is `title`, `date` (`YYYY-MM-DD`), an optional `description`
for the blog list, and `draft: true` while it is unfinished. Posts are listed
newest first. Files whose names begin with an underscore, such as
`_template.md`, are never published.

Write plain Markdown. Pictures go in `web/public/images/blog/my-post/` and are
written by file name, `![Caption](chart.png)`; a picture alone on its line
becomes a captioned figure. Headings get anchors, so `[results](#results)`
jumps to `## Results`.

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
