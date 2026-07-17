import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const categoriesWithImages = [
  {
    slug: "cleaning-supplies",
    imageUrl: "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80"
  },
  {
    slug: "general-merchandise",
    imageUrl: "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80"
  },
  {
    slug: "home-and-kitchen",
    imageUrl: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&q=80"
  },
  {
    slug: "patio-and-garden",
    imageUrl: "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80"
  },
  {
    slug: "pet-supplies",
    imageUrl: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"
  },
  {
    slug: "tools-and-hardware",
    imageUrl: "https://images.unsplash.com/photo-1572981522632-8ddac2ee6d4a?w=800&q=80"
  },
  {
    slug: "toys",
    imageUrl: "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80"
  }
];

async function main() {
  console.log("Adding images to categories...\n");

  for (const cat of categoriesWithImages) {
    await db.category.update({
      where: { slug: cat.slug },
      data: { imageUrl: cat.imageUrl }
    });
    console.log(`✓ ${cat.slug}`);
  }

  console.log("\n✅ Category images updated!");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
