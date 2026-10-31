# FINANCD Management Modules

This upgrade extends the existing Expo / React Native + Express + SQLite Kist finance application. It is committed on `feature/security-and-admin-upgrade` and proposed in PR #2.

## Finance-company onboarding (Super Admin)

The Super Admin can provision an independent finance-company account with:
- Company name, official email, phone, contact person and address
- Admin username and initial password (minimum 12 characters)
- A selected catalogue of enabled finance products:
  - Two, three and four wheeler
  - Commercial vehicle
  - Gold and silver loan
  - Personal, home, property and mortgage loan
  - Business, education and agriculture loan
  - Udhar, Girvi, insurance finance and other
- Enable / disable a finance-company tenant and update its selected product list

Each finance company has its own tenant ID and Admin account. The API checks the selected finance product before loan creation and filters dashboard/Kist/report data to the products licensed to that company.

## Operations and finance features

- Responsive Super Admin / Admin management dashboard
- Branch creation, listing and activation controls
- Staff account creation and branch permission flags for collection, customer management and reports
- Customer and finance/Kist creation using the existing screens
- Automatic Kist schedule generation by day, month or year, plus manual schedule row edits
- Today's, upcoming and overdue Kist lists on the existing main dashboard
- Automatic or manually entered late fees at collection time
- Mark loan account as defaulter, completed/closed, or reactivate it
- Payment collection and automatic immutable receipt record on first payment
- Printable / shareable PDF receipt from the management screen
- Financial analytics by month, year, customer and finance type, with collected, outstanding, overdue and late-fee totals
- Expense recording and cash-collections-minus-expenses indicator
- Audit records for customer creation, Kist creation, payments and management actions
- Super Admin-only SQLite backup endpoint
- WhatsApp and phone contact buttons on due-Kist dashboard cards

## API

All management routes use `/api/manage` and require a valid Bearer token.

| Area | Routes |
|---|---|
| Enabled products | `GET /features` |
| Overview | `GET /overview` |
| Branches | `GET /branches`, `POST /branches`, `PATCH /branches/:id` |
| Staff | `GET /staff`, `POST /staff`, `PATCH /staff/:id` |
| Staff branch permissions | `GET /staff/:id/permissions`, `PUT /staff/:id/permissions` |
| Kist list | `GET /kists?status=ALL&finance_type=ALL&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` |
| Loan account state | `PATCH /loans/:id/account` |
| Expenses | `GET /expenses`, `POST /expenses` |
| Cashflow summary | `GET /reports/financial?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` |
| Advanced report | `GET /reports/detail?group_by=month|year|customer|finance_type` |
| Audit trail | `GET /audit` |
| Receipt | `POST /receipts` with `{ "installment_id": 123 }` |
| Database backup | `GET /backup` (Super Admin only) |

The existing `/api/installments/today`, `/overdue`, `/upcoming`, `/collections`, `/api/dashboard`, and loan/customer APIs continue to power the finance dashboard.

## Setup

1. Create `backend/.env` and set a unique random `JWT_SECRET` of at least 32 characters. Generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Do not use the placeholder in `.env.example`.
3. The management router and global API security guard are wired into `backend/src/server.js`.
4. New management tables and tenant profile columns are added with non-destructive SQLite migrations. Existing data is not dropped.

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

For a physical phone, set the API host in `frontend/src/api/index.js` to your computer's LAN IP. Android emulator uses `10.0.2.2`; web/iOS simulator can use localhost.

## Remaining production work / limitations

- Branches and staff permissions can be created and assigned, but branch_id is not yet selected and enforced on every legacy customer, Kist, payment and export record. Do not treat branch-level separation as complete yet.
- Tenant-level separation is enforced on the reviewed legacy endpoints and the management APIs; do a full endpoint penetration test before storing real customer financial data.
- Financial net is a cashflow indicator, not audited statutory profit.
- Backup endpoint supports local SQLite. Cloud deployments need managed database snapshots.
- No live SQLite migration, Node test suite or Expo build has been run in this environment. Back up and test a development copy before production.
