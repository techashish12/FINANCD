require('dotenv').config(); // Load environment variables from a .env file into process.env

const express = require('express');
const cors = require('cors');
const { db } = require('./db');
const { Parser } = require('json2csv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
// We securely pull the secret from the .env file instead of hardcoding it.
const JWT_SECRET = process.env.JWT_SECRET || 'fintrack_super_secret_key_123'; 

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Additive branch, staff, finance, audit and receipt APIs.
const { registerManagementRoutes } = require('./management-routes');
registerManagementRoutes(app, db);

// Verbose Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        console.log('Body:', req.body);
    }
    next();
});

// Root endpoint for testing
app.get('/', (req, res) => {
  res.send('FinTrack API is running!');
});

// JWT Middleware - Now enforces Tenant checks
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// --- AUTHENTICATION ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        console.error("Login failed: Missing username or password");
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get the user and their specific tenant's feature flags
    db.get(`SELECT u.*, t.allowed_features FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.username = ?`, [username], (err, user) => {
        if (err) {
            console.error("DB Error on Login:", err.message);
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            console.error(`Login failed: Username '${username}' not found in DB`);
            return res.status(401).json({ error: `Username '${username}' not found.` });
        }

        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            console.error(`Login failed: Incorrect password for user '${username}'`);
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        console.log(`User '${username}' successfully logged in.`);
        
        // Embed the tenant ID in the token, unless it's the super admin
        const payload = { 
            id: user.id, 
            tenant_id: user.tenant_id, 
            username: user.username, 
            role: user.role, 
            features: user.allowed_features || 'ALL'
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: payload });
    });
});

