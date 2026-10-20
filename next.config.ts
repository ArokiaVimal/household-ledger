import type { NextConfig } from "next";

// Private app: no indexing, no framing, no sniffing. A CSP is deliberately not set yet:
// Google sign-in (popup) needs a carefully tested allowlist, and a wrong one would lock you out.
const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/categories", destination: "/settings?s=categories", permanent: true }, { source: "/profile", destination: "/settings?s=profile", permanent: true }, { source: "/settlements", destination: "/people", permanent: true }, { source: "/settlements/:id", destination: "/people/:id", permanent: true }];
  },
  // Firebase's sign-in pages, served from this site. Only used when NEXT_PUBLIC_AUTH_SAME_ORIGIN=1 (Safari blocks the cross-site version).
  async rewrites() {
    const domain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    return domain ? [{ source: "/__/auth/:path*", destination: `https://${domain}/__/auth/:path*` }, { source: "/__/firebase/init.json", destination: `https://${domain}/__/firebase/init.json` }] : [];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The commit this build was made from, so the app can tell whether a newer version is live.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
