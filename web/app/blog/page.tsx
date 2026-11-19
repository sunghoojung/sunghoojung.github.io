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
      {/* `npm run dev` only; handled by editor/server.ts. */}
      {import.meta.env.DEV && (
        <form className="new-post" method="post" action="/__post-editor/new">
          <input
            name="title"
            required
            placeholder="Title of a new post"
            aria-label="Title of a new post"
          />
          <button type="submit">New post</button>
        </form>
      )}
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
                  {import.meta.env.DEV && (
                    <a className="draft-tag" href={`/blog/${post.slug}?edit`}>
                      Edit
                    </a>
                  )}
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
