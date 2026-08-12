import { PrismaClient } from "@prisma/client";

const railway = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:WBbHdFKabfTzufgIzOhtCnwrZWDmLzoN@tokaido.proxy.rlwy.net:38291/railway",
    },
  },
});

const supabase = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL!,
    },
  },
});

async function main() {
  console.log("Iniciando migracion Railway -> Supabase...\n");

  // 1. Categorias
  const categories = await railway.category.findMany();
  console.log(`Categorias encontradas: ${categories.length}`);
  for (const cat of categories) {
    await supabase.category.upsert({
      where: { id: cat.id },
      update: cat,
      create: cat,
    });
  }
  console.log(`Categorias migradas: ${categories.length}`);

  // 2. Productos
  const products = await railway.product.findMany();
  console.log(`\nProductos encontrados: ${products.length}`);
  for (const product of products) {
    await supabase.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }
  console.log(`Productos migrados: ${products.length}`);

  // 3. Usuarios
  const users = await railway.user.findMany();
  console.log(`\nUsuarios encontrados: ${users.length}`);
  for (const user of users) {
    await supabase.user.upsert({
      where: { id: user.id },
      update: user,
      create: user,
    });
  }
  console.log(`Usuarios migrados: ${users.length}`);

  // 4. Ordenes
  const orders = await railway.order.findMany();
  console.log(`\nOrdenes encontradas: ${orders.length}`);
  for (const order of orders) {
    await supabase.order.upsert({
      where: { id: order.id },
      update: order,
      create: order,
    });
  }
  console.log(`Ordenes migradas: ${orders.length}`);

  // 5. Items de orden
  const orderItems = await railway.orderItem.findMany();
  console.log(`\nItems de orden encontrados: ${orderItems.length}`);
  for (const item of orderItems) {
    await supabase.orderItem.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }
  console.log(`Items de orden migrados: ${orderItems.length}`);

  // 6. Cart items
  const cartItems = await railway.cartItem.findMany();
  console.log(`\nCart items encontrados: ${cartItems.length}`);
  for (const item of cartItems) {
    await supabase.cartItem.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }
  console.log(`Cart items migrados: ${cartItems.length}`);

  console.log("\n✓ Migracion completada exitosamente.");
}

main()
  .catch((e) => {
    console.error("Error en migracion:", e);
    process.exit(1);
  })
  .finally(async () => {
    await railway.$disconnect();
    await supabase.$disconnect();
  });
