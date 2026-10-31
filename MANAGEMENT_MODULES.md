# FINANCD Management Modules

This release adds an additive management API to the existing Expo/Express/SQLite application.

## Included endpoints

All routes are under `/api/manage` and require a Bearer token.

| Area | Routes |
|---|---|
| Super Admin / Admin overview | `GET /overview` |
| Branches | `GET /branches`, `POST /branches`, `PATCH /branches/:id` |
| Staff | `GET /staff`, `POST /staff`, `PATCH /staff/:id` |
| Staff branch permissions | `GET /staff/:id/permissions`, `PUT /staff/:id/permissions` |
| Expenses | `GET /expenses`, `POST /expenses` |
| Financial analytics | `GET /reports/financial?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` |
| Audit trail | `GET /audit` |
| Payment receipts | `POST /receipts` with `{ "installment_id": 123 }` |
| Full SQLite backup | `GET /backup` (Super Admin only) |

## Activate the module

1. Set a unique `JWT_SECRET` of at least 32 characters in `backend/.env`.
2. In `backend/src/server.js`, after `app.use(express.json(...))` and before `app.listen(...)`, add:

```js
const { registerManagementRoutes } = require('./management-routes');
registerManagementRoutes(app, db);
```

3. Restart the backend. The new additive tables are created automatically. Existing finance/customer/payment tables are not dropped.

## Start locally

Backend:

```bash
cd backend
npm install
npm start
```

Expo app (second terminal):

```bash
cd frontend
npm install
npx expo start
```

For a physical phone, set the API host in `frontend/src/api/index.js` to your computer's LAN IP. Android emulator uses `10.0.2.2`; web/iOS simulator may use `127.0.0.1`.

## Notes and safeguards

- Admin can manage their tenant's staff, branches, expenses, and reports. Super Admin can view and manage across tenants.
- Staff permissions are branch-level flags for collections, customer management, and report visibility.
- Receipt endpoint creates an immutable receipt record for an already-paid installment. A UI can render/share/print its returned data.
- Profit/loss shown here is **cash collections minus recorded operating expenses**; it is not statutory accounting profit and excludes principal/revenue recognition rules.
- Backups are restricted to Super Admin and are intended for local SQLite deployments. Cloud deployments should use managed database snapshots.
- The existing app still contains older routes with inconsistent authentication/tenant filters. Do not expose the existing backend publicly until those legacy routes have been audited and protected.
- This module has not been executed against a live copy of your database in this environment. Test on a backup before production use.
