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
                </h2>
                {post.summary && <p className="meta">{post.summary}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SiteShell>
  );
}
