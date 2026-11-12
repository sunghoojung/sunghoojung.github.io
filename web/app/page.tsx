import { profile } from "./content";
import { ExternalLink, SiteShell } from "./site-shell";

export default function AboutPage() {
  return (
    <SiteShell current="/">
      <h1>{profile.name}</h1>
      <div className="about">
        <div className="prose">
          <p>
            I study computer science and mathematics, with an interest in
            reverse engineering and AI. I am currently a research assistant in
            the Trustworthy ML Lab, and I was previously in the
            Neurodegenerative Diseases Lab at Rutgers. I’m learning about and
            researching large language models, and my other interests include
            computer vision, infrastructure engineering, and distributed
            systems.
          </p>
          <p>
            I began programming at 14, learning to write automation scripts
            while I was part of the{" "}
            <ExternalLink href="https://x.com/nickbruhman/status/2097739783854293026?s=20">
              sneaker Twitter community
            </ExternalLink>
            . I later moved into NFT trading, building bots, monitors, and
            automation tools. Those early projects taught me to explore
            unfamiliar systems, understand how they work, and build reliable
            tools around them.
          </p>
        </div>
        <aside className="contact" aria-label="Contact">
          <ul>
            <li>
              <a href={`mailto:${profile.email}`}>Email</a>
            </li>
            {profile.links.map((link) => (
              <li key={link.href}>
                <ExternalLink href={link.href}>{link.label}</ExternalLink>
              </li>
            ))}
          </ul>
          <p className="contact-email">{profile.email}</p>
        </aside>
      </div>
    </SiteShell>
  );
}
