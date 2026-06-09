import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vouchfx/config", "@vouchfx/core", "@vouchfx/db"],
};

export default nextConfig;
