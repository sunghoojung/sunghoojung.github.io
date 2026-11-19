import type { Metadata } from "next";
import { profile } from "../content";
import { SiteShell } from "../site-shell";
import { formatDate, posts } from "./posts";

export const metadata: Metadata = {
  title: `Blog | ${profile.name}`,
  description: `Writing by ${profile.name}.`,
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <SiteShell current="/blog">
      <h1>Blog</h1>
      {posts.length === 0 ? (
        <p className="meta">No posts yet.</p>
      ) : (
        <ol className="post-list">
          {posts.map((post) => (
            <li key={post.slug}>
              <time className="post-date" dateTime={post.date}>
                {formatDate(post.date)}
              </time>
              <div>
                <h2 className="post-list-title">
                  <a href={`/blog/${post.slug}`}>{post.title}</a>
                  {post.draft && <span className="draft-tag">Draft</span>}
                </h2>
                {post.description && <p className="meta">{post.description}</p>}
                {post.thumbnail && (
                  <a href={`/blog/${post.slug}`} tabIndex={-1} aria-hidden>
                    <img className="post-thumb" src={post.thumbnail} alt="" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SiteShell>
  );
}
