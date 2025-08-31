import "dotenv/config";
import express from "express";
import db from "./db/index.js";
import { categoriesTable, titlesTable } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { isNonEmptyArray } from "shared";

const app = express();
const port = 8000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/movies", async (_req, res) => {
  const moviesCategory = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.name, "Movies"));

  if (!isNonEmptyArray(moviesCategory)) {
    return res.status(404).json({ error: "Movies category not found" });
  }

  const [category] = moviesCategory;

  if (!category) {
    return res.status(404).json({ error: "Movies category not found" });
  }

  const movies = await db
    .select()
    .from(titlesTable)
    .where(eq(titlesTable.categoryId, category.id));

  res.json(movies);
});

app.listen(port, () => {
  console.log(`Example app listening on port: ${port}`);
});
