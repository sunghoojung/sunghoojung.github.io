import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { profile } from "../../content";
import { SiteShell } from "../../site-shell";
import { formatDate, posts, shareCardUrl } from "../posts";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((item) => item.slug === slug);
  if (!post) return {};
  const card = {
    url: shareCardUrl(post.slug),
    width: 1200,
    height: 630,
    alt: post.title,
  };
  return {
    title: `${post.title} | ${profile.name}`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    // What X, LinkedIn, Slack and the like show for a link to the post.
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      siteName: profile.name,
      publishedTime: post.date,
      authors: [profile.name],
      images: [card],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [card],
    },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = posts.find((item) => item.slug === slug);
  if (!post) notFound();
  return (
    <SiteShell current="/blog">
      <article className="post">
        <h1>{post.title}</h1>
        <time className="meta post-meta" dateTime={post.date}>
          {formatDate(post.date)}
          {post.draft && <span className="draft-tag">Draft</span>}
        </time>
        {/* The HTML comes from this repository's own Markdown files. */}
        <div
          className="post-body"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </article>
      {/* `npm run dev` only: the in-page editor. Builds leave it out. */}
      {import.meta.env.DEV && (
        <script async type="module" src="/editor/client.ts" />
      )}
    </SiteShell>
  );
}
