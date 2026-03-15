# Deploy Cloud PHP Lab (Railway + Vercel)

**Frontend** → Vercel  
**Backend + PostgreSQL** → Railway  

---

## Part 1: Deploy Backend + Database on Railway

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in (GitHub).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select this repository and connect it.

### 2. Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**.
2. Wait for it to deploy. Click the Postgres service → **Variables**.
3. Copy the `DATABASE_URL` value (you’ll use it for the API).

### 3. Deploy the API service

1. Click **+ New** → **GitHub Repo** and select the same repo again (or use the existing service if Railway created one).
2. In the service → **Settings** → **Build**:
   - **Builder**: Dockerfile (Railway should auto-detect `railway.toml`).
   - Or set **Dockerfile Path** to `artifacts/api-server/Dockerfile` if needed.
3. In **Variables**, add:

   | Variable        | Value |
   |-----------------|-------|
   | `DATABASE_URL`  | _(paste from Postgres service)_ |
   | `PORT`          | `3000` |
   | `NODE_ENV`      | `production` |
   | `WORKSPACES_ROOT` | `/app/workspaces` _(optional, default)_ |

4. Open **Settings** → **Networking** → **Generate Domain** and copy the public URL (e.g. `https://xxx.up.railway.app`).
5. Redeploy the API service and wait for it to be healthy.

### 4. Create DB tables

1. On your machine, set the Railway Postgres URL as `DATABASE_URL` and run:

   ```bash
   set DATABASE_URL=postgresql://user:pass@host:port/railway
   pnpm --filter "@workspace/db" push
   ```

   Or use **Railway CLI** and run:

   ```bash
   railway run pnpm --filter "@workspace/db" push
   ```

   (Make sure `DATABASE_URL` from the Postgres service is available.)

2. After the push succeeds, the `users` and `projects` tables will exist.

---

## Part 2: Deploy Frontend on Vercel

### 1. Create a Vercel project

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub).
2. Click **Add New** → **Project**.
3. Import this repository.

### 2. Configure build settings

Vercel should pick up `vercel.json`. If not, set:

- **Root Directory**: leave as `.` (repo root)
- **Build Command**: `pnpm install && pnpm --filter "@workspace/cloud-php-lab" build`
- **Output Directory**: `artifacts/cloud-php-lab/dist/public`
- **Install Command**: `pnpm install`

### 3. Set environment variables

In **Settings** → **Environment Variables**, add:

| Name            | Value                                         |
|-----------------|-----------------------------------------------|
| `VITE_API_URL`  | `https://YOUR-RAILWAY-API-URL.up.railway.app` |
| `PORT`          | `3000` _(optional, has default)_             |
| `BASE_PATH`     | `/` _(optional, has default)_                |

Use the Railway API domain from Part 1 (no trailing slash).

### 4. Deploy

1. Click **Deploy**.
2. Wait for the build to finish.
3. Open the Vercel URL. The app should load and talk to the Railway API.

---

## Summary

| Component  | Platform | URL                                      |
|------------|----------|------------------------------------------|
| Frontend   | Vercel   | `https://your-app.vercel.app`            |
| API        | Railway  | `https://xxx.up.railway.app`             |
| PostgreSQL | Railway  | (internal, via `DATABASE_URL`)           |

---

## Troubleshooting

- **502 / API not reachable**: Ensure `VITE_API_URL` in Vercel exactly matches the Railway API domain (including `https://`, no trailing slash).
- **Registration fails**: Run `pnpm --filter "@workspace/db" push` so tables exist.
- **PHP execution fails**: The API Docker image includes PHP; if errors persist, check Railway logs for the API service.
- **CORS issues**: The API uses `cors({ origin: true })` and should accept the Vercel origin; if needed, add explicit CORS config in the API for your Vercel domain.
