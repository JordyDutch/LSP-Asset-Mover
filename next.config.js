/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.universalprofile.cloud' },
    ],
  },
  webpack: (config) => {
    // Suppress warnings from @metamask/sdk (bundles react-native code)
    // and pino (used by @walletconnect/logger)
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
}

module.exports = nextConfig
