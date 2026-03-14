# Cloud PHP Lab Workspace

## Overview

pnpm workspace monorepo using TypeScript. A Cloud PHP Lab — a browser-based IDE for students to code PHP, manage databases, preview websites, and download projects.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/cloud-php-lab) at `/`
- **API framework**: Express 5 (artifacts/api-server) at `/api`
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **PHP runtime**: PHP 8.3 CLI (system installed)
- **File export**: archiver (ZIP with SQL dump)

## Features

- **Authentication**: JWT-based register/login/logout, bcrypt password hashing
- **Project management**: Create, rename, delete PHP projects
- **File explorer**: Tree view with create/rename/delete file and folder operations
- **Code editor**: Monaco Editor (VS Code) with PHP/HTML/CSS/JS/SQL syntax highlighting + auto-save
- **PHP execution**: Runs PHP CLI with disabled dangerous functions, memory/time limits
- **Live preview**: Iframe showing PHP rendered HTML output
- **Database management**: Per-user PostgreSQL schemas, SQL query runner, table browser
- **Project export**: ZIP download with all files + SQL dump

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/       # Express API server
│   │   └── src/
│   │       ├── middleware/auth.ts      # JWT auth middleware
│   │       ├── services/workspace.ts  # File system / path validation
│   │       └── routes/
│   │           ├── auth.ts            # Register/Login/Logout/Me
│   │           ├── projects.ts        # Projects + File management
│   │           ├── php.ts             # PHP execution
│   │           ├── databases.ts       # Database CRUD + SQL query
│   │           └── export.ts          # ZIP project export
│   └── cloud-php-lab/    # React + Vite frontend (/)
│       └── src/
│           ├── lib/auth.ts            # Token management + fetch interceptor
│           ├── pages/auth.tsx         # Login/Register page
│           ├── pages/dashboard.tsx    # Project grid
│           ├── pages/ide.tsx          # Full IDE workspace
│           └── components/ide/FileTree.tsx
├── lib/
│   ├── api-spec/openapi.yaml  # Full API contract
│   ├── api-client-react/      # Generated React Query hooks
│   ├── api-zod/               # Generated Zod schemas
│   └── db/src/schema/
│       ├── users.ts           # users table
│       ├── projects.ts        # projects table
│       └── databases.ts       # user_databases table
├── workspaces/                # User workspace files (auto-created)
└── pnpm-workspace.yaml
```

## Security

- JWT authentication on all API routes
- Path traversal prevention (validatePath / validateProjectPath)
- PHP dangerous function blocking (exec, shell_exec, system, etc.)
- PHP execution time limit (10s) and memory limit (64MB)
- Rate limiting (500 req / 15 min per IP)
- Per-user workspace isolation

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — PostgreSQL components
- `JWT_SECRET` — JWT signing secret (defaults to dev value, set in production)
- `WORKSPACES_ROOT` — Where user workspaces are stored (defaults to `cwd/workspaces`)
- `PORT` — Server port (auto-set by Replit)

## Development

```bash
# Run API server
pnpm --filter @workspace/api-server run dev

# Run frontend
pnpm --filter @workspace/cloud-php-lab run dev

# Push DB schema changes
pnpm --filter @workspace/db run push

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```
