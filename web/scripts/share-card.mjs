// The picture X, LinkedIn, Slack and the like show for a link to a post: its
// title beside its thumbnail, at the 1200×630 size those sites expect.
// export-static.mjs writes one per post to out/og/<slug>.png, where the post
// page's og:image points (shareCardUrl in app/blog/posts.ts).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@vercel/og";
import { createElement as h } from "react";
import sharp from "sharp";

export const cardSize = { width: 1200, height: 630 };

// The site's light colors, from globals.css.
const colors = {
  background: "#f5f5f5",
  text: "#1a1a1a",
  muted: "#6b6b6b",
  rule: "#e5e5e5",
  accent: "#1f6fd0",
};
// profile.name in app/content.ts, and the site's address.
const author = "Sunghoo Jung";
const site = "sunghoojung.github.io";
const padding = 64;
const gap = 56;
// The largest the thumbnail is drawn. It keeps its own shape inside.
const pictureBox = { width: 500, height: cardSize.height - 2 * padding };

const fonts = Promise.all(
  [400, 600, 700].map(async (weight) => ({
    name: "Inter",
    weight,
    style: "normal",
    data: await readFile(
      fileURLToPath(
        import.meta.resolve(
          `@fontsource/inter/files/inter-latin-${weight}-normal.woff`,
        ),
      ),
    ),
  })),
);

// The card's renderer reads only PNG, JPEG and GIF, so the thumbnail, often a
// WebP, goes in as a PNG.
async function picture(source) {
  const { data, info } = await sharp(source)
    .png()
    .toBuffer({ resolveWithObject: true });
  const scale = Math.min(
    pictureBox.width / info.width,
    pictureBox.height / info.height,
  );
  return {
    src: `data:image/png;base64,${data.toString("base64")}`,
    width: Math.round(info.width * scale),
    height: Math.round(info.height * scale),
  };
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// `thumbnail` is a path on disk or the picture's bytes; without one, the title
// has the card to itself. Returns the PNG's bytes.
export async function renderShareCard({ title, date, thumbnail }) {
  const image = thumbnail ? await picture(thumbnail) : null;
  const card = h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap,
        width: "100%",
        height: "100%",
        padding,
        background: colors.background,
        color: colors.text,
        fontFamily: "Inter",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          gap: 28,
        },
      },
      h(
        "div",
        { style: { display: "flex", gap: 14, fontSize: 26, fontWeight: 600 } },
        h("span", { style: { color: colors.accent } }, "Blog"),
        h("span", { style: { color: colors.muted } }, "·"),
        h(
          "span",
          { style: { color: colors.muted, fontWeight: 400 } },
          formatDate(date),
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "block",
            fontSize: image ? 58 : 76,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            lineClamp: image ? 5 : 4,
          },
        },
        title,
      ),
      h(
        "div",
        { style: { display: "flex", gap: 14, fontSize: 26 } },
        h("span", { style: { fontWeight: 600 } }, author),
        h("span", { style: { color: colors.muted } }, site),
      ),
    ),
    image &&
      h("img", {
        src: image.src,
        width: image.width,
        height: image.height,
        style: {
          borderRadius: 16,
          border: `1px solid ${colors.rule}`,
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.14)",
        },
      }),
  );
  const response = new ImageResponse(card, {
    ...cardSize,
    fonts: await fonts,
  });
  return Buffer.from(await response.arrayBuffer());
}
