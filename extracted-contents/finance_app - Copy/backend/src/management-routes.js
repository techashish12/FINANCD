const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function registerManagementRoutes(app, db) {
  const router = express.Router();
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'fintrack_super_secret_key_123') {
    throw new Error('Set JWT_SECRET to a unique random value of at least 32 characters.');
  }

  // Additive tables: existing customer, loan and installment records remain intact.
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      address TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, code)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS user_branch_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      can_collect INTEGER DEFAULT 1,
      can_manage_customers INTEGER DEFAULT 0,
      can_view_reports INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, branch_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      branch_id INTEGER,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL CHECK(amount > 0),
      expense_date DATE NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      actor_id INTEGER,
      actor_username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS payment_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      installment_id INTEGER NOT NULL,
      receipt_number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      payment_method TEXT,
      paid_date DATE NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Optional business profile fields for finance-company onboarding.
    const addTenantColumn = (column, definition) => db.all('PRAGMA table_info(tenants)', [], (err, columns) => {
      if (err) return console.error('Tenant schema check failed:', err.message);
      if (!columns.some(col => col.name === column)) db.run(`ALTER TABLE tenants ADD COLUMN ${column} ${definition}`, e => e && console.error('Tenant schema update failed:', e.message));
    });
    addTenantColumn('email', 'TEXT');
    addTenantColumn('phone', 'TEXT');
    addTenantColumn('contact_person', 'TEXT');
    addTenantColumn('address', 'TEXT');
    addTenantColumn('plan_name', "TEXT DEFAULT 'STANDARD'");
    addTenantColumn('created_by', 'INTEGER');
    // Assignable branch links for existing customer/loan/collection records.
    const addColumnIfMissing = (table, column, definition) => {
      db.all(`PRAGMA table_info(${table})`, [], (err, columns) => {
        if (err) return console.error('Schema check failed:', err.message);
        if (!columns.some(col => col.name === column)) {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, alterErr => {
            if (alterErr) console.error('Schema update failed:', alterErr.message);
          });
        }
      });
    };
    addColumnIfMissing('customers', 'branch_id', 'INTEGER');
    addColumnIfMissing('loans', 'branch_id', 'INTEGER');
    addColumnIfMissing('installments', 'branch_id', 'INTEGER');
    // Automatically issue one immutable receipt whenever a payment first becomes PAID.
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_financd_auto_receipt
      AFTER UPDATE OF status ON installments
      WHEN NEW.status='PAID' AND OLD.status<>'PAID'
      BEGIN
        INSERT OR IGNORE INTO payment_receipts
          (tenant_id,installment_id,receipt_number,amount,payment_method,paid_date)
        VALUES
          (NEW.tenant_id,NEW.id,
           'RCPT-' || strftime('%Y%m%d','now') || '-' || printf('%06d',NEW.id),
           COALESCE(NEW.amount,0)+COALESCE(NEW.late_fee,0)+COALESCE(NEW.other_charges,0),
           COALESCE(NEW.payment_method,'CASH'),
           COALESCE(NEW.paid_date,date('now')));
      END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_financd_audit_customer_insert
      AFTER INSERT ON customers BEGIN
        INSERT INTO audit_logs(tenant_id,actor_username,action,entity_type,entity_id,details)
        VALUES(NEW.tenant_id,'SYSTEM_DB_TRIGGER','CUSTOMER_CREATED','customer',NEW.id,'{}');
      END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_financd_audit_loan_insert
      AFTER INSERT ON loans BEGIN
        INSERT INTO audit_logs(tenant_id,actor_username,action,entity_type,entity_id,details)
        VALUES(NEW.tenant_id,'SYSTEM_DB_TRIGGER','KIST_CREATED','loan',NEW.id,'{}');
      END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_financd_audit_installment_paid
      AFTER UPDATE OF status ON installments
      WHEN NEW.status='PAID' AND OLD.status<>'PAID' BEGIN
        INSERT INTO audit_logs(tenant_id,actor_username,action,entity_type,entity_id,details)
        VALUES(NEW.tenant_id,'SYSTEM_DB_TRIGGER','PAYMENT_COLLECTED','installment',NEW.id,
          '{"amount":' || (COALESCE(NEW.amount,0)+COALESCE(NEW.late_fee,0)+COALESCE(NEW.other_charges,0)) || '}');
      END`);
  });

  function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const claims = jwt.verify(token, secret);
      db.get(
        `SELECT u.id,u.username,u.role,u.tenant_id,COALESCE(t.is_active,1) tenant_active
         FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE u.id=?`,
        [claims.id],
        (err, user) => {
          if (err) return res.status(500).json({ error: 'Unable to verify account' });
          if (!user) return res.status(401).json({ error: 'Account not found' });
          if (user.tenant_id != null && Number(user.tenant_active) !== 1) return res.status(403).json({ error: 'Organization disabled' });
          req.user = user;
          next();
        }
      );
    } catch (_) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
  }

  const isSuper = req => req.user.role === 'SUPER_ADMIN';
  const isAdmin = req => ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
  function audit(req, action, type, id, details) {
    const u = req.user;
    db.run(
      'INSERT INTO audit_logs (tenant_id,actor_id,actor_username,action,entity_type,entity_id,details,ip_address) VALUES (?,?,?,?,?,?,?,?)',
      [u.tenant_id || null, u.id, u.username, action, type || null, id == null ? null : String(id), JSON.stringify(details || {}), req.ip]
    );
  }
  function tenantScope(req, res, next) {
    if (isSuper(req)) return next();
    if (req.user.tenant_id == null) return res.status(403).json({ error: 'Organization access required' });
    next();
  }

  router.use(authenticate, tenantScope);

  const SUPPORTED_FINANCE_TYPES = [
    'TWO_WHEELER','FOUR_WHEELER','THREE_WHEELER','COMMERCIAL_VEHICLE',
    'GOLD_LOAN','SILVER_LOAN','PERSONAL_LOAN','HOME_LOAN','MORTGAGE',
    'PROPERTY_LOAN','BUSINESS_LOAN','EDUCATION_LOAN','AGRICULTURE_LOAN',
    'UDHAR','GIRVI','INSURANCE','OTHER'
  ];

  router.get('/features', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    if(isSuper(req)) return res.json({allowed_features:SUPPORTED_FINANCE_TYPES,all:true});
    db.get('SELECT allowed_features FROM tenants WHERE id=?',[req.user.tenant_id],(err,row)=>{
      if(err) return res.status(500).json({error:err.message});
      const value=(row && row.allowed_features) || 'ALL';
      const allowed=value==='ALL' ? SUPPORTED_FINANCE_TYPES : value.split(',').filter(type=>SUPPORTED_FINANCE_TYPES.includes(type));
      res.json({allowed_features:allowed,all:value==='ALL'});
    });
  });

  router.get('/kists', (req,res) => {
    const tenantId=isSuper(req)?Number(req.query.tenant_id):req.user.tenant_id;
    if(!tenantId) return res.status(400).json({error:'Organization is required'});
    const {status='ALL',finance_type='ALL',start_date,end_date,customer_id}=req.query;
    const filters=['i.tenant_id=?']; const params=[tenantId];
    if(status!=='ALL'){filters.push('i.status=?');params.push(status);}
    if(finance_type!=='ALL'){filters.push('l.finance_type=?');params.push(finance_type);}
    if(start_date){filters.push('i.due_date>=?');params.push(start_date);}
    if(end_date){filters.push('i.due_date<=?');params.push(end_date);}
    if(customer_id){filters.push('l.customer_id=?');params.push(customer_id);}
    const sql=`SELECT i.*,l.loan_code,l.finance_type,l.status loan_status,c.id customer_id,c.name customer_name,c.phone customer_phone
      FROM installments i JOIN loans l ON l.id=i.loan_id JOIN customers c ON c.id=l.customer_id
      WHERE ${filters.join(' AND ')} ORDER BY i.due_date ASC LIMIT 2000`;
    db.all(sql,params,(err,rows)=>err?res.status(500).json({error:err.message}):res.json(rows));
  });

  router.get('/reports/detail', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const tenantId=isSuper(req)?Number(req.query.tenant_id):req.user.tenant_id;
    if(!tenantId) return res.status(400).json({error:'Organization is required'});
    const {start_date,end_date,finance_type='ALL',customer_id,group_by='month'}=req.query;
    const where=['i.tenant_id=?']; const params=[tenantId];
    if(start_date){where.push("COALESCE(i.paid_date,i.due_date)>=?");params.push(start_date);}
    if(end_date){where.push("COALESCE(i.paid_date,i.due_date)<=?");params.push(end_date);}
    if(finance_type!=='ALL'){where.push('l.finance_type=?');params.push(finance_type);}
    if(customer_id){where.push('c.id=?');params.push(customer_id);}
    const groupExpr={
      month:"strftime('%Y-%m',COALESCE(i.paid_date,i.due_date))",
      year:"strftime('%Y',COALESCE(i.paid_date,i.due_date))",
      customer:"c.id",
      finance_type:"l.finance_type"
    }[group_by] || "strftime('%Y-%m',COALESCE(i.paid_date,i.due_date))";
    const sql=`SELECT ${groupExpr} report_key,l.finance_type,c.id customer_id,c.name customer_name,
      COUNT(i.id) installment_count,
      SUM(CASE WHEN i.status='PAID' THEN i.amount+i.late_fee+i.other_charges ELSE 0 END) collected,
      SUM(CASE WHEN i.status IN ('UNPAID','DELAYED') THEN i.amount ELSE 0 END) outstanding,
      SUM(CASE WHEN i.status='DELAYED' THEN i.amount ELSE 0 END) overdue,
      SUM(COALESCE(i.late_fee,0)) late_fees
      FROM installments i JOIN loans l ON l.id=i.loan_id JOIN customers c ON c.id=l.customer_id
      WHERE ${where.join(' AND ')} GROUP BY report_key ${group_by==='customer'?',c.id,c.name':''} ${group_by==='finance_type'?',l.finance_type':''}
      ORDER BY report_key DESC LIMIT 1000`;
    db.all(sql,params,(err,rows)=>{
      if(err) return res.status(500).json({error:err.message});
      const totals=rows.reduce((a,r)=>({collected:a.collected+Number(r.collected||0),outstanding:a.outstanding+Number(r.outstanding||0),overdue:a.overdue+Number(r.overdue||0),late_fees:a.late_fees+Number(r.late_fees||0),installments:a.installments+Number(r.installment_count||0)}),{collected:0,outstanding:0,overdue:0,late_fees:0,installments:0});
      res.json({group_by,totals,rows});
    });
  });

  router.get('/overview', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin permission required' });
    const tenantFilter = isSuper(req) ? '' : 'WHERE t.id=?';
    const params = isSuper(req) ? [] : [req.user.tenant_id];
    db.all(`
      SELECT t.id,t.company_name,t.is_active,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) users_count,
        (SELECT COUNT(*) FROM customers c WHERE c.tenant_id=t.id) customers_count,
        (SELECT COUNT(*) FROM loans l WHERE l.tenant_id=t.id) loans_count,
        (SELECT COALESCE(SUM(i.amount+i.late_fee+i.other_charges),0) FROM installments i WHERE i.tenant_id=t.id AND i.status='PAID') collected,
        (SELECT COALESCE(SUM(i.amount),0) FROM installments i WHERE i.tenant_id=t.id AND i.status IN ('UNPAID','DELAYED')) outstanding,
        (SELECT COUNT(*) FROM installments i WHERE i.tenant_id=t.id AND i.status='DELAYED') overdue_count
      FROM tenants t ${tenantFilter} ORDER BY t.company_name
    `, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const totals = rows.reduce((a,r) => ({
        companies: a.companies + 1,
        users: a.users + Number(r.users_count || 0),
        customers: a.customers + Number(r.customers_count || 0),
        loans: a.loans + Number(r.loans_count || 0),
        collected: a.collected + Number(r.collected || 0),
        outstanding: a.outstanding + Number(r.outstanding || 0),
        overdue: a.overdue + Number(r.overdue_count || 0)
      }), {companies:0,users:0,customers:0,loans:0,collected:0,outstanding:0,overdue:0});
      res.json({ totals, companies: rows });
    });
  });

  router.get('/branches', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin permission required' });
    const sql = isSuper(req) ? 'SELECT b.*,t.company_name FROM branches b JOIN tenants t ON t.id=b.tenant_id ORDER BY t.company_name,b.name' : 'SELECT * FROM branches WHERE tenant_id=? ORDER BY name';
    db.all(sql, isSuper(req) ? [] : [req.user.tenant_id], (err, rows) => err ? res.status(500).json({error:err.message}) : res.json(rows));
  });

  router.post('/branches', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin permission required' });
    const { name, code, address, phone, tenant_id } = req.body || {};
    const tenantId = isSuper(req) ? Number(tenant_id) : req.user.tenant_id;
    if (!name || !tenantId) return res.status(400).json({ error: 'Branch name and tenant are required' });
    db.run('INSERT INTO branches (tenant_id,name,code,address,phone) VALUES (?,?,?,?,?)',
      [tenantId,name.trim(),code || null,address || '',phone || ''],
      function(err) {
        if (err) return res.status(400).json({ error: err.message });
        audit(req,'BRANCH_CREATED','branch',this.lastID,{name,tenant_id:tenantId});
        res.status(201).json({ id:this.lastID,name,tenant_id:tenantId });
      });
  });

  router.patch('/branches/:id', (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin permission required' });
    const { name, code, address, phone, is_active } = req.body || {};
    const scope = isSuper(req) ? '' : ' AND tenant_id=?';
    const params = [name,code,address,phone,is_active,req.params.id];
    if (!isSuper(req)) params.push(req.user.tenant_id);
    db.run(`UPDATE branches SET name=COALESCE(?,name),code=COALESCE(?,code),address=COALESCE(?,address),phone=COALESCE(?,phone),is_active=COALESCE(?,is_active) WHERE id=?${scope}`,params,function(err){
      if(err) return res.status(500).json({error:err.message});
      if(!this.changes) return res.status(404).json({error:'Branch not found'});
      audit(req,'BRANCH_UPDATED','branch',req.params.id,req.body);
      res.json({message:'Branch updated'});
    });
  });

  router.get('/staff', (req,res) => {
    if (!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const sql = isSuper(req)
      ? 'SELECT id,tenant_id,username,role,created_at FROM users ORDER BY tenant_id,username'
      : 'SELECT id,tenant_id,username,role,created_at FROM users WHERE tenant_id=? ORDER BY username';
    db.all(sql,isSuper(req)?[]:[req.user.tenant_id],(err,rows)=>err?res.status(500).json({error:err.message}):res.json(rows));
  });

  router.post('/staff', (req,res) => {
    if (!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const {username,password,role,tenant_id} = req.body || {};
    const assignedRole = role || 'AGENT';
    if(!username || !password || password.length < 12) return res.status(400).json({error:'Username and password (minimum 12 characters) are required'});
    if(!['ADMIN','AGENT'].includes(assignedRole)) return res.status(400).json({error:'Role must be ADMIN or AGENT'});
    if(!isSuper(req) && assignedRole !== 'AGENT') return res.status(403).json({error:'Only Super Admin can create Admin users'});
    const targetTenant = isSuper(req) ? Number(tenant_id) : req.user.tenant_id;
    if(!targetTenant) return res.status(400).json({error:'Tenant is required'});
    const hash = bcrypt.hashSync(password,10);
    db.run('INSERT INTO users (tenant_id,username,password,role) VALUES (?,?,?,?)',[targetTenant,username.trim(),hash,assignedRole],function(err){
      if(err) return res.status(400).json({error:err.message});
      audit(req,'STAFF_CREATED','user',this.lastID,{username,role:assignedRole,tenant_id:targetTenant});
      res.status(201).json({id:this.lastID,username,role:assignedRole,tenant_id:targetTenant});
    });
  });

  router.patch('/staff/:id', (req,res) => {
    if (!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const {role,password} = req.body || {};
    if(role && (!['ADMIN','AGENT'].includes(role) || (!isSuper(req) && role !== 'AGENT'))) return res.status(403).json({error:'Role change not allowed'});
    if(password && password.length < 12) return res.status(400).json({error:'Password must be at least 12 characters'});
    const fields=[], params=[];
    if(role){fields.push('role=?');params.push(role);}
    if(password){fields.push('password=?');params.push(bcrypt.hashSync(password,10));}
    if(!fields.length) return res.status(400).json({error:'No valid changes supplied'});
    params.push(req.params.id);
    let scope='';
    if(!isSuper(req)){scope=' AND tenant_id=?';params.push(req.user.tenant_id);}
    db.run(`UPDATE users SET ${fields.join(',')} WHERE id=?${scope}`,params,function(err){
      if(err) return res.status(500).json({error:err.message});
      if(!this.changes) return res.status(404).json({error:'Staff user not found'});
      audit(req,'STAFF_UPDATED','user',req.params.id,{role:role || undefined,password_changed:!!password});
      res.json({message:'Staff updated'});
    });
  });

  router.get('/staff/:id/permissions', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    db.all(`SELECT uba.*,b.name branch_name FROM user_branch_access uba JOIN branches b ON b.id=uba.branch_id WHERE uba.user_id=? ${isSuper(req)?'':'AND b.tenant_id=?'}`,isSuper(req)?[req.params.id]:[req.params.id,req.user.tenant_id],(err,rows)=>err?res.status(500).json({error:err.message}):res.json(rows));
  });

  router.put('/staff/:id/permissions', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const {branch_id,can_collect,can_manage_customers,can_view_reports}=req.body || {};
    if(!branch_id) return res.status(400).json({error:'Branch is required'});
    const checkSql=isSuper(req)?'SELECT id FROM branches WHERE id=?':'SELECT id FROM branches WHERE id=? AND tenant_id=?';
    const checkParams=isSuper(req)?[branch_id]:[branch_id,req.user.tenant_id];
    db.get(checkSql,checkParams,(err,branch)=>{
      if(err) return res.status(500).json({error:err.message});
      if(!branch) return res.status(404).json({error:'Branch not found'});
      db.run(`INSERT INTO user_branch_access (user_id,branch_id,can_collect,can_manage_customers,can_view_reports)
        VALUES (?,?,?,?,?) ON CONFLICT(user_id,branch_id) DO UPDATE SET can_collect=excluded.can_collect,can_manage_customers=excluded.can_manage_customers,can_view_reports=excluded.can_view_reports`,
        [req.params.id,branch_id,can_collect?1:0,can_manage_customers?1:0,can_view_reports?1:0],function(e){
          if(e) return res.status(500).json({error:e.message});
          audit(req,'STAFF_PERMISSIONS_UPDATED','user',req.params.id,{branch_id,can_collect,can_manage_customers,can_view_reports});
          res.json({message:'Permissions saved'});
        });
    });
  });

  router.get('/expenses', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const sql=isSuper(req)?'SELECT e.*,t.company_name,b.name branch_name FROM expenses e JOIN tenants t ON t.id=e.tenant_id LEFT JOIN branches b ON b.id=e.branch_id ORDER BY expense_date DESC,e.id DESC LIMIT 500':'SELECT e.*,b.name branch_name FROM expenses e LEFT JOIN branches b ON b.id=e.branch_id WHERE e.tenant_id=? ORDER BY expense_date DESC,e.id DESC LIMIT 500';
    db.all(sql,isSuper(req)?[]:[req.user.tenant_id],(err,rows)=>err?res.status(500).json({error:err.message}):res.json(rows));
  });

  router.post('/expenses', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const {category,description,amount,expense_date,branch_id,tenant_id}=req.body || {};
    const value=Number(amount);
    const targetTenant=isSuper(req)?Number(tenant_id):req.user.tenant_id;
    if(!category || !Number.isFinite(value) || value<=0 || !expense_date || !targetTenant) return res.status(400).json({error:'Category, positive amount, date and tenant are required'});
    const insert=()=>db.run('INSERT INTO expenses (tenant_id,branch_id,category,description,amount,expense_date,created_by) VALUES (?,?,?,?,?,?,?)',[targetTenant,branch_id || null,category,description || '',value,expense_date,req.user.id],function(err){
      if(err) return res.status(500).json({error:err.message});
      audit(req,'EXPENSE_CREATED','expense',this.lastID,{category,amount:value,branch_id});
      res.status(201).json({id:this.lastID,message:'Expense recorded'});
    });
    if(branch_id){
      db.get(isSuper(req)?'SELECT id FROM branches WHERE id=? AND tenant_id=?':'SELECT id FROM branches WHERE id=? AND tenant_id=?',[branch_id,targetTenant],(err,row)=>{
        if(err || !row) return res.status(400).json({error:'Branch does not belong to selected organization'});
        insert();
      });
    } else insert();
  });

  router.get('/reports/financial', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const tenantId=isSuper(req)?Number(req.query.tenant_id):req.user.tenant_id;
    if(!tenantId) return res.status(400).json({error:'Select an organization'});
    const {start_date,end_date}=req.query;
    const dateClause=start_date && end_date ? ' AND paid_date BETWEEN ? AND ?' : '';
    const expClause=start_date && end_date ? ' AND expense_date BETWEEN ? AND ?' : '';
    const paidParams=[tenantId,...(dateClause?[start_date,end_date]:[])];
    const expenseParams=[tenantId,...(expClause?[start_date,end_date]:[])];
    db.get(`SELECT COALESCE(SUM(amount+late_fee+other_charges),0) income, COUNT(*) payment_count FROM installments WHERE tenant_id=? AND status='PAID'${dateClause}`,paidParams,(err,income)=>{
      if(err) return res.status(500).json({error:err.message});
      db.get(`SELECT COALESCE(SUM(amount),0) expenses, COUNT(*) expense_count FROM expenses WHERE tenant_id=?${expClause}`,expenseParams,(e,expense)=>{
        if(e) return res.status(500).json({error:e.message});
        const collected=Number(income.income||0),spent=Number(expense.expenses||0);
        res.json({income:collected,expenses:spent,net:collected-spent,payment_count:income.payment_count,expense_count:expense.expense_count});
      });
    });
  });

  router.get('/audit', (req,res) => {
    if(!isAdmin(req)) return res.status(403).json({error:'Admin permission required'});
    const sql=isSuper(req)?'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500':'SELECT * FROM audit_logs WHERE tenant_id=? ORDER BY id DESC LIMIT 500';
    db.all(sql,isSuper(req)?[]:[req.user.tenant_id],(err,rows)=>err?res.status(500).json({error:err.message}):res.json(rows));
  });

  router.post('/receipts', (req,res) => {
    const {installment_id}=req.body || {};
    if(!installment_id) return res.status(400).json({error:'Installment is required'});
    const tenantId=isSuper(req)?null:req.user.tenant_id;
    db.get(`SELECT i.*,c.name customer_name,c.phone,l.loan_code FROM installments i JOIN loans l ON l.id=i.loan_id JOIN customers c ON c.id=l.customer_id WHERE i.id=? AND i.status='PAID' ${tenantId?'AND i.tenant_id=?':''}`,tenantId?[installment_id,tenantId]:[installment_id],(err,row)=>{
      if(err) return res.status(500).json({error:err.message});
      if(!row) return res.status(404).json({error:'Paid installment not found'});
      // The payment-status database trigger normally creates the receipt automatically.
      db.get('SELECT * FROM payment_receipts WHERE installment_id=?',[row.id],(lookupErr,existing)=>{
        if(lookupErr) return res.status(500).json({error:lookupErr.message});
        if(existing) return res.json({receipt:existing,customer:{name:row.customer_name,phone:row.phone},loan_code:row.loan_code,company_name:'FINANCD'});
        const receiptNumber='RCPT-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(row.id).padStart(6,'0');
        db.run('INSERT INTO payment_receipts (tenant_id,installment_id,receipt_number,amount,payment_method,paid_date,created_by) VALUES (?,?,?,?,?,?,?)',
          [row.tenant_id,row.id,receiptNumber,Number(row.amount)+Number(row.late_fee||0)+Number(row.other_charges||0),row.payment_method || 'CASH',row.paid_date,req.user.id],function(e){
            if(e) return res.status(500).json({error:e.message});
            db.get('SELECT * FROM payment_receipts WHERE installment_id=?',[row.id],(getErr,receipt)=>{
              if(getErr) return res.status(500).json({error:getErr.message});
              audit(req,'RECEIPT_ISSUED','receipt',receipt.id,{receipt_number:receipt.receipt_number,installment_id:row.id});
              res.status(201).json({receipt,customer:{name:row.customer_name,phone:row.phone},loan_code:row.loan_code,company_name:'FINANCD'});
            });
          });
      });
    });
  });

  router.get('/backup', (req,res) => {
    if(!isSuper(req)) return res.status(403).json({error:'Only Super Admin can download full database backup'});
    const path=require('path'), fs=require('fs');
    const dbPath=path.resolve(__dirname,'database.sqlite');
    if(!fs.existsSync(dbPath)) return res.status(404).json({error:'Database file not found'});
    audit(req,'DATABASE_BACKUP_DOWNLOADED','database',null,{});
    res.download(dbPath,'financd-backup.sqlite');
  });

  app.use('/api/manage',router);
}

module.exports = { registerManagementRoutes };
