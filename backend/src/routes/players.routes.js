const express = require('express');
const { pool: db } = require('../db/pool');

const router = express.Router();

// GET /api/players?search=&specialism=&status=&set=
router.get('/', async (req, res) => {
  const { search, specialism, status, set } = req.query;
  const clauses = ['is_active = TRUE'];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`LOWER(full_name) LIKE $${params.length}`);
  }
  if (specialism) {
    params.push(specialism);
    clauses.push(`specialism = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (set) {
    params.push(set);
    clauses.push(`set_name = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT id, sr_no, set_no, set_name, first_name, surname, full_name, country, specialism,
            status, reserve_price_lakh, points, image_url
     FROM players WHERE ${clauses.join(' AND ')} ORDER BY sr_no ASC`,
    params
  );
  res.json({ players: rows, count: rows.length });
});

module.exports = router;
