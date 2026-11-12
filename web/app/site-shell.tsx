import type { ReactNode } from "react";
import { profile } from "./content";

const pages = [
  { href: "/", label: "About" },
  { href: "/publications", label: "Publications" },
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
] as const;

export type PagePath = (typeof pages)[number]["href"];

export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

// Plain anchors keep every page a document navigation, so the statically
// exported site works without any script.
export function SiteShell({
  current,
  children,
}: {
  current?: PagePath;
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          {current !== "/" && (
            <a className="site-name" href="/">
              {profile.name}
            </a>
          )}
          <nav aria-label="Pages">
            {pages.map((page) => (
              <a
                href={page.href}
                key={page.href}
                aria-current={page.href === current ? "page" : undefined}
              >
                {page.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="site-footer">
        © {new Date().getFullYear()} {profile.name}
      </footer>
    </>
  );
}
