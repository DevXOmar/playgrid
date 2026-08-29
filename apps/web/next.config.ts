import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@playgrid/ui", "@playgrid/config", "@playgrid/types"]
};

export default nextConfig;
