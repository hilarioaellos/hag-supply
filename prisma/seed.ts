import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const categories = [
  { name: "Home and Kitchen", slug: "home-and-kitchen" },
  { name: "Cleaning Supplies", slug: "cleaning-supplies" },
  { name: "Tools and Hardware", slug: "tools-and-hardware" },
  { name: "Patio and Garden", slug: "patio-and-garden" },
  { name: "Pet Supplies", slug: "pet-supplies" },
  { name: "General Merchandise", slug: "general-merchandise" },
  { name: "Toys", slug: "toys" },
];

async function main() {
  console.log("Seeding categories...");
  for (const cat of categories) {
    await db.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    console.log(`  ✓ ${cat.name}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
