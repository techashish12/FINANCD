# FINANCD Management Modules

The management module is wired into the backend and exposed in the Expo navigation on the `feature/security-and-admin-upgrade` branch. It extends the existing Expo / React Native, Express and SQLite application.

## Included features

- Super Admin and Admin management overview with organization, customer, Kist/loan, collections, outstanding and overdue totals.
- Branch creation, listing and activation/deactivation.
- Staff creation, role assignment and branch-level permission records (collect, manage customers, view reports).
- Expense entry and cashflow-style net result reporting.
- Receipt records automatically created when an installment first changes to `PAID`.
- Audit trail for customer creation, Kist creation, payments and management actions.
- Super Admin-only SQLite database backup endpoint.
- Responsive management screen for mobile and web.

## API

All management routes are under `/api/manage` and require a valid Bearer token.

| Area | Routes |
|---|---|
| Overview | `GET /overview` |
| Branches | `GET /branches`, `POST /branches`, `PATCH /branches/:id` |
| Staff | `GET /staff`, `POST /staff`, `PATCH /staff/:id` |
| Staff branch permissions | `GET /staff/:id/permissions`, `PUT /staff/:id/permissions` |
| Expenses | `GET /expenses`, `POST /expenses` |
| Financial analytics | `GET /reports/financial?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` |
| Audit trail | `GET /audit` |
| Receipts | `POST /receipts` with `{ "installment_id": 123 }` |
| Database backup | `GET /backup` (Super Admin only) |

## Setup

1. In `backend/.env`, set `JWT_SECRET` to a unique random secret (at least 32 characters). Generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Do not use the placeholder in `.env.example`.
3. The management router and global API security guard are already wired into `backend/src/server.js`; no manual registration step is needed.
4. The new tables and branch columns are created additively at startup. Existing customer, loan and installment data is not dropped.

## Run locally

Backend:

```bash
cd backend
npm install
npm start
```

Expo frontend (second terminal):

```bash
cd frontend
npm install
npx expo start
```

For a physical phone, change the API host in `frontend/src/api/index.js` to your computer's LAN IP. Android emulator uses `10.0.2.2`; web/iOS simulator may use `127.0.0.1`.

## Important limitations before production

- Existing Kist/customer/payment screens have not yet been fully converted to require branch selection or filter every record by branch. Branch permissions are stored and management endpoints are protected, but full branch-level row isolation still needs to be applied to the legacy finance endpoints.
- Profit/loss is currently a cash-collections-minus-recorded-expenses indicator, not statutory accounting profit or audited financial statements.
- Backup endpoint supports local SQLite. Cloud deployments need managed database snapshots.
- Automatic receipt generation is stored in the database. The receipt endpoint returns receipt/customer data; printing and PDF/share UI still needs to be completed.
- No live database migration or mobile build was run in this environment. Back up your data and test on a development copy before using real customer records.
