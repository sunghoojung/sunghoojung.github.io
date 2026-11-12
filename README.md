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

Each post is a Markdown file in `web/content/blog`. Copy
`web/content/blog/_template.md`, rename it to the address you want
(`my-first-post.md` becomes `/blog/my-first-post`), set the `title`, `date`
(as `YYYY-MM-DD`), and optional `summary` at the top, and write the post below
them. Commit and push to publish it. Posts are listed newest first, and files
whose names begin with an underscore are not published.

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

Verify a change with `npm run lint`, `npm run typecheck`, and `npm test`.

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

`npm start` still serves the built site from Node (`web/railway.toml` uses it),
where `/about` and `/bedroom` redirect to the home page.

## Neo Seoul room

The interactive 3D room that used to be the homepage, with its Blender sources,
is not part of this site. It lives in the
[sunghoo_website](https://github.com/sunghoojung/sunghoo_website) repository.
