/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep audit production builds separate from a running workspace dev server.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  outputFileTracingIncludes: { "/*": ["./public/brand/rush-cart-logo.png"] },

  // libSQL ships a native binding for local file databases, and the AWS SDK
  // resolves credentials at runtime — neither should be bundled by the compiler.
  // Heavy native/SDK packages are loaded only on the client; externalising them keeps their
  // ESM out of the server chunk graph, where bundling it corrupts the webpack
  // runtime. The mesh lazy-imports it in the browser, so it is never `require`d
  // during a server render.
  serverExternalPackages: ["@libsql/client", "libsql", "@aws-sdk/client-s3"],

  // HeroUI v3 ships its `"use client"` directives in the published ESM. If the
  // package is left untranspiled Next never runs its compiler over those files,
  // so client-only modules (Avatar's context, the calendar contexts) leak into
  // the React Server Components graph and crash on `createContext`. This mirrors
  // HeroUI's own Next.js setup. `optimizePackageImports` then keeps the deep
  // per-component import cost down by rewriting the barrel into direct paths.
  transpilePackages: ["@heroui/react", "@heroui/styles"],

  images: {
    // R2's public host is deployment-specific, so it is resolved from the
    // environment rather than hard-coded. Development additionally allows any
    // https host so that seeded/demo media never renders as a broken box.
    remotePatterns: (() => {
      const patterns = [
        { protocol: "https", hostname: "**.r2.dev" },
        { protocol: "https", hostname: "**.cloudflarestorage.com" },
      ];

      const base = process.env.R2_PUBLIC_BASE_URL;
      if (base) {
        try {
          const url = new URL(base);
          patterns.push({
            protocol: url.protocol.replace(":", ""),
            hostname: url.hostname,
            pathname: "/**",
          });
        } catch {
          // Malformed R2_PUBLIC_BASE_URL — ignore rather than crash the build.
        }
      }

      if (process.env.NODE_ENV === "development") {
        patterns.push({ protocol: "https", hostname: "**" });
      }

      return patterns;
    })(),
  },

  // Replit serves the dev server through a public proxy, so `/_next/*` requests
  // arrive from a different origin than the one the server binds to. Without
  // this, Next refuses those asset requests and the preview renders unstyled.
  allowedDevOrigins: ["*.replit.dev", "*.replit.app", "*.janeway.replit.dev"],

  // Server actions are checked against the request's own origin, so a proxy that
  // forwards a different host than the browser used would refuse every form post
  // — sign-up included. The hostnames this process was started with are added
  // here for the same reason they are trusted by the auth engine: a preview host
  // is not configuration, it is handed to the process at runtime.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:5000",
        "127.0.0.1:5000",
        ...(process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "")
          .split(",")
          .map((value) => value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""))
          .filter(Boolean),
        "*.replit.dev",
        "*.janeway.replit.dev",
      ],
    },

    optimizePackageImports: [
      "@heroui/react",
      "@gravity-ui/icons",
      "lucide-react",
      "react-aria-components",
    ],
  },

  eslint: {
    // Lint is run explicitly (`npm run lint`); it must not gate production builds.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
