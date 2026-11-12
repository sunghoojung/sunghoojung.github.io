import { profile } from "./content";
import { Icon } from "./icons";
import { ExternalLink, SiteShell } from "./site-shell";

export default function AboutPage() {
  return (
    <SiteShell current="/">
      <h1>{profile.name}</h1>
      <div className="about">
        <aside className="profile" aria-label="Contact">
          <img
            className="profile-photo"
            src={profile.photo.src}
            width={profile.photo.width}
            height={profile.photo.height}
            alt={profile.name}
          />
          <div>
            <ul className="profile-links">
              <li>
                <a href={`mailto:${profile.email}`} aria-label="Email">
                  <Icon name="email" />
                </a>
              </li>
              {profile.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-label={link.label}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name={link.icon} />
                  </a>
                </li>
              ))}
            </ul>
            <p className="profile-email">{profile.email}</p>
          </div>
        </aside>
        <div className="prose">
          <p>
            I study computer science and mathematics at Rutgers University. I am
            a research assistant in{" "}
            <ExternalLink href="https://radcollaboratory.rutgers.edu/profile/ruixiang-ryan-tang/">
              Ruixiang Tang’s lab
            </ExternalLink>
            , where I study how machine learning models work, with a focus on
            interpretability and model steering.
          </p>
          <p>
            I am also a research assistant in the Rail Lab, where I build and
            maintain solutions for real-world partners in the rail industry,
            currently with a focus on LiDAR.
          </p>
          <p>
            Before these, I was a machine learning research assistant in the
            Neurodegenerative Diseases Lab at Rutgers, where I built a
            microscopy analysis pipeline that contributed to papers in{" "}
            <ExternalLink href="https://doi.org/10.1038/s44319-026-00856-8">
              EMBO Reports
            </ExternalLink>{" "}
            and{" "}
            <ExternalLink href="https://doi.org/10.1016/j.xpro.2026.104368">
              STAR Protocols
            </ExternalLink>
            .
          </p>
          <p>
            Outside the lab I like taking systems apart to see how they work.
            I’m currently building a{" "}
            <a href="/projects#reverse-engineering-browser">
              reverse engineering browser
            </a>
            , a custom Brave build with a native macOS app for tracing what a
            web application does. My other interests include computer vision,
            infrastructure engineering, and distributed systems.
          </p>
          <p>
            I began programming at 14, writing automation scripts while I was
            part of the{" "}
            <ExternalLink href="https://x.com/nickbruhman/status/2097739783854293026?s=20">
              sneaker Twitter community
            </ExternalLink>
            . I later moved into NFT trading, building bots, monitors, and
            automation tools. Those early projects taught me to explore
            unfamiliar systems, understand how they work, and build reliable
            tools around them.
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
