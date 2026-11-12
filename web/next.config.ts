import type { NextConfig } from "next";

// URLs from the earlier site that no longer have a page of their own.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/about", destination: "/", permanent: true },
      { source: "/blog", destination: "/", permanent: true },
      { source: "/bedroom", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
