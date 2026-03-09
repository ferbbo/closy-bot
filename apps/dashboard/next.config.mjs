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
        destination: 'http://localhost:4001/auth/:path*',
      },
      {
        source: '/onboarding/:path*',
        destination: 'http://localhost:4001/onboarding/:path*',
      },
      {
        source: '/api/catalog/:path*',
        destination: 'http://localhost:4001/api/catalog/:path*',
      },
      {
        source: '/api/products/:path*',
        destination: 'http://localhost:4001/api/products/:path*',
      },
      {
        source: '/api/products',
        destination: 'http://localhost:4001/api/products',
      },
      {
        source: '/webhooks/:path*',
        destination: 'http://localhost:4001/webhooks/:path*',
      },
      {
        source: '/merchants/:path*',
        destination: 'http://localhost:4001/merchants/:path*',
      },
    ];
  },
};

export default nextConfig;
