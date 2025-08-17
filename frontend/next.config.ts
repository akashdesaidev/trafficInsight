import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
  experimental: {
    proxyTimeout: 120000, // 2 minutes timeout for proxy requests
  },
  serverRuntimeConfig: {
    // Server-side timeout configurations
    timeout: 120000, // 2 minutes
  },
};

export default nextConfig;
