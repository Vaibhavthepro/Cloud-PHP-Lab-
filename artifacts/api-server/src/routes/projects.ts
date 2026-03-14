import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import {
  getProjectPath,
  ensureWorkspace,
  buildFileTree,
  validateProjectPath,
} from "../services/workspace.js";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import fs from "fs";
import path from "path";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res) => {
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, req.userId!));

  res.json(
    projects.map((p) => ({
      id: p.id,
      userId: p.userId,
      projectName: p.projectName,
      projectPath: p.projectPath,
      createdAt: p.createdAt,
    }))
  );
});

router.post("/", async (req: AuthRequest, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { projectName } = parsed.data;

  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const projectPath = getProjectPath(req.userId!, safeName);

  const existing = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.userId, req.userId!), eq(projectsTable.projectName, safeName)))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Project already exists" });
    return;
  }

  ensureWorkspace(req.userId!);
  fs.mkdirSync(projectPath, { recursive: true });

  const indexPhp = `<?php
// Welcome to Cloud PHP Lab!
echo "<h1>Hello from ${safeName}!</h1>";
echo "<p>Edit this file to start building your PHP project.</p>";
?>`;
  fs.writeFileSync(path.join(projectPath, "index.php"), indexPhp);

  const [project] = await db
    .insert(projectsTable)
    .values({
      userId: req.userId!,
      projectName: safeName,
      projectPath,
    })
    .returning();

  res.status(201).json({
    id: project.id,
    userId: project.userId,
    projectName: project.projectName,
    projectPath: project.projectPath,
    createdAt: project.createdAt,
  });
});

router.get("/:projectId", async (req: AuthRequest, res) => {
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

  res.json({
    id: project.id,
    userId: project.userId,
    projectName: project.projectName,
    projectPath: project.projectPath,
    createdAt: project.createdAt,
  });
});

router.patch("/:projectId", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const parsed = UpdateProjectBody.safeParse(req.body);
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

  const newName = parsed.data.projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const newPath = getProjectPath(req.userId!, newName);

  if (fs.existsSync(project.projectPath)) {
    fs.renameSync(project.projectPath, newPath);
  }

  const [updated] = await db
    .update(projectsTable)
    .set({ projectName: newName, projectPath: newPath })
    .where(eq(projectsTable.id, projectId))
    .returning();

  res.json({
    id: updated.id,
    userId: updated.userId,
    projectName: updated.projectName,
    projectPath: updated.projectPath,
    createdAt: updated.createdAt,
  });
});

router.delete("/:projectId", async (req: AuthRequest, res) => {
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

  if (fs.existsSync(project.projectPath)) {
    fs.rmSync(project.projectPath, { recursive: true });
  }

  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  res.json({ success: true, message: "Project deleted" });
});

// File routes
router.get("/:projectId/files", async (req: AuthRequest, res) => {
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

  if (!fs.existsSync(project.projectPath)) {
    res.json([]);
    return;
  }

  const tree = buildFileTree(project.projectPath, project.projectPath);
  res.json(tree);
});

router.get("/:projectId/files/read", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const filePath = req.query.path as string;

  if (!filePath) {
    res.status(400).json({ error: "path query parameter required" });
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

  try {
    const absPath = validateProjectPath(req.userId!, project.projectName, filePath);
    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const content = fs.readFileSync(absPath, "utf-8");
    res.json({ path: filePath, content });
  } catch {
    res.status(400).json({ error: "Invalid path" });
  }
});

router.post("/:projectId/files/write", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { path: filePath, content } = req.body;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const absPath = validateProjectPath(req.userId!, project.projectName, filePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content ?? "", "utf-8");
    res.json({ success: true, message: "File saved" });
  } catch {
    res.status(400).json({ error: "Invalid path" });
  }
});

router.post("/:projectId/files/create-folder", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { path: folderPath } = req.body;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const absPath = validateProjectPath(req.userId!, project.projectName, folderPath);
    fs.mkdirSync(absPath, { recursive: true });
    res.json({ success: true, message: "Folder created" });
  } catch {
    res.status(400).json({ error: "Invalid path" });
  }
});

router.post("/:projectId/files/rename", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { oldPath, newPath } = req.body;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const absOld = validateProjectPath(req.userId!, project.projectName, oldPath);
    const absNew = validateProjectPath(req.userId!, project.projectName, newPath);
    fs.renameSync(absOld, absNew);
    res.json({ success: true, message: "Renamed" });
  } catch {
    res.status(400).json({ error: "Invalid path" });
  }
});

router.post("/:projectId/files/delete", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { path: filePath } = req.body;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const absPath = validateProjectPath(req.userId!, project.projectName, filePath);
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      fs.rmSync(absPath, { recursive: true });
    } else {
      fs.unlinkSync(absPath);
    }
    res.json({ success: true, message: "Deleted" });
  } catch {
    res.status(400).json({ error: "Invalid path or file not found" });
  }
});

export default router;
