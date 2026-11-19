import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { profile } from "../../content";
import { SiteShell } from "../../site-shell";
import { formatDate, posts } from "../posts";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((item) => item.slug === slug);
  if (!post) return {};
  return {
    title: `${post.title} | ${profile.name}`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
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
