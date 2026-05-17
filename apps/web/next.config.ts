import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@buendia/db", "@buendia/shared"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        // SDK bundle is version-pinned in the URL (/sdk/v1/), so we
        // cache it aggressively. A future v2 lands at /sdk/v2/.
        source: "/sdk/v1/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
