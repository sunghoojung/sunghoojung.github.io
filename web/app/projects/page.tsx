import type { Metadata } from "next";
import { Fragment } from "react";
import { profile, projects } from "../content";
import { ExternalLink, SiteShell } from "../site-shell";

export const metadata: Metadata = {
  title: `Projects | ${profile.name}`,
  description:
    "Projects across browser tooling, applied machine learning, automation, and web apps.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <SiteShell current="/projects">
      <h1>Projects</h1>
      <ul className="project-list">
        {projects.map((project) => (
          <li id={project.id} key={project.id}>
            {project.links.map((link) => (
              <Fragment key={link.href}>
                <span className="project-tag">
                  [<ExternalLink href={link.href}>{link.label}</ExternalLink>]
                </span>{" "}
              </Fragment>
            ))}
            <strong className="project-title">{project.title}</strong>
            {/* A no-break space keeps the dash off the start of a wrapped
                line, where it would read as another item. */}
            {`\u00a0- ${project.summary}`}
          </li>
        ))}
      </ul>
    </SiteShell>
  );
}
