const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix stale build issues caused by multiple lockfiles detection
  outputFileTracingRoot: path.join(__dirname, '../'),

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