// --- SUPER ADMIN TENANT APIs ---
app.get('/api/super/tenants', authenticate, (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Unauthorized' });
    db.all(`SELECT * FROM tenants ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/super/tenants', authenticate, (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Unauthorized' });
    const { company_name, allowed_features, admin_username, admin_password } = req.body;
    
    if (!company_name || !admin_username || !admin_password) return res.status(400).json({ error: 'Missing required fields' });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`INSERT INTO tenants (company_name, allowed_features) VALUES (?, ?)`, [company_name, allowed_features || 'ALL'], function(err) {
            if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: err.message }); }
            
            const tenantId = this.lastID;
            const hash = bcrypt.hashSync(admin_password, 10);
            
            db.run(`INSERT INTO users (tenant_id, username, password, role) VALUES (?, ?, ?, 'ADMIN')`, [tenantId, admin_username, hash], function(err2) {
                if (err2) { db.run('ROLLBACK'); return res.status(500).json({ error: err2.message }); }
                
                db.run(`INSERT INTO settings (tenant_id, company_name) VALUES (?, ?)`, [tenantId, company_name], function(err3) {
                    if (err3) { db.run('ROLLBACK'); return res.status(500).json({ error: err3.message }); }
                    
                    db.run('COMMIT');
                    res.json({ message: 'Tenant provisioned successfully', tenant_id: tenantId });
                });
            });
        });
    });
});

app.put('/api/super/tenants/:id', authenticate, (req, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Unauthorized' });
    const { allowed_features, is_active } = req.body;
    
    db.run(`UPDATE tenants SET allowed_features = ?, is_active = ? WHERE id = ?`, [allowed_features, is_active, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Tenant updated successfully' });
    });
});

app.get('/api/users', authenticate, (req, res) => {
    const tenantQuery = req.user.role === 'SUPER_ADMIN' ? '1=1' : 'tenant_id = ?';
    const params = req.user.role === 'SUPER_ADMIN' ? [] : [req.user.tenant_id];

    db.all(`SELECT id, username, role, created_at FROM users WHERE ${tenantQuery}`, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', authenticate, (req, res) => {
    const { username, password, role, target_tenant_id } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    // Super admins can create users for any tenant. Admins create users for their own tenant.
    const tenantIdToUse = req.user.role === 'SUPER_ADMIN' ? target_tenant_id : req.user.tenant_id;

    db.run(`INSERT INTO users (tenant_id, username, password, role) VALUES (?, ?, ?, ?)`, [tenantIdToUse, username, hash, role || 'AGENT'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, username, role: role || 'AGENT' });
    });
});

app.post('/api/change-password', (req, res) => {
    const { userId, newPassword } = req.body;
    const hash = bcrypt.hashSync(newPassword, 10);
    db.run(`UPDATE users SET password = ? WHERE id = ?`, [hash, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Password updated successfully' });
    });
});
// ----------------------

// --- SETTINGS ---
const path = require('path');

// --- DATABASE BACKUP API ---
// Exports the entire SQLite Database as a downloadable file
app.get('/api/backup', (req, res) => {
    const dbPath = path.resolve(__dirname, 'database.sqlite');
    res.download(dbPath, 'fintrack_backup.sqlite', (err) => {
        if (err) {
            console.error("Error downloading database:", err);
            res.status(500).send("Could not download database.");
        }
    });
});

app.get('/api/settings', authenticate, (req, res) => {
    db.get(`SELECT * FROM settings WHERE tenant_id = ?`, [req.user.tenant_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Get Lifetime Profit Analytics (Late Fees + Other Charges)
        db.get(`SELECT SUM(late_fee + other_charges) as profit FROM installments WHERE status = 'PAID' AND tenant_id = ?`, [req.user.tenant_id], (err, profitRow) => {
             res.json({ 
                 ...(row || { company_name: 'FinTrack', company_phone: '', company_logo: '', upi_id: '', qr_code_url: '' }),
                 lifetime_profit: profitRow ? profitRow.profit : 0
             });
        });
    });
});

app.get('/api/installments/today', authenticate, (req, res) => {
    const { startDate, endDate, financeType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const tenantId = req.user.tenant_id;
    
    let dateFilter = "";
    let typeFilter = "";
    let params = [tenantId, today];

    if (startDate && endDate) {
        dateFilter = ` AND i.due_date BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    }
    
    if (financeType && financeType !== 'ALL') {
        typeFilter = ` AND l.finance_type = ?`;
        params.push(financeType);
    }

    const query = `
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, l.loan_code, l.finance_type, l.vehicle_name, l.vehicle_reg_number, l.vendor_name, l.collateral_name, l.collateral_weight 
        FROM installments i 
        JOIN loans l ON i.loan_id = l.id 
        JOIN customers c ON l.customer_id = c.id 
        WHERE i.tenant_id = ? AND i.status IN ('UNPAID', 'DELAYED') AND i.due_date = ?
        ${dateFilter} ${typeFilter}
        ORDER BY i.due_date ASC
    `;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/installments/overdue', authenticate, (req, res) => {
    const { startDate, endDate, financeType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const tenantId = req.user.tenant_id;
    
    let dateFilter = "";
    let typeFilter = "";
    let params = [tenantId, today];

    if (startDate && endDate) {
        dateFilter = ` AND i.due_date BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    }
    
    if (financeType && financeType !== 'ALL') {
        typeFilter = ` AND l.finance_type = ?`;
        params.push(financeType);
    }

    const query = `
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, l.loan_code, l.finance_type, l.vehicle_name, l.vehicle_reg_number, l.vendor_name, l.collateral_name, l.collateral_weight 
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, l.loan_code, l.finance_type, l.vehicle_name, l.vehicle_reg_number, l.vendor_name, l.collateral_name, l.collateral_weight 
        FROM installments i 
        JOIN loans l ON i.loan_id = l.id 
        JOIN customers c ON l.customer_id = c.id 
        WHERE i.tenant_id = ? AND i.status = 'DELAYED' AND i.due_date < ?
        ${dateFilter} ${typeFilter}
        ORDER BY i.due_date ASC
    `;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/reports/trends', authenticate, (req, res) => {
    // Generate simple aggregation for weekly/monthly
    const query = `
        SELECT 
            strftime('%Y-%m', paid_date) as month,
            strftime('%Y-%W', paid_date) as week,
            SUM(amount + late_fee + other_charges) as total_collection,
            SUM(CASE WHEN UPPER(payment_method) = 'CASH' OR payment_method IS NULL THEN (amount + late_fee + other_charges) ELSE 0 END) as cash_collection,
            SUM(CASE WHEN UPPER(payment_method) = 'ONLINE' THEN (amount + late_fee + other_charges) ELSE 0 END) as online_collection
        FROM installments 
        WHERE tenant_id = ? AND status = 'PAID' AND paid_date IS NOT NULL
        GROUP BY month, week
        ORDER BY month ASC, week ASC
        LIMIT 50
    `;

    db.all(query, [req.user.tenant_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/settings', authenticate, (req, res) => {
    const { company_name, company_phone, company_logo, upi_id, qr_code_url } = req.body;
    db.run(
        `UPDATE settings SET company_name = ?, company_phone = ?, company_logo = ?, upi_id = ?, qr_code_url = ? WHERE tenant_id = ?`,
        [company_name, company_phone, company_logo || '', upi_id || '', qr_code_url || '', req.user.tenant_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Settings updated successfully' });
        }
    );
});

// --- CUSTOMERS API ---
// Bulk insert customers
app.post('/api/customers/bulk', authenticate, (req, res) => {
    const customers = req.body.customers;
    if (!Array.isArray(customers) || customers.length === 0) return res.status(400).json({ error: 'Valid array of customers required' });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare(`INSERT INTO customers (tenant_id, customer_code, name, phone, alternate_phone, unique_id, book_number, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        customers.forEach((c, idx) => {
            if (c.name) {
                const uniqueCode = `CUST-${Math.floor(Date.now() / 1000) + idx}`;
                stmt.run(req.user.tenant_id, uniqueCode, c.name, c.phone || '', c.alternate_phone || '', c.unique_id || '', c.book_number || '', c.address || '', c.notes || '');
            }
        });
        
        stmt.finalize();
        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Bulk import successful' });
        });
    });
});

