/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep browser-related packages out of the webpack bundle.
  // They're resolved at runtime on Vercel's Node.js environment.
  serverExternalPackages: [
    'puppeteer-core',
    '@sparticuz/chromium-min',
    'playwright-core',
  ],
  // Turbopack config (Next 16+ defaults to turbopack)
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push(
        'puppeteer-core',
        '@sparticuz/chromium-min',
        'playwright-core',
      )
    }
    return config
  },
}

module.exports = nextConfig
