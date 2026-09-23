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
      // Supabase Storage — bucket público product-media (catálogo real)
      {
        protocol: "https",
        hostname: "tkhtldfmfivughpeyonm.supabase.co",
        pathname: "/storage/v1/object/public/product-media/**",
      },
    ],
  },
};

export default nextConfig;
