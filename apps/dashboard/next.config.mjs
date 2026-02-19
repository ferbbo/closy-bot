/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Skip ESLint during build - run separately with `pnpm lint:dashboard`
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
