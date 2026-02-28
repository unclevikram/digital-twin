/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Vectra uses Node.js filesystem APIs — must run in Node.js runtime, not Edge
    serverComponentsExternalPackages: ['vectra'],
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
