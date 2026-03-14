import { Router } from "express";
import { db, pool, Pool } from "@workspace/db";
import { userDatabasesTable, projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { CreateDatabaseBody, RunQueryBody } from "@workspace/api-zod";

const router = Router();
router.use(requireAuth);

function getUserDbName(userId: number, dbName: string): string {
  const safe = dbName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  return `lab_user_${userId}_${safe}`;
}

async function getOrCreateUserPool(dbName: string): Promise<Pool> {
  return new Pool({
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || "5432"),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: dbName,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
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
  const fullDbName = getUserDbName(req.userId!, dbName);

  const existing = await db
    .select()
    .from(userDatabasesTable)
    .where(eq(userDatabasesTable.dbName, fullDbName))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Database already exists" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`CREATE DATABASE "${fullDbName}"`);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (error.code !== "42P04") {
      res.status(500).json({ error: error.message || "Failed to create database" });
      return;
    }
  } finally {
    client.release();
  }

  const [record] = await db
    .insert(userDatabasesTable)
    .values({ userId: req.userId!, dbName: fullDbName })
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

  const record = await db
    .select()
    .from(userDatabasesTable)
    .where(
      and(
        eq(userDatabasesTable.userId, req.userId!),
        eq(userDatabasesTable.dbName, dbName)
      )
    )
    .limit(1);

  if (record.length === 0) {
    res.status(404).json({ error: "Database not found" });
    return;
  }

  const userPool = await getOrCreateUserPool(dbName);
  const client = await userPool.connect();
  try {
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
    client.release();
    await userPool.end();
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

  const record = await db
    .select()
    .from(userDatabasesTable)
    .where(
      and(
        eq(userDatabasesTable.userId, req.userId!),
        eq(userDatabasesTable.dbName, dbName)
      )
    )
    .limit(1);

  if (record.length === 0) {
    res.status(404).json({ error: "Database not found" });
    return;
  }

  const userPool = await getOrCreateUserPool(dbName);
  const client = await userPool.connect();
  try {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    res.json(result.rows.map((r) => r.table_name));
  } catch {
    res.json([]);
  } finally {
    client.release();
    await userPool.end();
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
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  } finally {
    client.release();
  }

  await db
    .delete(userDatabasesTable)
    .where(eq(userDatabasesTable.id, record.id));

  res.json({ success: true, message: "Database dropped" });
});

export default router;
