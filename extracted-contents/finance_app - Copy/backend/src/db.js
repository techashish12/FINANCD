const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

function initDb(callback) {
  db.serialize(() => {
    // Optionally log out for debugging
    // db.run("DROP TABLE IF EXISTS users");
    // db.run("DROP TABLE IF EXISTS settings");
    // db.run("DROP TABLE IF EXISTS installments");
    // db.run("DROP TABLE IF EXISTS loans");
    // db.run("DROP TABLE IF EXISTS customers");

    // Tenants Table (SaaS Organizations)
    db.run(`CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      allowed_features TEXT DEFAULT 'ALL', -- JSON or comma separated e.g. "TWO_WHEELER,GIRVI,HOME_LOAN"
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'AGENT', -- 'SUPER_ADMIN', 'ADMIN', 'AGENT'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`);

    // Settings Table (Per Tenant)
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      company_name TEXT DEFAULT 'My Finance Co',
      company_phone TEXT DEFAULT '9876543210',
      company_logo TEXT,
      upi_id TEXT,
      qr_code_url TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`);

    // Customers Table (Per Tenant)
    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      customer_code TEXT, -- Auto generated unique code CUST-1001
      name TEXT NOT NULL,
      phone TEXT,
      alternate_phone TEXT,
      unique_id TEXT, -- E.g. Aadhar, PAN, or Custom ID
      book_number TEXT, -- Offline ID
      address TEXT,
      notes TEXT,
      photo_url TEXT, -- Customer Image URL
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`);

    // Loans/Finances Table (Per Tenant)
    db.run(`CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      customer_id INTEGER,
      loan_code TEXT, -- Unique reference number like LOAN-2026
      finance_type TEXT DEFAULT 'TWO_WHEELER', -- TWO_WHEELER, FOUR_WHEELER, UDHAR, GIRVI, HOME_LOAN, PERSONAL
      vehicle_name TEXT,
      vehicle_reg_number TEXT,
      vehicle_photo_url TEXT,
      vendor_name TEXT,
      insurance_company TEXT,
      collateral_name TEXT, -- E.g. Gold Ring, iPhone (for Girvi/Loans)
      collateral_weight REAL,
      collateral_weight_unit TEXT, -- GM, KG, CARAT
      collateral_photo_url TEXT,
      total_finance_amount REAL NOT NULL,
      total_installments INTEGER NOT NULL,
      installment_amount REAL NOT NULL,
      late_fee_per_day REAL DEFAULT 0,
      guarantor_name TEXT,
      guarantor_phone TEXT,
      is_closed INTEGER DEFAULT 0, -- Used specifically for closing girvi/loans completely
      status TEXT DEFAULT 'ACTIVE', -- ACTIVE, DEFAULTER, COMPLETED
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`);

    // Installments Table (Per Tenant)
    db.run(`CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      loan_id INTEGER,
      amount REAL NOT NULL,
      due_date DATE NOT NULL,
      status TEXT DEFAULT 'UNPAID', -- UNPAID, PAID, DELAYED
      paid_date DATE,
      late_fee REAL DEFAULT 0,
      other_charges REAL DEFAULT 0,
      payment_method TEXT, -- CASH, ONLINE
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(loan_id) REFERENCES loans(id)
    )`, function(err) {
        if (callback) callback(err);
    });
  });
}

// Automatically init if not called explicitly (for server start)
initDb();

module.exports = { db, initDb };
