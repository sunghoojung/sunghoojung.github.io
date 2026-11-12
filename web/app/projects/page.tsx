import type { Metadata } from "next";
import { profile, projects } from "../content";
import { ExternalLink, SiteShell } from "../site-shell";

export const metadata: Metadata = {
  title: `Projects | ${profile.name}`,
  description:
    "Projects across browser systems, applied machine learning, automation, interactive 3D, and embedded systems.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <SiteShell current="/projects">
      <h1>Projects</h1>
      {projects.map((project) => (
        <article
          className="entry"
          id={project.id}
          key={project.id}
          aria-labelledby={`${project.id}-title`}
        >
          <h2 className="entry-title" id={`${project.id}-title`}>
            {project.title}
          </h2>
          <p className="meta">{project.context}</p>
          <p>{project.description}</p>
          <p className="meta entry-footer">
            <span>{project.stack.join(", ")}</span>
            {project.links.map((link) => (
              <ExternalLink href={link.href} key={link.href}>
                {link.label}
              </ExternalLink>
            ))}
          </p>
        </article>
      ))}
    </SiteShell>
  );
}
