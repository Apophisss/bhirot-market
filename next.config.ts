import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // people photos are vendored under /public/people; this only covers Google avatars
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
  // drizzle migrations are read from disk at runtime (see src/lib/db/index.ts) — ship them with every serverless function
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
};

export default nextConfig;
