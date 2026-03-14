import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userDatabasesTable = pgTable("user_databases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  dbName: text("db_name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserDatabaseSchema = createInsertSchema(userDatabasesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUserDatabase = z.infer<typeof insertUserDatabaseSchema>;
export type UserDatabase = typeof userDatabasesTable.$inferSelect;
