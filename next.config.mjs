/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We don't ship an ESLint config; skip lint during build so deploys don't
  // fail on style warnings. TypeScript type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
