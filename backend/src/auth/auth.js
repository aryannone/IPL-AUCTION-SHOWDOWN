const crypto = require('crypto');
const { pool: db } = require('../db/pool');

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashPassword(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

/** Roll number format: YY F|N T XXXXXX — e.g. 26F1000123
 * YY = admission year, F=student / N=admin-approved non-student, T=term(1/2/3), XXXXXX=serial. */
const ROLL_NUMBER_REGEX = /^\d{2}[FN][123]\d{6}$/;

function parseRollNumber(roll) {
  const m = ROLL_NUMBER_REGEX.exec(roll);
  if (!m) return null;
  return {
    year: roll.slice(0, 2),
    kind: roll[2] === 'F' ? 'Student' : 'Admin-approved',
    term: roll[3],
    serial: roll.slice(4),
  };
}

/**
 * Registers a new account on first use of a roll number, or logs the same
 * person back in (issuing a fresh session token) on every subsequent use —
 * the roll number is the durable identity, not the display name.
 */
async function registerOrLogin(displayName, rollNumberRaw) {
  const name = String(displayName || '').trim().slice(0, 40);
  const rollNumber = String(rollNumberRaw || '').trim().toUpperCase();
  if (!name) throw new Error('Name is required.');
  if (!ROLL_NUMBER_REGEX.test(rollNumber)) {
    throw new Error('Roll number must match YYFTxxxxxx, e.g. 26F1000123 (F=student or N=admin-approved, T=1/2/3).');
  }

  const token = newToken();
  const existing = await db.query('SELECT * FROM users WHERE roll_number=$1', [rollNumber]);
  if (existing.rowCount > 0) {
    const { rows } = await db.query(
      `UPDATE users SET session_token=$1, display_name=$2, last_seen_at=now() WHERE id=$3 RETURNING *`,
      [token, name, existing.rows[0].id]
    );
    return { user: rows[0], token };
  }

  const { rows } = await db.query(
    `INSERT INTO users (display_name, session_token, roll_number) VALUES ($1,$2,$3) RETURNING *`,
    [name, token, rollNumber]
  );
  return { user: rows[0], token };
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

module.exports = {
  registerPlayer,
  registerOrLogin,
  parseRollNumber,
  ROLL_NUMBER_REGEX,
  getUserByToken,
  requireAuth,
  requireAdmin,
  loginAdmin,
  hashPassword,
};
