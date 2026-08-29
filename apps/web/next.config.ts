import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@playgrid/ui", "@playgrid/config", "@playgrid/types"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }]
  }
};

export default nextConfig;
