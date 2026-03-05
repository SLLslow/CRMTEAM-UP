# CRMTeamLid Web (Windows-ready)

## Architecture
- `web/frontend` - static web app (deploy to Vercel)
- `web/backend` - Node.js proxy/API for KeepinCRM (deploy to Render)

## Why backend proxy
KeepinCRM token should not be sent directly from browser to KeepinCRM API.
Browser talks to your backend, backend talks to KeepinCRM.

## 1) Deploy backend (Render)
1. Create new Web Service in Render from this repository.
2. Set Root Directory: `web/backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add env vars:
   - `KEEPINCRM_BASE_URL=https://api.keepincrm.com/v1`
   - `CORS_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app`

After deploy you get backend URL, example:
`https://crmteamlid-backend.onrender.com`

## 2) Deploy frontend (Vercel)
1. Import repository in Vercel.
2. Set Root Directory: `web/frontend`
3. Framework preset: `Other`
4. Deploy.

## 3) Connect frontend to backend
Open `web/frontend/app.js` and set `API_BASE` production URL to your Render backend URL.
Commit + push.

## 4) Local run (optional)
Backend:
```bash
cd web/backend
npm install
npm start
```
Frontend:
- Open `web/frontend/index.html` directly
- or run simple static server (recommended)

## API endpoint
`POST /api/sync`

Body:
```json
{
  "token": "X-Auth-Token",
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-03",
  "managerIds": [13, 9, 37, 12]
}
```
