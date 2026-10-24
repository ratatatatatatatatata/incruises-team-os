import type { NextConfig } from "next";

const connectSources = ["'self'"];
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl);
    connectSources.push(url.origin, url.origin.replace(/^http/, "ws"));
  } catch {
    // An invalid URL is already rejected by the runtime Supabase configuration.
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.NODE_ENV === "production"
    ? ["upgrade-insecure-requests"]
    : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

// Only the opt-in personal AI pages can download model assets and compile WASM.
// Application scripts remain same-origin; no paid provider endpoint is added.
const localAiPolicy =
  contentSecurityPolicy
    .replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
    .replace(
      `connect-src ${connectSources.join(" ")}`,
      `connect-src ${connectSources.join(" ")} https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com`,
    ) + "; worker-src 'self' blob:";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/life-demo",
        headers: [{ key: "Content-Security-Policy", value: localAiPolicy }],
      },
      {
        source: "/_next/static/chunks/:asset(life-ai-worker.*)",
        headers: [{ key: "Content-Security-Policy", value: localAiPolicy }],
      },
      ...(process.env.PERSONAL_LIFE_ENABLED === "true"
        ? [
            {
              source: "/",
              headers: [
                { key: "Content-Security-Policy", value: localAiPolicy },
              ],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
