// Saves a static copy of the Google Scholar profile for the homepage iframe.
//
// Google Scholar sends `X-Frame-Options: SAMEORIGIN`, so the live profile
// cannot be framed from another site. This script stores a script-free copy at
// public/scholar/profile.html, which the page frames from its own origin.
//
//   npm run scholar:snapshot              fetch the live profile
//   npm run scholar:snapshot -- page.html use a page saved from a browser
//                                         (for when Scholar blocks the fetch)
import { mkdir, readFile, writeFile } from "node:fs/promises";

const configUrl = new URL("../app/scholar.json", import.meta.url);
const outputUrl = new URL("../public/scholar/profile.html", import.meta.url);
const config = JSON.parse(await readFile(configUrl, "utf8"));

async function fetchProfile() {
  const url = new URL(config.profileUrl);
  url.searchParams.set("pagesize", "100");
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`Google Scholar responded with ${response.status}.`);
  }
  return response.text();
}

// Only the profile, the article table, and the citation metrics are kept
// visible. Search, sign-in, follow, and paging controls need Scholar's scripts
// and session, so they are hidden rather than left as dead controls.
const embedStyles = `
html, body { height: auto !important; background: #fff !important; }
#gs_hdr, #gs_hdr_drw, #gs_gb, #gs_alrt, #gs_ftr, #gs_ftr_sp, #gs_md_s,
#gs_md_ldg, #gs_md_err, #gsc_md_cbyd, #gsc_md_cbym, #gsc_md_cod, #gsc_md_fol,
#gsc_md_hist, #gsc_lwp, #gsc_prf_ivh, #gsc_prf_btnf, #gsc_prf_t_wrp,
#gsc_a_err, #gsc_a_sp, #gsc_rsb_gpl, #gsc_rsb_mnd, #gsc_rsb_co,
.gs_md_wnw, .gs_md_d { display: none !important; }
/* Scholar picks its narrow layout with a script. One column fits any width. */
#gs_top { min-width: 0 !important; min-height: 0 !important; }
#gs_bdy { padding: 0 !important; }
#gs_bdy_ccl { padding: 0 16px 16px !important; }
#gsc_bdy { display: flex !important; flex-flow: column; padding: 0 !important; }
#gsc_prf_w { order: 1 !important; margin: 0 !important; padding: 20px 0 !important; }
#gsc_prf_pu, #gsc_prf_pua, #gsc_prf_pup-img {
  width: 64px !important; height: 64px !important;
}
#gsc_prf_i { margin: 0 0 0 84px !important; }
.gsc_rsb {
  order: 2 !important; float: none !important; width: auto !important;
  border: 0 !important; margin: 0 0 20px !important;
}
.gsc_rsb_s { margin: 0 !important; }
#gsc_rsb_st { max-width: 340px; }
#gsc_art { order: 3 !important; margin: 0 !important; }
#gsc_a_trh { position: static !important; }
#gsc_a_t th.gsc_a_c { width: 76px !important; }
#gsc_a_t th.gsc_a_y { width: 52px !important; }
#gsc_a_t .gsc_a_t, #gsc_a_t .gsc_a_c, #gsc_a_t .gsc_a_y {
  padding-left: 8px !important; padding-right: 8px !important;
}
/* Match the site's dark theme; Scholar itself is light only. */
@media (prefers-color-scheme: dark) {
  html, body { background: #18191b !important; }
  body, td, th, #gsc_prf_in, .gsc_prf_il, .gsc_rsb_title, .gsc_a_h,
  .gsc_rsb_std, .gsc_rsb_sth, #gsc_a_ca { color: #e4e4e4 !important; }
  a, a:link, a:visited, .gsc_a_at, .gsc_a_ac, .gsc_a_a,
  .gsc_rsb_f:link, .gsc_rsb_f:visited { color: #6ba6e8 !important; }
  .gs_gray, .gsc_a_t .gs_gray { color: #9a9a9a !important; }
  #gsc_a_trh, #gsc_a_trh th { background-color: #232427 !important; }
  .gsc_rsb_header, .gsc_rsb_sth, #gsc_a_t td, #gsc_a_t th {
    border-color: #333437 !important;
  }
}
`;

function buildSnapshot(html) {
  if (!html.includes('id="gsc_prf"') || !html.includes('id="gsc_a_t"')) {
    throw new Error(
      "The response is not a Scholar profile (Scholar may be asking for a CAPTCHA). " +
        "Save the profile page from a browser and pass the file path instead.",
    );
  }
  const head = [
    '<meta charset="utf-8">',
    // The copy is inert: no scripts or form posts, even when opened directly.
    `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; form-action 'none'; object-src 'none'">`,
    '<meta name="robots" content="noindex">',
    // Images and links resolve against Scholar; links leave the frame.
    '<base href="https://scholar.google.com/" target="_blank">',
    `<style>${embedStyles}</style>`,
  ].join("\n");

  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<meta[^>]+http-equiv=["']?refresh[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<head([^>]*)>/i, `<head$1>\n${head}`);
}

const source = process.argv[2];
const html = source ? await readFile(source, "utf8") : await fetchProfile();
const snapshot = buildSnapshot(html);

await mkdir(new URL("./", outputUrl), { recursive: true });
await writeFile(outputUrl, snapshot);
config.savedAt = new Date().toISOString().slice(0, 10);
await writeFile(configUrl, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Saved the Scholar profile (${config.savedAt}).`);
