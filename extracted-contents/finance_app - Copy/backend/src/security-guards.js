/**
 * FINANCD security guard middleware.
 *
 * IMPORTANT: install immediately after `const app = express()` and BEFORE
 * every app.get/app.post route in server.js:
 *
 *   const { installSecurityGuards } = require('./security-guards');
 *   installSecurityGuards(app, { db, bcrypt, jwt });
 *
 * Requires a strong JWT_SECRET environment variable (32+ characters).
 */
function installSecurityGuards(app, { db, bcrypt, jwt }) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'fintrack_super_secret_key_123') {
    throw new Error('Set a unique JWT_SECRET of at least 32 characters before starting FINANCD.');
  }

  const readUser = (id, callback) => {
    db.get(
      `SELECT u.id, u.username, u.role, u.tenant_id, u.password,
              COALESCE(t.is_active, 1) AS tenant_active
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ?`,
      [id],
      callback
    );
  };

  app.use('/api', (req, res, next) => {
    if (req.path === '/login' && req.method === 'POST') return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    let claims;
    try {
      claims = jwt.verify(token, secret);
    } catch (_) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    readUser(claims.id, (err, user) => {
      if (err) return res.status(500).json({ error: 'Unable to verify account' });
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      if (user.tenant_id != null && Number(user.tenant_active) !== 1) {
        return res.status(403).json({ error: 'This organization account is disabled' });
      }

      // Always use the current database role/tenant, never stale JWT role claims.
      req.securityUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        tenant_id: user.tenant_id
      };

      const actor = req.securityUser;
      const isSuper = actor.role === 'SUPER_ADMIN';
      const isAdmin = actor.role === 'ADMIN' || isSuper;
      const path = req.path;
      const method = req.method;

      if (path === '/backup' && !isSuper) {
        return res.status(403).json({ error: 'Only Super Admin can download full database backups' });
      }

      if (path === '/users' && method === 'GET' && !isAdmin) {
        return res.status(403).json({ error: 'Admin permission required' });
      }

      if (path === '/users' && method === 'POST') {
        if (!isAdmin) return res.status(403).json({ error: 'Admin permission required' });
        const { username, password, role } = req.body || {};
        if (!username || typeof username !== 'string' || !password || typeof password !== 'string' || password.length < 12) {
          return res.status(400).json({ error: 'Username and a password of at least 12 characters are required' });
        }
        if (role === 'SUPER_ADMIN') {
          return res.status(403).json({ error: 'Super Admin accounts must be provisioned out-of-band' });
        }
        if (!isSuper && role && role !== 'AGENT') {
          return res.status(403).json({ error: 'Admins can create Staff/Agent accounts only' });
        }
      }

      if (path === '/change-password' && method === 'POST') {
        const { userId, newPassword, currentPassword } = req.body || {};
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
          return res.status(400).json({ error: 'New password must be at least 12 characters' });
        }
        if (Number(userId) !== Number(actor.id) && !isSuper) {
          return res.status(403).json({ error: 'You may only change your own password' });
        }
        if (isSuper && Number(userId) !== Number(actor.id)) return next();
        if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
        return readUser(actor.id, (readErr, current) => {
          if (readErr || !current) return res.status(500).json({ error: 'Unable to verify password' });
          bcrypt.compare(currentPassword, current.password, (compareErr, ok) => {
            if (compareErr || !ok) return res.status(401).json({ error: 'Current password is incorrect' });
            next();
          });
        });
      }

      // High-impact configuration and destructive actions are administrator-only.
      const adminOnly =
        (path === '/settings' && method === 'POST') ||
        (path.startsWith('/customers/') && method === 'DELETE') ||
        (path.startsWith('/loans/') && method === 'PUT') ||
        (path.startsWith('/loans/') && path.endsWith('/status') && method === 'PATCH');

      if (adminOnly && !isAdmin) {
        return res.status(403).json({ error: 'Admin permission required for this action' });
      }

      next();
    });
  });
}

module.exports = { installSecurityGuards };
