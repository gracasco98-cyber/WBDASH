/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_PUBLIC_API_URL is injected at build time via Docker ARG.
  // Local dev: http://192.168.1.43:3001  (set in docker-compose.yml)
  // Production: https://dashboard.example.com  (set in docker-compose.prod.yml)
  // No hardcoded fallback — misconfigured builds fail fast.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
};
module.exports = nextConfig;
