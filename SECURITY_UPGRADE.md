# FINANCD security and admin upgrade

This upgrade adds a centralized security guard for the existing Express API. The current app already has a basic `SUPER_ADMIN` / `ADMIN` role concept and tenant provisioning; the guard closes several high-risk gaps found during review.

## Findings from the current backend

- The JWT secret falls back to a hard-coded value.
- User creation accepts caller-supplied roles without a privilege check, allowing privilege escalation.
- Password change has no authentication or ownership check.
- Database backup is publicly downloadable.
- Several payment, installment, export, and dashboard routes omit authentication.
- Request bodies are logged, which can expose customer and financial information.
- Some tenant-facing routes rely on tenant IDs from token claims rather than reloading current account state.

## Apply the middleware

In `backend/src/server.js`, immediately after `const app = express();` and before the first route declaration, add:

```js
const { installSecurityGuards } = require('./security-guards');
installSecurityGuards(app, { db, bcrypt, jwt });
```

Do not put this below the route declarations: Express middleware order matters.

The guard:
- Requires a valid bearer token for all API routes except POST /api/login.
- Reloads the user and role from the database on each API request.
- Rejects users whose tenant is inactive.
- Restricts full database backups to Super Admin.
- Prevents Admin users from creating other Admins or Super Admins.
- Prevents self-service password changes for other users and verifies the current password.
- Requires Admin permission for high-impact configuration and destructive actions.

## Required environment variables

Create `backend/.env` (never commit it):

```env
PORT=3000
JWT_SECRET=replace_with_a_unique_random_secret_at_least_32_characters
```

Generate a secret with Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Restart all sessions after changing JWT_SECRET because existing tokens will no longer validate.

## Important deployment checklist

1. Add the middleware at the exact location shown above.
2. Remove request-body logging from `server.js`; never log passwords, identity documents, payment details, or tokens.
3. Use HTTPS in production and restrict CORS to the actual frontend origin.
4. Keep `.env`, SQLite database files, uploaded documents, and backups out of Git.
5. Create the first Super Admin through a one-time trusted database/bootstrap procedure; do not expose public Super Admin registration.
6. Back up the database before running migrations or production upgrades.
7. Test every role against every API route before deployment.

## Run the existing app

The repository has a backend and frontend. From a terminal:

```bash
cd "extracted-contents/finance_app - Copy/backend"
npm install
npm start
```

In a second terminal:

```bash
cd "extracted-contents/finance_app - Copy/frontend"
npm install
npm start
```

If `npm start` is not defined in a package's scripts, run `npm run` to see the available scripts and use the documented development script (often `npm run dev`). Configure the frontend API base URL to point to the backend host and port.

This patch is not a production certification. Review the app's database initialization, role bootstrap, tenant scoping, payment transaction handling, and frontend navigation before handling real customer financial data.
