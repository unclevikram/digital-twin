/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Vectra uses Node.js filesystem APIs — must run in Node.js runtime, not Edge
    serverComponentsExternalPackages: ['vectra'],
    // Tell Vercel's bundler to include the vector index in the Lambda bundles.
    // Without this, process.cwd()-based file access fails on Vercel (files not traced).
    outputFileTracingIncludes: {
      '/api/chat': ['./vector-index/**'],
      '/api/ingest/status': ['./vector-index/**'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
}

export default nextConfig
