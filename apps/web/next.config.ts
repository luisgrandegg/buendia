import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@buendia/db", "@buendia/shared"],
};

export default nextConfig;
