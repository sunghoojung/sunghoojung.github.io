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
    description: post.summary,
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
        </time>
        {/* The HTML comes from this repository's own Markdown files. */}
        <div
          className="post-body"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </article>
    </SiteShell>
  );
}
