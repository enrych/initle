import "dotenv/config";
import db from "./index.js";
import { categoriesTable, titlesTable } from "./schema.js";

async function seed() {
  const [moviesCategory] = await db
    .insert(categoriesTable)
    .values({ name: "Movies" })
    .returning();

  if (!moviesCategory) {
    throw new Error("Failed to insert Movies category");
  }

  await db.insert(titlesTable).values([
    { name: "Inception", categoryId: moviesCategory.id },
    { name: "The Matrix", categoryId: moviesCategory.id },
    { name: "I Know What You Did Last Summer", categoryId: moviesCategory.id },
  ]);

  console.log("✅ Seeded database with Movies category + titles");
}

seed().then(() => process.exit(0));
