/**
 * Imports the official IPL AUCTION SHOWDOWN player catalogue into PostgreSQL.
 *
 * Source of truth: ./players.json — a verbatim transcription of the columns
 * [sr_no, set_no, set_name, first_name, surname, country, specialism, status,
 *  reserve_price_lakh, points] from the official catalogue PDF.
 *
 * This script does NOT invent, adjust, or "correct" any values. It validates
 * structure and fails loudly on malformed rows rather than silently guessing.
 *
 * Re-running this script is idempotent: it upserts by sr_no.
 */
const path = require('path');
const { pool } = require('./pool');

const RAW = require('./players.json');
const EXPECTED_COUNT = 208;
const VALID_SPEC = new Set(['BATTER', 'BOWLER', 'ALL-ROUNDER', 'WICKETKEEPER']);
const VALID_STATUS = new Set(['Capped', 'Uncapped']);

function validateRows(rows) {
  if (rows.length !== EXPECTED_COUNT) {
    throw new Error(
      `Catalogue validation failed: expected ${EXPECTED_COUNT} players, found ${rows.length}.`
    );
  }
  const seenSr = new Set();
  rows.forEach((r, idx) => {
    const [sr, setNo, setName, firstName, surname, country, spec, status, reserve, points] = r;
    const rowNum = idx + 1;
    if (r.length !== 10) {
      throw new Error(`Row ${rowNum} malformed (expected 10 columns, got ${r.length}): ${JSON.stringify(r)}`);
    }
    if (!Number.isInteger(Number(sr)) || Number(sr) <= 0) {
      throw new Error(`Row ${rowNum}: invalid sr_no "${sr}"`);
    }
    if (seenSr.has(Number(sr))) {
      throw new Error(`Row ${rowNum}: duplicate sr_no "${sr}"`);
    }
    seenSr.add(Number(sr));
    if (!Number.isInteger(Number(setNo))) throw new Error(`Row ${rowNum}: invalid set_no "${setNo}"`);
    if (!setName) throw new Error(`Row ${rowNum}: missing set name`);
    if (!firstName) throw new Error(`Row ${rowNum}: missing first_name`);
    if (!surname) throw new Error(`Row ${rowNum}: missing surname`);
    if (!country) throw new Error(`Row ${rowNum}: missing country`);
    if (!VALID_SPEC.has(spec)) throw new Error(`Row ${rowNum}: invalid specialism "${spec}"`);
    if (!VALID_STATUS.has(status)) throw new Error(`Row ${rowNum}: invalid status "${status}"`);
    if (!Number.isInteger(Number(reserve)) || Number(reserve) <= 0) {
      throw new Error(`Row ${rowNum}: invalid reserve_price_lakh "${reserve}"`);
    }
    if (!Number.isInteger(Number(points)) || Number(points) <= 0) {
      throw new Error(`Row ${rowNum}: invalid points "${points}"`);
    }
  });
}

async function seed() {
  validateRows(RAW);
  console.log(`Validated ${RAW.length} players from catalogue. Importing...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of RAW) {
      const [sr, setNo, setName, firstName, surname, country, spec, status, reserve, points] = row;
      const fullName = `${firstName} ${surname}`;
      await client.query(
        `INSERT INTO players
          (sr_no, set_no, set_name, first_name, surname, full_name, country, specialism, status,
           reserve_price_lakh, points, is_active, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, TRUE, now())
         ON CONFLICT (sr_no) DO UPDATE SET
           set_no = EXCLUDED.set_no,
           set_name = EXCLUDED.set_name,
           first_name = EXCLUDED.first_name,
           surname = EXCLUDED.surname,
           full_name = EXCLUDED.full_name,
           country = EXCLUDED.country,
           specialism = EXCLUDED.specialism,
           status = EXCLUDED.status,
           reserve_price_lakh = EXCLUDED.reserve_price_lakh,
           points = EXCLUDED.points,
           updated_at = now()`,
        [Number(sr), Number(setNo), setName, firstName, surname, fullName, country, spec, status,
         Number(reserve), Number(points)]
      );
    }
    await client.query('COMMIT');

    const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM players');
    console.log(`Import complete. players table now has ${rows[0].c} rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
