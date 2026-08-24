import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Card statement import uploads a PDF/CSV through a server action
      // (2026-08-24). 4mb, not more: Vercel hard-caps serverless request
      // bodies at 4.5 MB, so a larger value here would lie. Applies to the
      // raw multipart body, so the effective file ceiling is a bit under.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