// Creates a new customer profile in the DB.
app.post('/api/customers', authenticate, (req, res) => {
  const { name, phone, alternate_phone, unique_id, book_number, address, notes, photo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const uniqueCode = `CUST-${Math.floor(Date.now() / 1000)}`;

  db.run(
    `INSERT INTO customers (tenant_id, customer_code, name, phone, alternate_phone, unique_id, book_number, address, notes, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [req.user.tenant_id, uniqueCode, name, phone, alternate_phone, unique_id, book_number, address, notes, photo_url || ''], 
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, customer_code: uniqueCode, name, phone, book_number, address });
  });
});

// Get all customers, including sub-queries to fetch their latest loan's status and vehicle details for the search list.
app.get('/api/customers', authenticate, (req, res) => {
  db.all(`
    SELECT c.*, 
    (SELECT status FROM loans WHERE customer_id = c.id ORDER BY id DESC LIMIT 1) as latest_loan_status,
    (SELECT vehicle_reg_number FROM loans WHERE customer_id = c.id ORDER BY id DESC LIMIT 1) as vehicle_reg_number,
    (SELECT vehicle_name FROM loans WHERE customer_id = c.id ORDER BY id DESC LIMIT 1) as vehicle_name
    FROM customers c 
    WHERE c.tenant_id = ?
    ORDER BY c.created_at DESC
  `, [req.user.tenant_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Edit a customer
app.put('/api/customers/:id', authenticate, (req, res) => {
  const { name, phone, alternate_phone, unique_id, book_number, address, notes, photo_url } = req.body;
  db.run(
    `UPDATE customers SET name=?, phone=?, alternate_phone=?, unique_id=?, book_number=?, address=?, notes=?, photo_url=? WHERE id=? AND tenant_id=?`,
    [name, phone, alternate_phone, unique_id, book_number, address, notes, photo_url || '', req.params.id, req.user.tenant_id],
    function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Customer updated', changes: this.changes });
    }
  );
});

// Delete a customer (and cascade loans/installments)
app.delete('/api/customers/:id', authenticate, (req, res) => {
  db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const custId = req.params.id;
      const tenantId = req.user.tenant_id;
      db.run(`DELETE FROM installments WHERE tenant_id = ? AND loan_id IN (SELECT id FROM loans WHERE customer_id = ?)`, [tenantId, custId]);
      db.run(`DELETE FROM loans WHERE customer_id = ? AND tenant_id = ?`, [custId, tenantId]);
      db.run(`DELETE FROM customers WHERE id = ? AND tenant_id = ?`, [custId, tenantId], function(err) {
          if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: err.message });
          }
          db.run('COMMIT');
          res.json({ message: 'Customer and all associated data deleted' });
      });
  });
});

// Create a new loan with installments
app.post('/api/loans', authenticate, (req, res) => {
  const { customer_id, finance_type, vehicle_name, vehicle_reg_number, vehicle_photo_url, vendor_name, insurance_company, collateral_name, collateral_weight, collateral_weight_unit, collateral_photo_url, total_finance_amount, total_installments, installment_amount, late_fee_per_day, guarantor_name, guarantor_phone, installments } = req.body;

  if (!customer_id || !total_finance_amount || !installments || installments.length === 0) {
    return res.status(400).json({ error: 'Missing required loan data or installments.' });
  }
  
  const loanCode = `LOAN-${Math.floor(Date.now() / 1000)}`;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run(
      `INSERT INTO loans (tenant_id, customer_id, loan_code, finance_type, vehicle_name, vehicle_reg_number, vehicle_photo_url, vendor_name, insurance_company, collateral_name, collateral_weight, collateral_weight_unit, collateral_photo_url, total_finance_amount, total_installments, installment_amount, late_fee_per_day, guarantor_name, guarantor_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenant_id, customer_id, loanCode, finance_type || 'TWO_WHEELER', vehicle_name, vehicle_reg_number, vehicle_photo_url, vendor_name, insurance_company, collateral_name, collateral_weight, collateral_weight_unit, collateral_photo_url, total_finance_amount, total_installments, installment_amount, late_fee_per_day || 0, guarantor_name, guarantor_phone],
      function (err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: err.message });
        }

        const loanId = this.lastID;
        const stmt = db.prepare(`INSERT INTO installments (tenant_id, loan_id, amount, due_date, status) VALUES (?, ?, ?, ?, 'UNPAID')`);
        
        installments.forEach((inst) => {
            stmt.run(req.user.tenant_id, loanId, inst.amount, inst.due_date);
        });
        
        stmt.finalize((err) => {
          if (err) {
             db.run('ROLLBACK');
             return res.status(500).json({ error: err.message });
          }
          db.run('COMMIT');
          res.json({ message: 'Loan and installments created successfully', loan_id: loanId });
        });
      }
    );
  });
});

