import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "localhost,127.0.0.1")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  // Keep mode selection identical in server and client bundles. NEXT_PUBLIC_* values are
  // build-time configuration for this app, so changing them requires a new build.
  env: {
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
    NEXT_PUBLIC_DEMO_STORAGE: process.env.NEXT_PUBLIC_DEMO_STORAGE,
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
