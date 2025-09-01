import db from "../db/index.js";
import { categoriesTable, titlesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function generateQuestion() {
  const moviesCategory = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.name, "Movies"));

  if (!moviesCategory.length) return null;

  const [category] = moviesCategory;
  const movies = await db
    .select()
    .from(titlesTable)
    .where(eq(titlesTable.categoryId, category.id));

  if (!movies.length) return null;

  const random = movies[Math.floor(Math.random() * movies.length)];
  const initials = random.name
    .split(" ")
    .map((w) => w[0].toUpperCase())
    .join("");

  return { id: random.id.toString(), initials, fullTitle: random.name };
}
