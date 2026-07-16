import { cache } from "react";
import { db } from "@/lib/db";

export const getCategories = cache(async () => {
  try {
    return await db.category.findMany({
      select: { name: true, slug: true, imageUrl: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
});
