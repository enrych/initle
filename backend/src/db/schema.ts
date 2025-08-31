import { pgTable, text, integer, serial } from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const titlesTable = pgTable("titles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
});