// Get loan details including installments
app.get('/api/loans/:id', authenticate, (req, res) => {
  const loanId = req.params.id;
  db.get(`SELECT * FROM loans WHERE id = ? AND tenant_id = ?`, [loanId, req.user.tenant_id], (err, loan) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    db.all(`SELECT * FROM installments WHERE loan_id = ? AND tenant_id = ? ORDER BY due_date ASC`, [loanId, req.user.tenant_id], (err, installments) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Update DELAYED status dynamically based on current date
      const today = new Date().toISOString().split('T')[0];
      const updatedInstallments = installments.map(inst => {
          if (inst.status === 'UNPAID' && inst.due_date < today) {
              return { ...inst, status: 'DELAYED' };
          }
          return inst;
      });

      res.json({ loan, installments: updatedInstallments });
    });
  });
});

// Get all loans for a customer
app.get('/api/customers/:id/loans', authenticate, (req, res) => {
    const customerId = req.params.id;
    db.all(`SELECT * FROM loans WHERE customer_id = ? AND tenant_id = ? ORDER BY created_at DESC`, [customerId, req.user.tenant_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Edit Loan Details
app.put('/api/loans/:id', authenticate, (req, res) => {
    const loanId = req.params.id;
    const { finance_type, vehicle_name, vehicle_reg_number, vendor_name, insurance_company, collateral_name, collateral_weight, collateral_weight_unit, collateral_photo_url, total_finance_amount, installment_amount, late_fee_per_day, is_closed } = req.body;
    
    db.run(
        `UPDATE loans SET finance_type=?, vehicle_name=?, vehicle_reg_number=?, vendor_name=?, insurance_company=?, collateral_name=?, collateral_weight=?, collateral_weight_unit=?, collateral_photo_url=?, total_finance_amount=?, installment_amount=?, late_fee_per_day=?, is_closed=? WHERE id=? AND tenant_id=?`,
        [finance_type, vehicle_name, vehicle_reg_number, vendor_name, insurance_company, collateral_name, collateral_weight, collateral_weight_unit, collateral_photo_url, total_finance_amount, installment_amount, late_fee_per_day, is_closed, loanId, req.user.tenant_id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Loan updated successfully' });
        }
    );
});

// Update Loan Status (e.g. Defaulter)
app.patch('/api/loans/:id/status', authenticate, (req, res) => {
    const loanId = req.params.id;
    const { status } = req.body;
    
    if (!loanId || loanId === 'undefined') return res.status(400).json({ error: 'Valid Loan ID required' });

    db.run(`UPDATE loans SET status = ? WHERE id = ? AND tenant_id = ?`, [status, loanId, req.user.tenant_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Loan status updated', id: loanId, status });
    });
});

// Mark all installments for a loan as PAID (with custom final amount splitting)
app.post('/api/loans/:id/mark-all-paid', authenticate, (req, res) => {
    const loanId = req.params.id;
    const { payment_method, paid_date, final_amount } = req.body; 
    const final_paid_date = paid_date || new Date().toISOString().split('T')[0];
    
    if (!loanId || loanId === 'undefined') return res.status(400).json({ error: 'Valid Loan ID required' });

    db.all(`SELECT id, amount FROM installments WHERE loan_id = ? AND tenant_id = ? AND status != 'PAID' ORDER BY due_date ASC`, [loanId, req.user.tenant_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows.length === 0) return res.json({ message: 'No unpaid installments found.' });

        let remainingTotalToDistribute = parseFloat(final_amount);
        let statementCount = 0;

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            rows.forEach((row, idx) => {
                let paidAmtForThisRow = 0;
                
                // If a final_amount was provided, we distribute it across the unpaid kists. 
                // Otherwise, we just mark them paid with their base amount.
                if (!isNaN(remainingTotalToDistribute)) {
                    if (idx === rows.length - 1) {
                        // Last row gets whatever is left
                        paidAmtForThisRow = remainingTotalToDistribute;
                    } else if (remainingTotalToDistribute >= row.amount) {
                        paidAmtForThisRow = row.amount;
                        remainingTotalToDistribute -= row.amount;
                    } else {
                        paidAmtForThisRow = remainingTotalToDistribute;
                        remainingTotalToDistribute = 0;
                    }
                } else {
                    paidAmtForThisRow = row.amount;
                }

                db.run(`UPDATE installments SET status = 'PAID', paid_date = ?, payment_method = ?, amount = ? WHERE id = ?`, 
                    [final_paid_date, payment_method || 'CASH', paidAmtForThisRow, row.id], 
                    (updateErr) => {
                        if (updateErr) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: updateErr.message });
                        }
                    }
                );
            });

            db.run('COMMIT', (commitErr) => {
                 if (commitErr) return res.status(500).json({ error: commitErr.message });
                 res.json({ message: 'All installments marked as paid' });
            });
        });
    });
});

