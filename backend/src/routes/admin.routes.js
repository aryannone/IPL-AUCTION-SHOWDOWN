const express = require('express');
const { pool: db } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../auth/auth');

const router = express.Router();
router.use(requireAuth(), requireAdmin());

// GET /api/admin/players — full list including inactive
router.get('/players', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM players ORDER BY sr_no ASC');
  res.json({ players: rows });
});

// PATCH /api/admin/players/:id — partial update of any editable field
const EDITABLE = ['first_name', 'surname', 'country', 'specialism', 'status',
  'reserve_price_lakh', 'points', 'image_url', 'is_active', 'set_no', 'set_name'];

router.patch('/players/:id', async (req, res) => {
  const updates = {};
  for (const key of EDITABLE) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if ('first_name' in updates || 'surname' in updates) {
    const { rows: cur } = await db.query('SELECT first_name, surname FROM players WHERE id=$1', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found.' });
    const first = updates.first_name ?? cur[0].first_name;
    const last = updates.surname ?? cur[0].surname;
    updates.full_name = `${first} ${last}`;
  }
  const keys = Object.keys(updates);
  if (!keys.length) return res.status(400).json({ error: 'BAD_REQUEST', message: 'No editable fields provided.' });

  const setClause = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
  const values = keys.map((k) => updates[k]);
  values.push(req.params.id);

  try {
    const { rows } = await db.query(
      `UPDATE players SET ${setClause}, updated_at=now() WHERE id=$${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found.' });
    res.json({ player: rows[0] });
  } catch (err) {
    res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
  }
});

// POST /api/admin/players — add a new player
router.post('/players', async (req, res) => {
  const b = req.body;
  const required = ['sr_no', 'set_no', 'set_name', 'first_name', 'surname', 'country', 'specialism', 'status', 'reserve_price_lakh', 'points'];
  for (const f of required) {
    if (b[f] === undefined || b[f] === null || b[f] === '') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: `Missing field: ${f}` });
    }
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO players (sr_no, set_no, set_name, first_name, surname, full_name, country, specialism, status, reserve_price_lakh, points, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [b.sr_no, b.set_no, b.set_name, b.first_name, b.surname, `${b.first_name} ${b.surname}`,
       b.country, b.specialism, b.status, b.reserve_price_lakh, b.points, b.image_url || null]
    );
    res.status(201).json({ player: rows[0] });
  } catch (err) {
    res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
  }
});

// DELETE /api/admin/players/:id — soft delete (deactivate)
router.delete('/players/:id', async (req, res) => {
  const { rows } = await db.query('UPDATE players SET is_active=FALSE, updated_at=now() WHERE id=$1 RETURNING *', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Player not found.' });
  res.json({ player: rows[0] });
});

// GET /api/admin/matches — game history with participant names, roll numbers,
// scores, and the winner clearly identified.
router.get('/matches', async (req, res) => {
  const { rows } = await db.query(
    `SELECT g.id, g.room_code, g.status, g.created_at, g.started_at, g.finished_at,
            json_agg(
              json_build_object(
                'userId', u.id,
                'name', u.display_name,
                'rollNumber', u.roll_number,
                'slot', gp.slot,
                'finalScore', gr.final_score,
                'playerPoints', gr.player_points,
                'remainingBudgetLakh', gr.remaining_budget_lakh,
                'rank', gr.rank
              ) ORDER BY gp.slot
            ) AS participants
     FROM games g
     JOIN game_participants gp ON gp.game_id = g.id
     JOIN users u ON u.id = gp.user_id
     LEFT JOIN game_results gr ON gr.game_id = g.id AND gr.user_id = u.id
     WHERE g.status IN ('FINISHED', 'ABANDONED')
     GROUP BY g.id
     ORDER BY g.finished_at DESC NULLS LAST, g.created_at DESC
     LIMIT 100`
  );

  const games = rows.map((g) => {
    const winner = (g.participants || []).find((p) => p.rank === 1) || null;
    return { ...g, winner };
  });

  res.json({ games });
});

module.exports = router;
