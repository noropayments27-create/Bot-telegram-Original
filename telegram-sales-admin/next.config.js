/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev and production artifacts separated to avoid corrupting
  // the running dev server when a production build is executed.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    // Prevent intermittent corrupted dev chunk cache (vendor-chunks resolution errors).
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
