const crypto = require('crypto');
const { pool: db } = require('../db/pool');

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashPassword(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

/** Create a new player identity with a display name. Returns { user, token }. */
async function registerPlayer(displayName) {
  const name = String(displayName || '').trim().slice(0, 40);
  if (!name) throw new Error('Display name is required.');
  const token = newToken();
  const { rows } = await db.query(
    `INSERT INTO users (display_name, session_token) VALUES ($1,$2) RETURNING *`,
    [name, token]
  );
  return { user: rows[0], token };
}

/** Resolve a user from a bearer session token. */
async function getUserByToken(token) {
  if (!token) return null;
  const { rows } = await db.query('SELECT * FROM users WHERE session_token=$1', [token]);
  if (!rows.length) return null;
  db.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [rows[0].id]).catch(() => {});
  return rows[0];
}

/** Express middleware requiring a valid session token in Authorization: Bearer <token>. */
function requireAuth() {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    const user = await getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing session token.' });
    req.user = user;
    next();
  };
}

function requireAdmin() {
  return async (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required.' });
    }
    next();
  };
}

/** Promote/authenticate an existing user as admin via the ADMIN_PASSWORD env secret. */
async function loginAdmin(userId, password) {
  if (!process.env.ADMIN_PASSWORD) throw new Error('Admin login is not configured on this server.');
  if (password !== process.env.ADMIN_PASSWORD) throw new Error('Incorrect admin password.');
  const { rows } = await db.query('UPDATE users SET is_admin=TRUE WHERE id=$1 RETURNING *', [userId]);
  return rows[0];
}

module.exports = { registerPlayer, getUserByToken, requireAuth, requireAdmin, loginAdmin, hashPassword };
