# Messages App — Setup Guide

A private two-person real-time PWA chat app. This guide takes you from zero to a running local environment and then a live production deployment.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Go 1.26+ | `brew install go` |
| Node.js 20+ | `brew install node` |
| Fly CLI | `brew install flyctl` |
| A Supabase account | supabase.com (free) |
| A Cloudflare account | cloudflare.com (free) |

---

## Step 1 — Supabase (Database + Auth)

1. Go to [supabase.com](https://supabase.com) and create a new project. Pick a region close to where you'll host the Go server (e.g. US East).

2. Once the project is ready, open **SQL Editor** and run all three migrations in order:

   ```sql
   -- Paste and run supabase/migrations/001_init.sql
   -- Paste and run supabase/migrations/002_read_receipts.sql
   -- Paste and run supabase/migrations/003_reactions.sql
   ```

3. Copy your **connection string** from **Settings → Database → Connection string → URI** (use the "Session mode" pooler URL — port 5432). It looks like:

   ```
   postgres://postgres.xxxx:your-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

   Save it — you'll need it as `DATABASE_URL`.

---

## Step 2 — Cloudflare R2 (Media Storage)

1. In the Cloudflare dashboard, go to **R2 Object Storage** and create a bucket (e.g. `messages-media`).

2. Enable **Public access** on the bucket (or set up a custom domain). Copy the public bucket URL — this is your `R2_CDN_URL`.

3. Go to **R2 → Manage R2 API tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Scope: the bucket you just created

   Save the **Access Key ID** and **Secret Access Key**.

4. Your **Account ID** is visible in the Cloudflare dashboard sidebar URL or under **R2 → Overview**.

---

## Step 3 — Generate Auth Tokens

Pick two random secret strings — one for each user. Use a password manager or run:

```bash
openssl rand -hex 32   # run twice, once for each user
```

Call them `TOKEN_A` (for user_a) and `TOKEN_B` (for user_b). Keep them private — whoever holds a token can use the app.

---

## Step 4 — Configure the Go Server

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
DATABASE_URL=postgres://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres
AUTH_TOKEN_A=your-token-a
AUTH_TOKEN_B=your-token-b
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=messages-media
R2_CDN_URL=https://pub-xxxx.r2.dev
PORT=8080
```

Run the server:

```bash
cd server
go run .
```

You should see:

```
server listening on :8080
```

Test it:

```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

---

## Step 5 — Configure the Next.js App

```bash
cd app
cp .env.local.example .env.local
```

Edit `app/.env.local`:

```env
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_AUTH_TOKEN=your-token-a        # use token_a on this device
NEXT_PUBLIC_USER_ID=user_a                 # must match the token above
```

> **Note:** Each person runs their own copy of the frontend with their own token. User A sets `AUTH_TOKEN=your-token-a` and `USER_ID=user_a`. User B sets the other pair.

Install dependencies and start:

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the chat UI with a green "connected" dot.

---

## Step 6 — Test Locally with Two Users

Open a second terminal and start the app again with user_b's token. The easiest way is to temporarily swap the values in `.env.local` and open a new private/incognito browser window:

```env
NEXT_PUBLIC_AUTH_TOKEN=your-token-b
NEXT_PUBLIC_USER_ID=user_b
```

Then `npm run dev` (or just open the existing dev server in an incognito window after updating the env). Type a message in one window — it should appear in the other within milliseconds.

---

## Step 7 — Add PWA Icons

The PWA manifest references two icon sizes. Add them to `app/public/`:

- `icon-192.png` — 192×192 px
- `icon-512.png` — 512×512 px

Any image editor works. On macOS, you can convert an existing image:

```bash
sips -z 192 192 your-icon.png --out app/public/icon-192.png
sips -z 512 512 your-icon.png --out app/public/icon-512.png
```

---

## Step 8 — Deploy the Go Server to Fly.io

### First deploy

```bash
# Authenticate
flyctl auth login

# Launch (creates the app on Fly.io — only needed once)
flyctl launch --name messages-server --region iad --no-deploy

# Set all secrets
flyctl secrets set \
  DATABASE_URL="postgres://..." \
  AUTH_TOKEN_A="your-token-a" \
  AUTH_TOKEN_B="your-token-b" \
  R2_ACCOUNT_ID="your-account-id" \
  R2_ACCESS_KEY_ID="your-key-id" \
  R2_SECRET_ACCESS_KEY="your-secret" \
  R2_BUCKET="messages-media" \
  R2_CDN_URL="https://pub-xxxx.r2.dev"

# Deploy
flyctl deploy
```

### Verify

```bash
flyctl status              # machine should show "started"
flyctl logs                # watch for errors
curl https://messages-server.fly.dev/health
```

Your WebSocket URL is now `wss://messages-server.fly.dev/ws`.

### Subsequent deploys

Any push to `main` that changes files in `server/` will trigger auto-deploy via GitHub Actions (once you add `FLY_API_TOKEN` as a repository secret — get it with `flyctl tokens create deploy`).

---

## Step 9 — Deploy the Frontend to Vercel

### First deploy

```bash
cd app
npx vercel login
npx vercel link      # link to your Vercel account / create a new project
```

In the [Vercel dashboard](https://vercel.com/dashboard), open your project → **Settings → Environment Variables** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_WS_URL` | `wss://messages-server.fly.dev/ws` |
| `NEXT_PUBLIC_API_URL` | `https://messages-server.fly.dev` |
| `NEXT_PUBLIC_AUTH_TOKEN` | `your-token-a` (or b — one token per deployment) |
| `NEXT_PUBLIC_USER_ID` | `user_a` (or `user_b`) |

> **Two deployments for two users:** Each person needs their own Vercel deployment (or one person self-hosts). Deploy once for User A with `TOKEN_A` / `user_a`, and deploy again for User B with `TOKEN_B` / `user_b`. You can use separate Vercel projects or separate environment variable sets on the same project.

Then deploy:

```bash
npx vercel --prod
```

Vercel will auto-deploy on every push to `main` that touches `app/`.

---

## Step 10 — Install as a PWA

On **iOS (Safari):** Open your Vercel URL → tap the Share button → **Add to Home Screen**.

On **Android (Chrome):** Open the URL → tap the three-dot menu → **Add to Home Screen** (or look for the install banner).

The app will open as a standalone window with no browser chrome — exactly like a native app.

---

## GitHub Actions CI/CD (Optional)

To auto-deploy the Go server on every push:

1. Get a deploy token: `flyctl tokens create deploy -x 999999h`
2. Add it as a secret in your GitHub repo: **Settings → Secrets → Actions → New** → name it `FLY_API_TOKEN`

The workflow at `.github/workflows/deploy-go.yml` will handle the rest.

---

## Troubleshooting

### "unauthorized" on WebSocket connect
- Check that `NEXT_PUBLIC_AUTH_TOKEN` matches `AUTH_TOKEN_A` or `AUTH_TOKEN_B` exactly (no extra spaces or newlines).
- Confirm the Go server is running and reachable.

### Messages not persisting after refresh
- Check `DATABASE_URL` is correct and the Supabase project is active (free projects pause after 1 week of inactivity).
- Run `flyctl logs` and look for `db ping failed`.

### Images not uploading
- Confirm R2 bucket has public access enabled.
- Check that `R2_CDN_URL` does not have a trailing slash.
- Open browser DevTools → Network → look for the `POST /api/media/upload-url` response.

### App shows "disconnected" permanently
- The WebSocket URL must use `wss://` in production (not `ws://`).
- Fly.io's `force_https = true` in `fly.toml` handles this automatically.

### Supabase project paused
- Free Supabase projects pause after 7 days of inactivity. Go to the Supabase dashboard and click **Restore** to wake it up.

---

## Cost Summary

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Vercel | Hobby (free) | $0 |
| Fly.io | shared-cpu-1x, 512 MB | ~$5–6 |
| Cloudflare R2 | Free tier (10 GB) | $0 |
| Supabase | Free tier (500 MB) | $0 |
| **Total** | | **~$5–6/month** |
