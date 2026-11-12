import { SiteShell } from "./site-shell";

export default function NotFound() {
  return (
    <SiteShell>
      <h1>Page not found</h1>
      <p>
        This page does not exist. Return to the <a href="/">home page</a>.
      </p>
    </SiteShell>
  );
}
