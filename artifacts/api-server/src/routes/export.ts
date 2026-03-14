import { Router } from "express";
import { db, pool } from "@workspace/db";
import { projectsTable, userDatabasesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import os from "os";

const router = Router();
router.use(requireAuth);

router.get("/:projectId/export", async (req: AuthRequest, res) => {
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

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phplab-export-"));

  try {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${project.projectName}_export.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      console.error("Archive error:", err);
    });

    archive.pipe(res);

    if (fs.existsSync(project.projectPath)) {
      archive.directory(project.projectPath, "project_files");
    }

    for (const dbRecord of databases) {
      try {
        const dbDump = await dumpSchema(dbRecord.dbName);
        if (dbDump) {
          const dumpPath = path.join(tmpDir, `${dbRecord.dbName}.sql`);
          fs.writeFileSync(dumpPath, dbDump);
          archive.file(dumpPath, { name: `databases/${dbRecord.dbName}.sql` });
        }
      } catch (err) {
        console.error(`Failed to dump schema ${dbRecord.dbName}:`, err);
      }
    }

    const readme = `# ${project.projectName} - Project Export
Generated: ${new Date().toISOString()}

## Contents
- project_files/ - All PHP project files
- databases/ - SQL database schema dumps

## Setup Instructions
1. Copy project_files/ to your web server
2. Import database dumps: psql -d your_db < databases/<name>.sql
3. Update database connection settings in your PHP files
`;
    archive.append(readme, { name: "README.md" });

    await archive.finalize();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

async function dumpSchema(schemaName: string): Promise<string> {
  const client = await pool.connect();
  try {
    const tablesResult = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [schemaName]
    );

    let dump = `-- Schema: ${schemaName}\n-- Generated: ${new Date().toISOString()}\n\n`;
    dump += `CREATE SCHEMA IF NOT EXISTS "${schemaName}";\n`;
    dump += `SET search_path TO "${schemaName}";\n\n`;

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      const colResult = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = $2
         ORDER BY ordinal_position`,
        [tableName, schemaName]
      );

      dump += `\n-- Table: ${tableName}\n`;
      dump += `DROP TABLE IF EXISTS "${tableName}";\n`;
      dump += `CREATE TABLE "${tableName}" (\n`;
      const cols = colResult.rows.map((c) => {
        let def = `  "${c.column_name}" ${c.data_type}`;
        if (c.is_nullable === "NO") def += " NOT NULL";
        if (c.column_default) def += ` DEFAULT ${c.column_default}`;
        return def;
      });
      dump += cols.join(",\n");
      dump += `\n);\n`;

      const dataResult = await client.query(
        `SELECT * FROM "${schemaName}"."${tableName}"`
      );
      for (const dataRow of dataResult.rows) {
        const cols = Object.keys(dataRow).map((k) => `"${k}"`).join(", ");
        const vals = Object.values(dataRow)
          .map((v) => {
            if (v === null) return "NULL";
            if (typeof v === "number") return String(v);
            return `'${String(v).replace(/'/g, "''")}'`;
          })
          .join(", ");
        dump += `INSERT INTO "${tableName}" (${cols}) VALUES (${vals});\n`;
      }
    }

    return dump;
  } finally {
    client.release();
  }
}

export default router;
