import path from "path";
import fs from "fs";

const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || path.join(process.cwd(), "workspaces");

export function getUserWorkspace(userId: number): string {
  return path.join(WORKSPACES_ROOT, String(userId), "projects");
}

export function getProjectPath(userId: number, projectName: string): string {
  return path.join(getUserWorkspace(userId), projectName);
}

export function ensureWorkspace(userId: number): void {
  const wsPath = getUserWorkspace(userId);
  fs.mkdirSync(wsPath, { recursive: true });
}

export function validatePath(userId: number, requestedPath: string): string {
  const wsRoot = getUserWorkspace(userId);
  const resolved = path.resolve(wsRoot, requestedPath);
  if (!resolved.startsWith(wsRoot)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function validateProjectPath(userId: number, projectName: string, filePath: string): string {
  const projectRoot = getProjectPath(userId, projectName);
  const resolved = path.resolve(projectRoot, filePath);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export function buildFileTree(dirPath: string, relativeTo: string): FileNode[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "directory",
        children: buildFileTree(fullPath, relativeTo),
      });
    } else {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "file",
      });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