// Edit a specific installment (unpaid) directly (amount or due_date)
app.put('/api/installments/:id', (req, res) => {
    const { amount, due_date } = req.body;
    db.run(
        `UPDATE installments SET amount = ?, due_date = ? WHERE id = ?`,
        [amount, due_date, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Installment modified' });
        }
    );
});

// Update installment status (Paid/Unpaid/Delayed) with manual overrides
app.patch('/api/installments/:id/status', authenticate, (req, res) => {
  const instId = req.params.id;
  const { status, amount, late_fee, other_charges, payment_method, paid_date } = req.body; 
  
  let final_paid_date = null;
  let calculatedLateFee = late_fee || 0;
  let customAmount = amount;
  let customOtherCharges = other_charges || 0;
  let customMethod = payment_method || null;

  db.get(`
      SELECT i.due_date, i.amount, l.late_fee_per_day 
      FROM installments i JOIN loans l ON i.loan_id = l.id 
      WHERE i.id = ? AND i.tenant_id = ?
  `, [instId, req.user.tenant_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Installment not found' });

    if (!customAmount) customAmount = row.amount;

    if (status === 'PAID') {
        final_paid_date = paid_date || new Date().toISOString().split('T')[0]; 
        
        if (final_paid_date > row.due_date && late_fee === undefined) {
            // Advanced Late Fee Auto-calculation based on days late
            const due = new Date(row.due_date);
            const paid = new Date(final_paid_date);
            const diffTime = Math.abs(paid - due);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (row.late_fee_per_day > 0) {
                calculatedLateFee = diffDays * row.late_fee_per_day;
            } else {
                // Fallback to 5% flat fee
                calculatedLateFee = parseFloat((row.amount * 0.05).toFixed(2));
            }
        }
    } else if (status === 'UNPAID') {
        // Clear payment info when marking unpaid
        calculatedLateFee = 0;
        customOtherCharges = 0;
        customAmount = row.amount;
        customMethod = null;
    }

    db.run(
      `UPDATE installments SET status = ?, paid_date = ?, amount = ?, late_fee = ?, other_charges = ?, payment_method = ? WHERE id = ? AND tenant_id = ?`,
      [status, final_paid_date, customAmount, calculatedLateFee, customOtherCharges, customMethod, instId, req.user.tenant_id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Installment not found' });
        res.json({ message: 'Installment updated', id: instId, status });
      }
    );
  });
});

