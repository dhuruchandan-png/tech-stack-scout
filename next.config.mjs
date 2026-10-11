/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["rss-parser", "@react-email/render", "@react-email/components"],
  // Lint runs in CI/locally via `npm run lint`; a style nit must never block a deploy.
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }] },
};
export default nextConfig;
