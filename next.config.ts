import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    listings: {
      stale: 900,
      revalidate: 900,
      expire: 3600,
    },
    reference: {
      stale: 3600,
      revalidate: 3600,
      expire: 86400,
    },
    scrapeRuns: {
      stale: 120,
      revalidate: 120,
      expire: 600,
    },
  },
};

export default nextConfig;
