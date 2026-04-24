/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@topolog/contracts", "@topolog/sdk-ts"],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
