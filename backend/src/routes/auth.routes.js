const express = require('express');
const { registerOrLogin, requireAuth, loginAdmin } = require('../auth/auth');

const router = express.Router();

// POST /api/auth/register { displayName, rollNumber } -> { user, token }
// First use of a roll number creates the account; every later use logs that
// same person back into the same profile (issuing a fresh session token).
router.post('/register', async (req, res) => {
  try {
    const { user, token } = await registerOrLogin(req.body.displayName, req.body.rollNumber);
    res.json({
      token,
      user: { id: user.id, displayName: user.display_name, rollNumber: user.roll_number, isAdmin: user.is_admin },
    });
  } catch (err) {
    res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: { id: req.user.id, displayName: req.user.display_name, rollNumber: req.user.roll_number, isAdmin: req.user.is_admin } });
});

// POST /api/auth/admin-login { password }
router.post('/admin-login', requireAuth(), async (req, res) => {
  try {
    const user = await loginAdmin(req.user.id, req.body.password);
    res.json({ user: { id: user.id, displayName: user.display_name, rollNumber: user.roll_number, isAdmin: user.is_admin } });
  } catch (err) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: err.message });
  }
});

module.exports = router;
