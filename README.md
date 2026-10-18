# Salon Booking App

Monorepo: `backend/` (Node.js + Express + `pg` + Nodemailer) and `frontend/` (React + Vite).

## Setup

```bash
# 1. Install everything (root installs both workspaces)
npm install

# 2. Configure env
cp backend/.env.example backend/.env      # then fill in real values

# 3. Create the database and tables
createdb salon_booking
npm run db:init

# 4. Create the salon owner's admin account
npm run db:admin -- "Owner Name" owner@yoursalon.com "StrongPassword123"

# 5. Run API (http://localhost:5000) + web (http://localhost:5173)
npm run dev
```

## Double-booking protection

`backend/src/services/bookingService.js` → `createBooking()`:

1. `BEGIN`
2. `pg_advisory_xact_lock` serializes concurrent bookings (covers empty slots, where `FOR UPDATE` has no row to lock)
3. `SELECT ... FOR UPDATE` locks any overlapping active appointments → `409` if found
4. `INSERT` guarded by the `appointments_no_overlap` exclusion constraint (DB-level guarantee, error `23P01` → `409`)
5. `SELECT` with `JOIN users` + `JOIN services` for email data
6. `COMMIT` / `ROLLBACK`

After commit, admin + client emails go out in parallel via `Promise.all`. An email failure never undoes a booking; the API returns `emailsSent: false` instead.

## API

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/health` | – |
| GET | `/api/config` | – |
| POST | `/api/auth/register` · `/api/auth/login` | – |
| GET | `/api/auth/me` | user |
| GET | `/api/services` | – |
| GET | `/api/services/all` | admin |
| POST / PATCH / DELETE | `/api/services[/:id]` | admin |
| GET | `/api/appointments/availability?serviceId=&date=YYYY-MM-DD` | – |
| POST | `/api/appointments` `{ serviceId, startTime, notes? }` | user |
| GET | `/api/appointments/mine` | user |
| PATCH | `/api/appointments/:id/cancel` | owner / admin |
| GET | `/api/admin/appointments?date=&status=` | admin |
| PATCH | `/api/admin/appointments/:id/status` `{ status }` | admin |
| GET | `/api/admin/stats` | admin |

## Production

```bash
npm run build           # outputs frontend/dist
npm start               # runs the API
```

Serve `frontend/dist` from any static host. If the API lives on another domain, set `VITE_API_URL` at build time and `CLIENT_ORIGIN` in `backend/.env`.
