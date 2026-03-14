import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { validateProjectPath } from "../services/workspace.js";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const router = Router();

router.use(requireAuth);

const PHP_BINARY = "php";
const PHP_TIMEOUT = 10000;

const DISABLED_FUNCTIONS = [
  "exec",
  "shell_exec",
  "system",
  "passthru",
  "proc_open",
  "popen",
  "curl_exec",
  "curl_multi_exec",
  "parse_ini_file",
  "show_source",
];

function getPhpIniArgs(): string[] {
  return [
    `-d`, `disable_functions=${DISABLED_FUNCTIONS.join(",")}`,
    `-d`, `max_execution_time=10`,
    `-d`, `memory_limit=64M`,
    `-d`, `display_errors=1`,
    `-d`, `error_reporting=E_ALL`,
  ];
}

router.post("/:projectId/php/execute", async (req: AuthRequest, res) => {
  const projectId = parseInt(req.params.projectId);
  const { filePath } = req.body;

  if (!filePath) {
    res.status(400).json({ output: "", error: "filePath is required", exitCode: 1 });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.userId, req.userId!)))
    .limit(1);

  if (!project) {
    res.status(404).json({ output: "", error: "Project not found", exitCode: 1 });
    return;
  }

  try {
    const absPath = validateProjectPath(req.userId!, project.projectName, filePath);

    if (!fs.existsSync(absPath)) {
      res.json({ output: "", error: `File not found: ${filePath}`, exitCode: 1 });
      return;
    }

    const phpArgs = [...getPhpIniArgs(), absPath];

    const { stdout, stderr } = await execFileAsync(PHP_BINARY, phpArgs, {
      timeout: PHP_TIMEOUT,
      cwd: path.dirname(absPath),
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
      maxBuffer: 5 * 1024 * 1024,
    });

    res.json({
      output: stdout,
      error: stderr || undefined,
      exitCode: 0,
    });
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    res.json({
      output: error.stdout || "",
      error: error.stderr || error.message || "Execution failed",
      exitCode: error.code || 1,
    });
  }
});

export default router;
