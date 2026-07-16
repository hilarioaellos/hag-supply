import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
      // Se agregarán dominios reales al definir el bucket de producción en HAG-25
    ],
  },
};

export default nextConfig;
