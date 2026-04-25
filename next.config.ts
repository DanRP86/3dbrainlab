import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignora los errores de ESLint durante el build en Vercel
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignora los errores de tipos de TypeScript durante el build
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
