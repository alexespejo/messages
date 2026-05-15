# Product Requirements Document
## Private Messenger — Two-Person Real-Time Chat App

**Version:** 0.2 (Draft)
**Last Updated:** 2026-05-12
**Status:** In Progress

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Feature Spec](#3-feature-spec)
4. [Performance Requirements](#4-performance-requirements)
5. [API & Data Model](#5-api--data-model)
6. [Deployment Architecture](#6-deployment-architecture)

---

## 1. Overview & Goals

### 1.1 Summary

A private, two-person progressive web app (PWA) designed for low-latency real-time messaging and media sharing. The app prioritizes speed above all else — messages should feel instantaneous, with no perceptible delay between sending and receipt.

### 1.2 Users

| Role | Description |
|------|-------------|
| User A | One of exactly two participants in the shared conversation |
| User B | The other participant |

There is no user discovery, no groups, no public presence. The system is purpose-built for a single persistent two-way conversation.

### 1.3 Goals

- **Zero perceived lag** — messages appear on the recipient's device before the database write completes
- **Always available** — no cold starts, no serverless spin-up delays; the backend is a long-running process
- **Offline resilience** — messages queued locally when offline and synced on reconnect
- **Lightweight** — fast initial load as a PWA, minimal JS bundle, works well on mobile

### 1.4 Non-Goals

- Multi-user or group messaging
- End-to-end encryption (out of scope for v1; may be revisited)
- User sign-up flows or account creation beyond initial auth
- Native iOS/Android apps (PWA is sufficient)

---

## 2. Architecture & Tech Stack

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────┐
│           PWA (Next.js)              │
│  - App Router UI                     │
│  - Web Worker (image compression)    │
│  - Service Worker (offline queue)    │
└───────────┬──────────────────────────┘
            │ WebSocket + REST
            ▼
┌──────────────────────────────────────┐
│        Go Real-Time Engine           │
│  - WebSocket Hub (Gorilla/WS)        │
│  - Broadcast-First relay logic       │
│  - Pre-signed R2 URL generation      │
│  - Async Postgres writes             │
└───────┬──────────────────────────────┘
        │              │
        ▼              ▼
┌──────────────┐  ┌─────────────────────┐
│  Supabase    │  │  Cloudflare R2      │
│  (Postgres)  │  │  (Media Storage)    │
└──────────────┘  └─────────────────────┘
```

### 2.2 Component Breakdown

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| **Frontend** | Next.js (App Router) | PWA shell, chat UI, image editor |
| **Real-Time Engine** | Go + Gorilla WebSocket | Message relay, presence, connection management |
| **HTTP API** | Go + Fiber | Pre-signed URL generation, message history fetch |
| **Database** | Supabase (Postgres) | Persistent message & media storage |
| **Media Storage** | Cloudflare R2 | Image/video hosting at edge |
| **Hosting** | Fly.io or Railway | Always-warm Go binary; no cold starts |

### 2.3 Key Architectural Decisions

**Broadcast-First Messaging**
Messages are relayed to the recipient via WebSocket before the database write completes. The persistence step happens asynchronously in the background. This decouples UI responsiveness from I/O latency.

**Direct-to-R2 Uploads**
The Go server generates pre-signed Cloudflare R2 URLs. The client uploads media directly to R2's edge, bypassing the application server entirely. This removes a network hop and reduces upload latency significantly.

**Always-Warm Backend**
The Go binary runs as a persistent process on a VPS or PaaS platform (Fly.io/Railway). Unlike serverless functions, there is no cold start. WebSocket connections remain open indefinitely.

**Web Worker for Compression**
Image compression is offloaded to a Web Worker on the client, keeping the main thread free and the UI responsive during media preparation.

---

## 3. Feature Spec

### 3.1 Messaging

| Feature | Description | Priority |
|---------|-------------|----------|
| Send text message | Plain-text messages delivered via WebSocket | P0 |
| Receive text message | Real-time push to recipient's open connection | P0 |
| Message history | Paginated load of prior messages on app open | P0 |
| Typing indicator | Lightweight presence signal over WebSocket | P1 |
| Read receipts | Mark messages as seen when recipient views them | P1 |
| Message reactions | Single emoji reaction per message | P2 |
| Message deletion | Soft-delete with "message removed" placeholder | P2 |

### 3.2 Media Sharing

| Feature | Description | Priority |
|---------|-------------|----------|
| Image send | Compress in Web Worker → upload direct to R2 → send R2 URL over WS | P0 |
| Image preview | Inline thumbnail with tap-to-expand lightbox | P0 |
| Image editor | Basic crop/rotate/filter before sending | P1 |
| Video send | Short clips (≤ 30s); same direct-to-R2 flow | P2 |

### 3.3 PWA & Offline

| Feature | Description | Priority |
|---------|-------------|----------|
| Installable PWA | Add-to-home-screen with app icon and splash | P0 |
| Offline message queue | Messages composed offline are queued and sent on reconnect | P1 |
| Push notifications | Web Push when app is backgrounded | P1 |
| Background sync | Service Worker syncs queue when connection restores | P1 |

### 3.4 Auth & Security

| Feature | Description | Priority |
|---------|-------------|----------|
| Simple token auth | Pre-shared token or Supabase Auth for the two known users | P0 |
| WebSocket auth | Token validated on WS handshake; connections rejected without it | P0 |
| HTTPS/WSS only | All traffic over TLS | P0 |

---

## 4. Performance Requirements

### 4.1 Latency Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Message relay (WS → WS) | < 10ms | Server-side relay; excludes network RTT |
| End-to-end message delivery | < 150ms | On same continent, good connection |
| Pre-signed URL generation | < 5ms | In-memory; no DB call required |
| App initial load (PWA) | < 2s | On LTE; after service worker install |
| Image upload start | < 500ms | Time from send tap to upload begin |

### 4.2 Reliability

| Metric | Target |
|--------|--------|
| Backend uptime | 99.9% (Fly.io/Railway SLA) |
| Message delivery guarantee | At-least-once (client retries on WS reconnect) |
| Offline queue durability | Persisted to IndexedDB; survives app restart |

### 4.3 Scalability

The system is explicitly designed for **two concurrent users**. Scalability beyond this is not a requirement. The Go Hub manages exactly two `*Client` connections with near-zero overhead.

### 4.4 Performance Constraints & Strategies

- **No serverless functions** for the real-time path; cold starts are unacceptable
- **Async DB writes** must not block the message relay goroutine
- **Image compression** must complete in a Web Worker before the upload begins; it must never block the UI thread
- **WebSocket ping/pong** heartbeats every 30s to detect stale connections without relying on TCP keepalives alone

---

## 5. API & Data Model

### 5.1 WebSocket Message Schema

All WebSocket frames use JSON (Protobuf may be substituted in a future optimization pass).

**Outbound — Send Message**
```json
{
  "type": "message",
  "id": "client-generated-uuid",
  "content": "Hey!",
  "media_url": null,
  "timestamp": "2026-05-12T10:00:00Z"
}
```

**Inbound — Receive Message (relayed by server)**
```json
{
  "type": "message",
  "id": "client-generated-uuid",
  "from": "user_a",
  "content": "Hey!",
  "media_url": null,
  "timestamp": "2026-05-12T10:00:00Z",
  "persisted": false
}
```

**Inbound — Delivery Ack**
```json
{
  "type": "ack",
  "id": "client-generated-uuid",
  "persisted": true
}
```

**Outbound — Typing Indicator**
```json
{
  "type": "typing",
  "state": "start"
}
```

**Inbound — Pre-signed URL Response (HTTP REST)**
```json
{
  "upload_url": "https://r2.example.com/...",
  "media_url": "https://cdn.example.com/media/abc123.jpg",
  "expires_in": 300
}
```

### 5.2 REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/messages?before=<timestamp>&limit=50` | Fetch paginated message history |
| `POST` | `/api/media/upload-url` | Request a pre-signed R2 upload URL |
| `DELETE` | `/api/messages/:id` | Soft-delete a message |

### 5.3 Database Schema (Postgres via Supabase)

**`messages`**
```sql
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   TEXT NOT NULL,
  content     TEXT,
  media_url   TEXT,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_created_at ON messages (created_at DESC);
```

**`media`**
```sql
CREATE TABLE media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID REFERENCES messages(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  cdn_url     TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.4 Go Hub — Conceptual Model

```go
type Hub struct {
    clients   map[*Client]bool
    broadcast chan []byte
    register  chan *Client
    leave     chan *Client
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.clients[client] = true
        case client := <-h.leave:
            delete(h.clients, client)
            close(client.send)
        case message := <-h.broadcast:
            // Relay first, persist async
            for client := range h.clients {
                client.send <- message
            }
            go persistMessage(message) // non-blocking
        }
    }
}
```

---

---

## 6. Deployment Architecture

### 6.1 Recommended Stack: Vercel + Fly.io + Cloudflare R2

This combination was chosen to optimize for zero cold starts on the real-time path, near-zero egress cost on media, and a predictable, low monthly bill for a two-user app.

```
┌──────────────────────────────────────────────────────────┐
│                    Users (PWA)                           │
└──────────┬──────────────────────────┬────────────────────┘
           │ HTTPS / page loads       │ Media (images/video)
           ▼                          ▼
┌──────────────────────┐   ┌────────────────────────────────┐
│   Vercel (Hobby)     │   │     Cloudflare R2              │
│   Next.js frontend   │   │     Direct-upload from client  │
│   Edge CDN + CI/CD   │   │     Zero egress fees           │
└──────────────────────┘   └────────────────────────────────┘
           │ WebSocket / REST
           ▼
┌──────────────────────────────────────────────────────────┐
│              Fly.io — Go Real-Time Engine                │
│   shared-cpu-1x · 512 MB · always-on · single region    │
│   Gorilla WebSocket Hub + Fiber HTTP + R2 pre-sign logic │
└───────────────────────────┬──────────────────────────────┘
                            │ TCP (Postgres wire protocol)
                            ▼
                  ┌──────────────────────┐
                  │   Supabase (Free)    │
                  │   Postgres + Auth    │
                  └──────────────────────┘
```

### 6.2 Service-by-Service Rationale

#### Frontend — Vercel (Hobby → Pro)

**Why Vercel:** Native Next.js support, zero-config CI/CD on every push, edge CDN with global PoPs, and automatic preview deployments. For a two-user app, traffic is trivially low and will never approach any plan ceiling.

**Plan recommendation:** Start on **Hobby (free)**. For a private app with two users, the 100 GB/month bandwidth limit and 1M function invocations are orders of magnitude more than needed. One caveat: Vercel's Hobby plan is restricted to non-commercial personal use; if this app is for personal use between two people, Hobby is fine. If it ever becomes commercial in any sense, upgrade to **Pro ($20/month)** which includes 1 TB bandwidth and removes the restriction.

**Key note:** Vercel is not used for the WebSocket path at all. Vercel Functions are stateless and don't support persistent WebSocket connections. All real-time traffic goes directly to the Go service on Fly.io.

| Limit | Hobby | Needed (estimate) |
|-------|-------|-------------------|
| Bandwidth | 100 GB/mo | < 1 GB/mo |
| Edge Requests | 1M/mo | < 10K/mo |
| Serverless Invocations | 100K/mo | Minimal (static PWA) |
| **Monthly cost** | **$0** | — |

#### Real-Time Engine — Fly.io (Go binary)

**Why Fly.io:** The Go service must be **always warm** — no cold starts, ever, because the WebSocket hub holds the two connections open indefinitely. Fly.io runs persistent VMs (not serverless), is the cheapest platform for this, and supports deploying a Go binary with a single `fly deploy`. The platform's Anycast network also means traffic is routed to the nearest Fly edge before hitting the VM, shaving latency.

**Machine spec:** `shared-cpu-1x` with **512 MB RAM** is sufficient. The Hub manages exactly two WebSocket goroutines and does no heavy compute. A shared CPU is acceptable because Go's WebSocket relay is extremely low-CPU — it's almost entirely I/O wait.

**Region:** Deploy to the single Fly region closest to both users (e.g., `iad` for US East, `lax` for US West, `nrt` for Japan). A single region is correct; multi-region would require distributed state management and isn't worth it for two users.

| Resource | Spec | Monthly Cost (approx.) |
|----------|------|------------------------|
| shared-cpu-1x VM, 512 MB | Always-on | ~$3.00 |
| Dedicated IPv4 | 1 address | ~$2.00 |
| Persistent volume (for logs) | 1 GB | ~$0.15 |
| Outbound bandwidth | < 1 GB/mo | ~$0.02 |
| **Total** | | **~$5–6/month** |

> **Tip:** Fly.io now charges for dedicated IPv4 addresses separately. You can use a shared IPv4 (free) if you don't need a static IP, reducing cost by $2/month.

#### Media Storage — Cloudflare R2

**Why R2:** Zero egress fees — always, at any volume. Since images are uploaded directly from the client to R2 (bypassing the Go server), and delivered directly from R2's CDN to clients, the Go server only ever generates pre-signed URLs. Storage cost is $0.015/GB/month with a permanent free tier of **10 GB storage + 1M Class A ops + 10M Class B ops** per month.

For a two-person personal messenger, 10 GB of free storage is likely to last years before hitting limits.

| Resource | Free Tier | Paid Rate |
|----------|-----------|-----------|
| Storage | 10 GB/month | $0.015/GB/month |
| Write ops (Class A) | 1M/month | $4.50/million |
| Read ops (Class B) | 10M/month | $0.36/million |
| Egress | **Free always** | $0 |
| **Monthly cost (estimate)** | **$0** | — |

#### Database — Supabase (Free)

**Why Supabase:** The Go engine connects directly to Postgres using the standard wire protocol. Supabase's free tier includes 500 MB of database storage and is more than sufficient for a private two-person chat log. Supabase also provides Auth out of the box, which can handle the token-based authentication for both users without building it from scratch.

**Important:** Do not use Supabase Realtime. The Go WebSocket hub replaces it entirely. Supabase is used exclusively for persistence and auth.

| Resource | Free Tier |
|----------|-----------|
| Database storage | 500 MB |
| Auth (users, tokens) | Included |
| Supabase Realtime | Not used |
| **Monthly cost** | **$0** |

### 6.3 Total Monthly Cost Estimate

| Service | Cost |
|---------|------|
| Vercel (Next.js frontend) | $0 |
| Fly.io (Go real-time engine) | ~$5–6 |
| Cloudflare R2 (media storage) | $0 |
| Supabase (Postgres + Auth) | $0 |
| **Total** | **~$5–6/month** |

This is the floor for a persistent, always-warm, zero-cold-start real-time app. Upgrading Vercel to Pro ($20/month) would be the only meaningful cost increase, and only if the app ever needs to be commercial.

### 6.4 CI/CD & Deployment Flow

```
Developer pushes to main
        │
        ├──► Vercel detects push → builds Next.js → deploys to edge CDN
        │    (automatic, zero config, preview URL on every PR)
        │
        └──► GitHub Actions → runs `fly deploy` → builds Go binary
             → zero-downtime rolling deploy on Fly.io VM
```

**Go deployment on Fly.io** uses a `Dockerfile` at the repo root. Fly.io pulls from GitHub on every push (or via a GitHub Action) and performs a rolling restart with health checks before cutting over. Downtime: 0.

**Recommended repo structure:**
```
/
├── app/          ← Next.js frontend
├── server/       ← Go backend
│   ├── main.go
│   ├── hub.go
│   └── Dockerfile
├── fly.toml      ← Fly.io config
└── .github/
    └── workflows/
        └── deploy-go.yml
```

### 6.5 Scaling Path (If Needed)

This deployment is intentionally minimal. If requirements ever change:

| Trigger | Action |
|---------|--------|
| Media storage exceeds 10 GB | R2 paid tier kicks in at $0.015/GB — still negligible |
| App becomes commercial | Upgrade Vercel to Pro ($20/month) |
| Need more Go compute | Upgrade Fly.io VM to `shared-cpu-2x` or `performance-1x` |
| Need DB > 500 MB | Upgrade Supabase to Pro ($25/month) or self-host Postgres on Fly |

---

*End of PRD v0.2*
