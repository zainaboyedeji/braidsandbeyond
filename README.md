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

## Admin

Log in at `/admin` with the account from step 4. From there:

- **Services** (`/admin/services`): add/edit services and upload a photo (JPG/PNG/WebP, max 5 MB). Photos are stored in `backend/uploads/` and served at `/uploads/...`.
- **Hours** (`/admin/hours`): set opening hours per weekday or mark a day closed. Booking and availability use these immediately.

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
| GET / PUT | `/api/admin/business-hours` `{ hours: [{ weekday, isOpen, openTime, closeTime }] }` | admin |
| POST / DELETE | `/api/services/:id/image` (multipart field `image`) | admin |

## Production (Render + Neon + Cloudinary + Brevo)

One Render web service builds the React app and serves it from Express alongside the API (`render.yaml`).

| Piece | Where | Env var |
| --- | --- | --- |
| Database | Neon (free Postgres) | `DATABASE_URL`, `DATABASE_SSL=true` |
| Service photos | Cloudinary | `CLOUDINARY_URL` (without it, photos go to `backend/uploads/`, dev only) |
| Email | Brevo SMTP on port 2525 | `SMTP_*`, `EMAIL_FROM`, `ADMIN_EMAIL` |
| WhatsApp (optional) | Meta WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` |

### WhatsApp booking confirmations

When an admin sets a booking to **confirmed**, the client gets their booking details on WhatsApp
(name, service + pickup, date & time, booking #, manage link). The dashboard shows whether it was sent and, if not, why.

1. In [Meta for Developers](https://developers.facebook.com/apps) create a **Business** app and add the **WhatsApp** product.
2. Under WhatsApp → API Setup, add and verify the salon's business number. Copy its **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
3. In Business Settings → System users, create a system user, give it the app with `whatsapp_business_messaging`
   and `whatsapp_business_management`, and generate a token that never expires → `WHATSAPP_TOKEN`.
   (The 24-hour token on the API Setup page works for testing only.)
4. In WhatsApp Manager → Message templates, create a **Utility** template named `braidsandbeyonds_bookingconfirmed`, language
   English (`en`; if you pick English (US), set `WHATSAPP_TEMPLATE_LANGUAGE=en_US`), with a body like:

   ```
   Hi {{1}}, your booking at Braids & Beyond is confirmed!
   Service: {{2}}
   When: {{3}}
   Booking #{{4}}
   View or change your booking: {{5}}
   ```

5. Once Meta approves it, set the env vars and run `cd backend && npm run whatsapp:test -- <your number>`.

While the app is unpublished or using Meta's test number, WhatsApp only delivers to numbers you've added to
the recipient list on the API Setup page. A payment method on the WhatsApp Business account is needed for real clients.

Deploy: push to GitHub → Render → **New → Blueprint** → pick the repo → fill in the secret env vars.
The start command runs `npm run db:init` first; it's idempotent and never deletes data.

Run a one-off command against production from your machine (secrets kept in the git-ignored `backend/.env.production`):

```bash
cd backend
DOTENV_CONFIG_PATH=.env.production node -r dotenv/config scripts/createAdmin.js "Name" email@example.com "Password123"
```
