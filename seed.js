
require("dotenv").config();
const fs=require("fs");
const path=require("path");
const pool=require("./db");
(async()=>{
  const players=JSON.parse(fs.readFileSync(path.join(__dirname,"../data/players.json"),"utf8"));
  await pool.query("BEGIN");
  try {
    for(const p of players){
      await pool.query(`
        INSERT INTO players(sr_no,set_no,set_name,first_name,surname,full_name,country,specialism,status,reserve_price_lakh,points)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(sr_no) DO UPDATE SET
          set_no=EXCLUDED.set_no,set_name=EXCLUDED.set_name,first_name=EXCLUDED.first_name,
          surname=EXCLUDED.surname,full_name=EXCLUDED.full_name,country=EXCLUDED.country,
          specialism=EXCLUDED.specialism,status=EXCLUDED.status,
          reserve_price_lakh=EXCLUDED.reserve_price_lakh,points=EXCLUDED.points,updated_at=now()
      `,[p.srNo,p.setNo,p.setName,p.firstName,p.surname,p.fullName,p.country,p.specialism,p.status,p.reservePriceLakh,p.points]);
    }
    await pool.query("COMMIT");
    console.log(`Seeded ${players.length} players.`);
  } catch(e){await pool.query("ROLLBACK");throw e}
  finally{await pool.end()}
})().catch(e=>{console.error(e);process.exit(1)});
