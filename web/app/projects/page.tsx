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
      <div className="projects">
        {projects.map((project, index) => (
          <article
            className="project"
            id={project.id}
            key={project.id}
            aria-labelledby={`${project.id}-title`}
          >
            <img
              className="project-image"
              src={project.image.src}
              alt={project.image.alt}
              width={project.image.width}
              height={project.image.height}
              loading={index < 2 ? "eager" : "lazy"}
              style={
                project.image.position
                  ? { objectPosition: project.image.position }
                  : undefined
              }
            />
            <h2 className="project-title" id={`${project.id}-title`}>
              {project.title}
            </h2>
            <p>{project.summary}</p>
            {project.links.length > 0 && (
              <p className="meta project-links">
                {project.links.map((link) => (
                  <ExternalLink href={link.href} key={link.href}>
                    {link.label}
                  </ExternalLink>
                ))}
              </p>
            )}
          </article>
        ))}
      </div>
    </SiteShell>
  );
}
