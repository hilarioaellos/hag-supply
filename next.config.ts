import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: process.env.NODE_ENV === "development",
    remotePatterns: [
      // Unsplash — solo imágenes de contenido
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      // Pexels — solo imágenes de contenido
      {
        protocol: "https",
        hostname: "images.pexels.com",
        pathname: "/photos/**",
      },
      // DummyJSON — productos de prueba
      {
        protocol: "https",
        hostname: "cdn.dummyjson.com",
        pathname: "/**",
      },
      // Se agregarán dominios reales al definir el bucket de producción en HAG-25
    ],
  },
};

export default nextConfig;
