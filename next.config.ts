import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // people photos are vendored under /public/people; this only covers Google avatars
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
  // drizzle migrations are read from disk at runtime (see src/lib/db/index.ts) — ship them
  // with every serverless function, and the share-card fonts with the route that draws them
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
    "/market/[slug]/og": ["./public/fonts/*.ttf"],
  },
  // Deployment is a Docker image on our own server (see Dockerfile): standalone
  // emits a server.js with only the traced dependencies beside it, so the image
  // does not have to carry node_modules.
  output: "standalone",
  // Caddy in front of us is configured `encode zstd gzip`, and it can only encode what
  // arrives uncompressed. With Next gzipping the HTML itself, Caddy saw a body that was
  // already `content-encoding: gzip` and passed it through untouched — so every visitor
  // on a browser that asks for zstd (Chrome 123 and up, Android WebView included) got
  // gzip anyway. Handing the bytes to Caddy plain is what lets the better encoder win;
  // it also moves the compression off the single vCPU that renders the pages.
  compress: false,
  // /for-you is gone: the same picks now open the home page and the rapid deck,
  // so an old bookmark or a stale link lands on the board instead of a 404
  async redirects() {
    return [{ source: "/for-you", destination: "/", permanent: true }];
  },
  /**
   * Vendored static files were being served with `cache-control: max-age=0`, so every
   * repeat visit re-validated seventy-odd candidate portraits before it could draw a
   * card. Everything listed here is checked into the repo and only ever changes when
   * somebody re-runs a script, which makes `immutable` true in the sense the header
   * means it — with one rule attached: **a replaced asset gets a new file name.**
   * Overwriting `/people/<id>.jpg` in place would leave a year of stale photos in the
   * browsers that already have it.
   *
   * Not listed, on purpose: `/sw.js`, which must stay revalidated so a new worker can
   * take over, and `/manifest.webmanifest` and `/robots.txt`, which Next builds.
   */
  async headers() {
    const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/people/:path*", headers: immutable },
      { source: "/covers/:path*", headers: immutable },
      { source: "/fonts/:path*", headers: immutable },
      { source: "/logo.svg", headers: immutable },
      { source: "/hero.svg", headers: immutable },
      { source: "/icon-192.png", headers: immutable },
      { source: "/icon-512.png", headers: immutable },
      { source: "/apple-touch-icon.png", headers: immutable },
    ];
  },
};

export default nextConfig;
