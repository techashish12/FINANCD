const { db, initDb } = require('./db');
const bcrypt = require('bcryptjs');

const today = new Date();
function formatDate(date) {
    return date.toISOString().split('T')[0];
}
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

// Massive Array Generator for 20 Customers
const customers = [];
const loans = [];
const firstNames = ['Ramesh', 'Suresh', 'Amit', 'Priya', 'Kavita', 'Vikram', 'Raj', 'Anjali', 'Sneha', 'Arjun', 'Pooja', 'Rohan', 'Neha', 'Gaurav', 'Manish', 'Simran', 'Karan', 'Deepak', 'Aarti', 'Sunil'];
const lastNames = ['Kumar', 'Singh', 'Patel', 'Sharma', 'Gupta', 'Verma', 'Joshi', 'Yadav', 'Rao', 'Chauhan'];
const cities = ['Delhi', 'Mumbai', 'Ahmedabad', 'Pune', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'];
const financeTypes = ['TWO_WHEELER', 'FOUR_WHEELER', 'UDHAR', 'GIRVI', 'HOME_LOAN', 'PERSONAL'];

for (let i = 0; i < 20; i++) {
    const firstName = firstNames[i];
    const lastName = lastNames[i % lastNames.length];
    
    customers.push({
        name: `${firstName} ${lastName}`,
        phone: `9876500${i.toString().padStart(3, '0')}`,
        alternate_phone: '',
        unique_id: `UID-${Math.floor(Math.random() * 10000)}`,
        address: cities[Math.floor(Math.random() * cities.length)],
        notes: i % 5 === 0 ? 'VIP Customer' : '',
        photo_url: `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=random`
    });

    const fType = financeTypes[Math.floor(Math.random() * financeTypes.length)];
    const totalInst = 6 + Math.floor(Math.random() * 6); // 6 to 11 installments
    const instAmt = 2000 + Math.floor(Math.random() * 3000);
    
    const loan = {
        customer_index: i,
        finance_type: fType,
        vehicle_name: fType.includes('WHEELER') ? 'Demo Vehicle' : '',
        vendor_name: fType.includes('WHEELER') ? 'Demo Motors' : '',
        insurance_company: fType === 'INSURANCE' ? 'Demo Insurer' : '',
        collateral_name: fType === 'GIRVI' ? 'Gold Chain' : '',
        collateral_weight: fType === 'GIRVI' ? 20.5 : null,
        collateral_weight_unit: fType === 'GIRVI' ? 'GM' : null,
        total_finance_amount: totalInst * instAmt,
        total_installments: totalInst,
        installment_amount: instAmt,
        late_fee_per_day: 50,
        installments: []
    };

    // Spread installments across Jan to roughly July
    let currentDate = new Date(2026, 0, 15); // Start mid-Jan
    for (let j = 0; j < totalInst; j++) {
        const isPast = currentDate < today;
        let status = 'UNPAID';
        let paid_date = null;
        let late_fee = 0;
        
        if (isPast) {
            // Randomly assign PAID or DELAYED to past installments
            if (Math.random() > 0.3) {
                status = 'PAID';
                // Randomly paid exactly on time or a few days late
                const daysLate = Math.floor(Math.random() * 10);
                paid_date = formatDate(addDays(currentDate, daysLate));
                if (daysLate > 0) late_fee = daysLate * 50;
            } else {
                status = 'DELAYED';
            }
        }

        loan.installments.push({
            amount: instAmt,
            due_date: formatDate(currentDate),
            status: status,
            paid_date: paid_date,
            late_fee: late_fee
        });
        
        currentDate = addDays(currentDate, 30); // Monthly intervals
    }
    
    loans.push(loan);
}

initDb(() => {
    // The schema is now guaranteed to exist before we delete or insert data!
    db.serialize(() => {
        db.run('DELETE FROM installments');
        db.run('DELETE FROM loans');
        db.run('DELETE FROM customers');
        db.run('DELETE FROM settings');
        db.run('DELETE FROM users');
        db.run('DELETE FROM tenants');
        db.run('DELETE FROM sqlite_sequence');

        // Super Admin (Controls the SaaS logic)
        const superHash = bcrypt.hashSync('superadmin123', 10);
        db.run(`INSERT INTO users (username, password, role) VALUES ('superadmin', ?, 'SUPER_ADMIN')`, [superHash]);
// Demo Data enhancements
// Adding multiple tenants
db.run(`INSERT INTO tenants (company_name, allowed_features) VALUES ('Second Tenant Finance', 'ALL')`, function(err) {
    const tenant2Id = this.lastID;
    const admin2Hash = bcrypt.hashSync('admin2_123', 10);
    db.run(`INSERT INTO users (tenant_id, username, password, role) VALUES (?, 'admin2', ?, 'ADMIN')`, [tenant2Id, admin2Hash]);
    db.run(`INSERT INTO settings (tenant_id, company_name, company_phone) VALUES (?, 'Second Tenant Finance', '8888888888')`, [tenant2Id]);
});

        // Default Tenant 1
        db.run(`INSERT INTO tenants (company_name, allowed_features) VALUES ('Demo Finance Co', 'ALL')`, function(err) {
            const defaultTenantId = this.lastID;

            // Admin User for Default Tenant
            const adminHash = bcrypt.hashSync('admin123', 10);
            db.run(`INSERT INTO users (tenant_id, username, password, role) VALUES (?, 'admin', ?, 'ADMIN')`, [defaultTenantId, adminHash]);
            
            // Setting for Default Tenant
            db.run(`INSERT INTO settings (tenant_id, company_name, company_phone, company_logo, upi_id, qr_code_url) VALUES (?, 'Demo Finance Co', '9999999999', '', 'fintrack@upi', '')`, [defaultTenantId]);

            customers.forEach((c, idx) => {
                const uniqueCode = `CUST-${1000 + idx}`;
                db.run(
                    `INSERT INTO customers (tenant_id, customer_code, name, phone, alternate_phone, unique_id, book_number, address, notes, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [defaultTenantId, uniqueCode, c.name, c.phone, c.alternate_phone, c.unique_id, `B-${idx+1}`, c.address, c.notes, c.photo_url], 
                    function(err) {
                    if (err) console.error(err);
                    const customerId = this.lastID;
                    
                    loans.forEach(loan => {
                        if (loan.customer_index === idx) {
                            const loanCode = `LOAN-${2000 + idx}`;
                            db.run(
                                `INSERT INTO loans (tenant_id, customer_id, loan_code, finance_type, vehicle_name, vendor_name, collateral_name, collateral_weight, collateral_weight_unit, total_finance_amount, total_installments, installment_amount, late_fee_per_day, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [defaultTenantId, customerId, loanCode, loan.finance_type, loan.vehicle_name, loan.vendor_name, loan.collateral_name, loan.collateral_weight, loan.collateral_weight_unit, loan.total_finance_amount, loan.total_installments, loan.installment_amount, loan.late_fee_per_day, idx === 1 ? 'DEFAULTER' : 'ACTIVE'],
                                function(err) {
                                    if (err) console.error(err);
                                    const loanId = this.lastID;
                                    
                                    loan.installments.forEach(inst => {
                                        const payment_method = inst.status === 'PAID' ? (Math.random() > 0.5 ? 'CASH' : 'ONLINE') : null;
                                        
                                        // Introduce partial payments logic for some of the "UNPAID" kists to simulate real-world carryover
                                        // Randomly give them an uneven base amount (e.g., base + shortfall)
                                        let finalAmt = inst.amount;
                                        if (inst.status === 'UNPAID' && Math.random() > 0.8) {
                                            finalAmt += 500; // Simulating a shortfall carryover from previous
                                        }

                                        db.run(`INSERT INTO installments (tenant_id, loan_id, amount, due_date, status, paid_date, late_fee, other_charges, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                            [defaultTenantId, loanId, finalAmt, inst.due_date, inst.status, inst.paid_date, inst.late_fee, 0, payment_method]);
                                    });
                                }
                            );
                        }
                    });
                });
            });
        });
    });

    setTimeout(() => {
        console.log("Database seeded successfully.");
        process.exit(0);
    }, 2000);
});
