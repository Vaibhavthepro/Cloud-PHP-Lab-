import { Router } from "express";
import { db, pool } from "@workspace/db";
import { userDatabasesTable, projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { CreateDatabaseBody, RunQueryBody } from "@workspace/api-zod";

const router = Router();
router.use(requireAuth);

function getSchemaName(userId: number, dbName: string): string {
  const safe = dbName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  return `lab_user_${userId}_${safe}`;
}

router.get("/:projectId/databases", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const databases = await db
    .select()
    .from(userDatabasesTable)
    .where(eq(userDatabasesTable.userId, req.userId!));

  res.json(
    databases.map((d) => ({
      id: d.id,
      userId: d.userId,
      dbName: d.dbName,
      createdAt: d.createdAt,
    }))
  );
});

router.post("/:projectId/databases", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const parsed = CreateDatabaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { dbName } = parsed.data;
  const schemaName = getSchemaName(req.userId!, dbName);

  const existing = await db
    .select()
    .from(userDatabasesTable)
    .where(eq(userDatabasesTable.dbName, schemaName))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Database already exists" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  } catch (err: unknown) {
    const error = err as { message?: string };
    res.status(500).json({ error: error.message || "Failed to create database schema" });
    return;
  } finally {
    client.release();
  }

  const [record] = await db
    .insert(userDatabasesTable)
    .values({ userId: req.userId!, dbName: schemaName })
    .returning();

  res.status(201).json({
    id: record.id,
    userId: record.userId,
    dbName: record.dbName,
    createdAt: record.createdAt,
  });
});

router.post("/:projectId/databases/:dbName/query", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { dbName } = req.params;
  const parsed = RunQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [record] = await db
    .select()
    .from(userDatabasesTable)
    .where(
      and(
        eq(userDatabasesTable.userId, req.userId!),
        eq(userDatabasesTable.dbName, dbName)
      )
    )
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Database not found" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${dbName}"`);
    await client.query(`SET search_path TO "${dbName}", public`);
    const result = await client.query(parsed.data.sql);
    const columns = result.fields ? result.fields.map((f) => f.name) : [];
    res.json({
      columns,
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
    });
  } catch (err: unknown) {
    const error = err as { message?: string };
    res.json({
      columns: [],
      rows: [],
      rowCount: 0,
      error: error.message || "Query failed",
    });
  } finally {
    await client.query(`SET search_path TO public`);
    client.release();
  }
});

router.get("/:projectId/databases/:dbName/tables", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { dbName } = req.params;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [record] = await db
    .select()
    .from(userDatabasesTable)
    .where(
      and(
        eq(userDatabasesTable.userId, req.userId!),
        eq(userDatabasesTable.dbName, dbName)
      )
    )
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Database not found" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${dbName}"`);
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [dbName]
    );
    res.json(result.rows.map((r) => r.table_name));
  } catch {
    res.json([]);
  } finally {
    client.release();
  }
});

router.delete("/:projectId/databases/:dbName", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { dbName } = req.params;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [record] = await db
    .select()
    .from(userDatabasesTable)
    .where(
      and(
        eq(userDatabasesTable.userId, req.userId!),
        eq(userDatabasesTable.dbName, dbName)
      )
    )
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Database not found" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${dbName}" CASCADE`);
  } finally {
    client.release();
  }

  await db.delete(userDatabasesTable).where(eq(userDatabasesTable.id, record.id));
  res.json({ success: true, message: "Database dropped" });
});

export default router;
