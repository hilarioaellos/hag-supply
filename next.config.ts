import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Unsplash
      { protocol: "https", hostname: "images.unsplash.com" },
      // Pexels
      { protocol: "https", hostname: "images.pexels.com" },
      // Cualquier CDN de imágenes de productos — agregar según seed real
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
};

export default nextConfig;
