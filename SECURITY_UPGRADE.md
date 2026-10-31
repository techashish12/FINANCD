# FINANCD security and admin upgrade

The upgrade branch wires a global API security guard into the existing Express backend and adds branch, staff, finance, receipt, backup and audit management routes.

## Security changes

- All `/api/*` endpoints except `POST /api/login` now require a valid Bearer token.
- Every request reloads the user's current role and tenant from SQLite, rather than trusting stale role claims in the JWT.
- Inactive organizations are denied access.
- JWT startup fails unless a unique secret of at least 32 characters is configured.
- Admin/Staff user creation checks roles and password length; non-Super Admins cannot create Admin or Super Admin users.
- Password changes require authentication, ownership and current-password verification.
- Full database backup is Super Admin only.
- Request-body logging was removed to avoid recording passwords, identity documents and payment details.
- Management routes are protected and audit customer creation, Kist creation, payments and administrative changes.

## Configure the backend

Create `backend/.env` (never commit it):

```env
PORT=3000
JWT_SECRET=your_unique_random_secret_at_least_32_characters
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Do not use the placeholder in `.env.example`. Changing JWT_SECRET invalidates all existing login sessions.

## Run the app

Backend:

```bash
cd backend
npm install
npm start
```

Frontend (second terminal):

```bash
cd frontend
npm install
npx expo start
```

For Android emulator, the frontend API base URL uses `10.0.2.2`. For a physical phone, replace the host in `frontend/src/api/index.js` with the computer's LAN IP address.

## Pre-production requirements

1. Back up the SQLite database before testing migrations.
2. Restrict CORS to the actual app origin and use HTTPS.
3. Keep `.env`, database files and backup files out of Git.
4. Provision Super Admin accounts only through a trusted one-time bootstrap process.
5. Complete branch-level filtering in all existing customer, Kist, collection and export queries before multi-branch production use.
6. Complete PDF receipt printing/sharing and verify automatic receipt records.
7. Test every role and API route on a non-production database.

This is a development upgrade, not a production certification. The current legacy finance endpoints still require a further branch-scoping review, and this environment has not run a live SQLite migration, backend test suite, or Expo build.
