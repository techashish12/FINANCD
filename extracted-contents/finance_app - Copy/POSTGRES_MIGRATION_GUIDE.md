# How to Migrate from SQLite to a Cloud PostgreSQL Database

Currently, FinTrack uses a local **SQLite** database (`database.sqlite`). This is perfect for desktop, local network usage, and development. However, if you deploy your backend to a cloud provider like Render or Heroku, your local file will be erased every time the server restarts.

To make this app Production-Ready for the Cloud, you must switch the database from SQLite to **PostgreSQL**.

### Step 1: Create a Cloud PostgreSQL Database
1. Go to [Supabase](https://supabase.com/), [Render](https://render.com/), or [ElephantSQL](https://elephantsql.com/).
2. Create a free account and spin up a new PostgreSQL database.
3. Find your **Connection String / Database URL**. It will look something like this:
   `postgresql://username:password@hostname:5432/dbname`

### Step 2: Update the `.env` file
Open the `.env` file in the `backend` folder (create it if it doesn't exist) and add your connection string:
```env
JWT_SECRET=your_super_secret_production_key_here
DATABASE_URL=postgresql://username:password@hostname:5432/dbname
```

### Step 3: Install the PostgreSQL Driver
Open your terminal, navigate to the `backend` directory, and run:
```bash
npm install pg
npm uninstall sqlite3
```

### Step 4: Update `backend/src/db.js`
Open the `db.js` file. You need to replace the SQLite code with the `pg` (Postgres) code.

**Delete the old SQLite code:**
```javascript
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./src/database.sqlite', (err) => { ... });
```

**Replace it with:**
```javascript
const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect((err) => {
    if (err) {
        console.error('Connection error', err.stack);
    } else {
        console.log('Connected to PostgreSQL Cloud Database');
    }
});

module.exports = { db };
```

### Step 5: Update SQL Syntax in `db.js` and `server.js`
Postgres uses slightly different syntax than SQLite. You will need to search through your backend files (`db.js` and `server.js`) and make two major changes:

1. **Change `AUTOINCREMENT` to `SERIAL`:**
   In your `CREATE TABLE` commands in `db.js`:
   *SQLite:* `id INTEGER PRIMARY KEY AUTOINCREMENT`
   *Postgres:* `id SERIAL PRIMARY KEY`

2. **Change `?` parameter markers to `$1, $2, $3`:**
   *SQLite:* `db.run("INSERT INTO users (username) VALUES (?)", [name])`
   *Postgres:* `db.query("INSERT INTO users (username) VALUES ($1)", [name])`
   *(Note: Postgres uses `.query()` instead of `.run()`, `.all()`, or `.get()`)*

Once these syntax changes are complete, your app is fully ready to be hosted in the cloud!
