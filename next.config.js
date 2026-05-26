/** @type {import('next').NextConfig} */
const nextConfig = {
  // Replace deprecated images.domains with remotePatterns
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'randomuser.me',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
    ],
  },
  // Remove deprecated options
  reactStrictMode: true,
  // swcMinify is enabled by default in Next.js 14+, remove it
  // experimental.appDir is also enabled by default, remove it
}

module.exports = nextConfig