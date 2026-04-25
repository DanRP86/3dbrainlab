import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Obliga a Next.js a procesar las librerías 3D correctamente
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