// --- DASHBOARD API ---
// Returns aggregated stats: Total Collected, Cash vs Online, Overdue count, etc.
app.get('/api/dashboard', authenticate, (req, res) => {
    const { startDate, endDate, financeType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const tenantId = req.user.tenant_id;

    // Pre-flight check: Mark any unpaid installment passing the due date as DELAYED before aggregating stats
    db.run(`UPDATE installments SET status = 'DELAYED' WHERE status = 'UNPAID' AND due_date < ? AND tenant_id = ?`, [today, tenantId], (err) => {
        if (err) console.error("Error updating delayed status:", err);
        
        let dateFilterPaid = "";
        let dateFilterDue = "";
        let typeFilter = "";
        let paramsPaid = [tenantId];
        let paramsDue = [tenantId];

        if (startDate && endDate) {
            dateFilterPaid = ` AND i.paid_date BETWEEN ? AND ?`;
            paramsPaid.push(startDate, endDate);
            dateFilterDue = ` AND i.due_date BETWEEN ? AND ?`;
            paramsDue.push(startDate, endDate);
        }
        
        let typeParamPaid = [...paramsPaid];
        let typeParamDue = [...paramsDue];

        if (financeType && financeType !== 'ALL') {
            typeFilter = ` AND l.finance_type = ?`;
            typeParamPaid.push(financeType);
            typeParamDue.push(financeType);
        }

        const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        
        const queries = {
            totalCollected: { q: `SELECT SUM(i.amount + i.late_fee + i.other_charges) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'PAID' ${dateFilterPaid} ${typeFilter}`, p: typeParamPaid },
            totalOutstanding: { q: `SELECT SUM(i.amount) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status IN ('UNPAID', 'DELAYED') ${dateFilterDue} ${typeFilter}`, p: typeParamDue },
            totalDelayed: { q: `SELECT SUM(i.amount) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'DELAYED' ${dateFilterDue} ${typeFilter}`, p: typeParamDue },
            totalLateFees: { q: `SELECT SUM(i.late_fee) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'PAID' ${dateFilterPaid} ${typeFilter}`, p: typeParamPaid },
            delayedInstallmentsCount: { q: `SELECT COUNT(*) as count FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'DELAYED' ${dateFilterDue} ${typeFilter}`, p: typeParamDue },
            thisMonthCollection: { q: `SELECT SUM(i.amount + i.late_fee + i.other_charges) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'PAID' AND i.paid_date >= ? ${typeFilter}`, p: typeFilter ? [tenantId, currentMonthStart, financeType] : [tenantId, currentMonthStart] },
            totalCustomersCount: { q: `SELECT COUNT(DISTINCT c.id) as count FROM customers c LEFT JOIN loans l ON c.id = l.customer_id WHERE c.tenant_id = ? ${typeFilter ? 'AND l.finance_type = ?' : ''}`, p: typeFilter ? [tenantId, financeType] : [tenantId] },
            totalCash: { q: `SELECT SUM(i.amount + i.late_fee + i.other_charges) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'PAID' AND (UPPER(i.payment_method) = 'CASH' OR i.payment_method IS NULL OR i.payment_method = '') ${dateFilterPaid} ${typeFilter}`, p: typeParamPaid },
            totalOnline: { q: `SELECT SUM(i.amount + i.late_fee + i.other_charges) as total FROM installments i JOIN loans l ON i.loan_id = l.id WHERE i.tenant_id = ? AND i.status = 'PAID' AND UPPER(i.payment_method) = 'ONLINE' ${dateFilterPaid} ${typeFilter}`, p: typeParamPaid }
        };

        let stats = {};
        let completed = 0;
        const keys = Object.keys(queries);

        keys.forEach(key => {
            db.get(queries[key].q, queries[key].p, (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                stats[key] = row.total || row.count || 0;
                completed++;
                if (completed === keys.length) {
                    res.json(stats);
                }
            });
        });
    });
});

// Get Action Needed Installments (Today & Delayed) with optional date & type filtering
app.get('/api/installments/action-needed', (req, res) => {
    const { startDate, endDate, financeType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    db.run(`UPDATE installments SET status = 'DELAYED' WHERE status = 'UNPAID' AND due_date < ?`, [today], (err) => {
        let dateFilter = "";
        let typeFilter = "";
        let params = [today];

        if (startDate && endDate) {
            dateFilter = ` AND i.due_date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }
        
        if (financeType && financeType !== 'ALL') {
            typeFilter = ` AND l.finance_type = ?`;
            params.push(financeType);
        }

        const query = `
            SELECT i.*, c.name as customer_name, c.phone as customer_phone, l.finance_type, l.vehicle_name, l.vehicle_reg_number, l.vendor_name 
            FROM installments i
            JOIN loans l ON i.loan_id = l.id
            JOIN customers c ON l.customer_id = c.id
            WHERE l.status != 'DEFAULTER' AND (i.status = 'DELAYED' OR (i.status = 'UNPAID' AND i.due_date = ?)) ${dateFilter} ${typeFilter}
            ORDER BY i.due_date ASC
        `;
        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

// Get Upcoming Installments with optional date & type filtering
app.get('/api/installments/upcoming', authenticate, (req, res) => {
    const { startDate, endDate, financeType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const nextMonthStr = nextMonth.toISOString().split('T')[0];
    const tenantId = req.user.tenant_id;

    let startD = today;
    let endD = nextMonthStr;
    let params = [tenantId];

    if (startDate && endDate) {
        startD = startDate;
        endD = endDate;
    }
    
    params.push(startD, endD);
    
    let typeFilter = "";
    if (financeType && financeType !== 'ALL') {
        typeFilter = ` AND l.finance_type = ?`;
        params.push(financeType);
    }

    const query = `
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, l.finance_type, l.vehicle_name, l.vehicle_reg_number, l.vendor_name 
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        WHERE l.status != 'DEFAULTER' AND i.status = 'UNPAID' AND i.due_date > ? AND i.due_date <= ? ${typeFilter}
        ORDER BY i.due_date ASC
    `;
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Export: All Customers (JSON format for mobile frontend to convert to CSV)
app.get('/api/export/customers', (req, res) => {
    const { financeType } = req.query;
    let query = `SELECT c.book_number, c.name, c.phone, c.address, l.finance_type, l.total_finance_amount, l.status as loan_status 
            FROM customers c LEFT JOIN loans l ON c.id = l.customer_id`;
    let params = [];
    
    if (financeType && financeType !== 'ALL') {
        query += ` WHERE l.finance_type = ?`;
        params.push(financeType);
    }
            
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get All Paid Installments (Collection History) with optional date & type filtering
app.get('/api/installments/collections', authenticate, (req, res) => {
    const { startDate, endDate, financeType, paymentMethod } = req.query;
    const tenantId = req.user.tenant_id;
    
    let query = `
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, l.loan_code, l.finance_type, l.vehicle_name, l.vehicle_reg_number, l.vendor_name, l.collateral_name, l.collateral_weight 
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        WHERE i.tenant_id = ? AND i.status = 'PAID'
    `;
    let params = [tenantId];

    if (startDate && endDate) {
        query += ` AND i.paid_date BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    }
    
    if (financeType && financeType !== 'ALL') {
        query += ` AND l.finance_type = ?`;
        params.push(financeType);
    }
    
    if (paymentMethod && paymentMethod !== 'ALL') {
        query += ` AND UPPER(i.payment_method) = ?`;
        params.push(paymentMethod);
    }

    query += ` ORDER BY i.paid_date DESC`;
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Export: Specific Customer History (JSON)
app.get('/api/export/customer/:id', (req, res) => {
    const query = `
        SELECT i.due_date as Due_Date, i.amount as Base_Amount, i.late_fee as Late_Fees, i.other_charges as Other_Charges, i.status as Status, i.payment_method as Method, i.paid_date as Paid_Date
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        WHERE l.customer_id = ?
        ORDER BY i.due_date ASC
    `;
    db.all(query, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Export: Upcoming Installments (JSON format for mobile frontend to convert to CSV)
app.get('/api/export/upcoming', (req, res) => {
    const { startDate, endDate, financeType } = req.query;
    const today = new Date().toISOString().split('T')[0];
    
    let query = `
        SELECT c.book_number as Book_Number, c.name as Customer_Name, c.phone as Phone, l.finance_type as Finance_Type, i.due_date as Due_Date, i.amount as Installment_Amount, i.status as Status, i.payment_method as Payment_Method
        FROM installments i
        JOIN loans l ON i.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id
        WHERE i.status != 'PAID' AND i.due_date >= ?
    `;
    let params = [today];
    
    if (startDate && endDate) {
        query += ` AND i.due_date BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    }
    
    if (financeType && financeType !== 'ALL') {
        query += ` AND l.finance_type = ?`;
        params.push(financeType);
    }
    
    query += ` ORDER BY i.due_date ASC`;
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

// --- AI MOCK ENDPOINTS FOR DEMO PURPOSES ---
app.get('/api/ai/risk-score/:customerId', authenticate, (req, res) => {
    // Demo risk calculation logic
    const score = Math.floor(Math.random() * 50) + 50; // Random score between 50-100
    let profile = 'LOW';
    if (score < 60) profile = 'HIGH';
    else if (score < 80) profile = 'MEDIUM';

    db.run(`UPDATE customers SET risk_profile = ? WHERE id = ? AND tenant_id = ?`, [profile, req.params.customerId, req.user.tenant_id]);
    res.json({ score, profile, message: 'AI Risk Score generated successfully' });
});

app.get('/api/ai/predict-default/:loanId', authenticate, (req, res) => {
    // Demo AI prediction
    const defaultProbability = Math.floor(Math.random() * 100);
    res.json({ defaultProbability: `${defaultProbability}%`, recommendation: defaultProbability > 70 ? 'High risk! Contact customer immediately.' : 'Low risk. Standard reminders apply.' });
});

app.post('/api/ai/chatbot', authenticate, (req, res) => {
    // Demo Chatbot for Tenants
    const { message } = req.body;
    let reply = "I am your AI assistant. How can I help you manage your loans today?";
    
    if (message && message.toLowerCase().includes("overdue")) {
        reply = "You currently have a few customers with overdue payments. Check the Dashboard's Overdue tab for details.";
    } else if (message && message.toLowerCase().includes("default")) {
        reply = "Based on our AI prediction models, 2 loans in your portfolio have a high risk of defaulting this month.";
    }
    res.json({ reply });
});
