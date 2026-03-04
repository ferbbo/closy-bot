/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Skip ESLint during build - run separately with `pnpm lint:dashboard`
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: 'http://localhost:4000/auth/:path*',
      },
      {
        source: '/onboarding/:path*',
        destination: 'http://localhost:4000/onboarding/:path*',
      },
       {
        source: '/channels/:path*',
        destination: 'http://localhost:4000/channels/:path*',
      },
    ];
  },
};

export default nextConfig;
