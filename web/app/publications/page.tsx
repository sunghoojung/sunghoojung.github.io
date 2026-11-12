import type { Metadata } from "next";
import { profile, publications, scholarProfile } from "../content";
import { ExternalLink, SiteShell } from "../site-shell";

export const metadata: Metadata = {
  title: `Publications | ${profile.name}`,
  description: `Papers co-authored by ${profile.name}, with Google Scholar citation metrics.`,
  alternates: { canonical: "/publications" },
};

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function PublicationsPage() {
  return (
    <SiteShell current="/publications">
      <h1>Publications</h1>
      <ol className="publications">
        {publications.map((paper) => (
          <li key={paper.href}>
            <span className="publication-year">{paper.year}</span>
            <div>
              <h2 className="publication-title">
                <ExternalLink href={paper.href}>{paper.title}</ExternalLink>
              </h2>
              <p className="meta">
                {paper.authorsBefore}
                <strong>S. Jung</strong>
                {paper.authorsAfter}
              </p>
              <p className="meta">
                <em>{paper.journal}</em> {paper.reference}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section aria-labelledby="scholar-heading">
        <h2 id="scholar-heading">Google Scholar</h2>
        <iframe
          className="scholar-frame"
          src={scholarProfile.embedPath}
          title={`Google Scholar profile of ${profile.name}`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
        />
        <p className="meta scholar-note">
          Saved from Google Scholar on {formatDate(scholarProfile.savedAt)}.{" "}
          <ExternalLink href={scholarProfile.url}>
            View the live profile
          </ExternalLink>
          .
        </p>
      </section>
    </SiteShell>
  );
}
