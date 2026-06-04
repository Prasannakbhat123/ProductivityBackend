# ProductivityBackend

LedgerFlow API — Express, MongoDB, and scheduled jobs for personal finance tracking.

## Requirements

- Node.js 20+
- MongoDB Atlas (or compatible MongoDB URI)

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — set MONGODB_URI and FRONTEND_ORIGIN to your deployed frontend URL
npm run build
npm start
```

Development:

```bash
npm run dev
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `4000`) |
| `MONGODB_URI` | MongoDB connection string (**required**) |
| `FRONTEND_ORIGIN` | CORS origin for your frontend (e.g. `https://your-app.vercel.app`) |
| `DNS_SERVERS` | Optional comma-separated DNS servers if Atlas SRV lookup fails locally |
| `SMTP_*` | Optional email reminders for calendar events |

## Deploy

1. Set all environment variables on your host (Render, Railway, Fly.io, etc.).
2. Build command: `npm run build`
3. Start command: `npm start`
4. Point your frontend `VITE_API_URL` at this API’s public URL.

## API

- Health: `GET /api/health`
- Finance, calendar, notes, and SSE realtime under `/api/*`
