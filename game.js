
const crypto=require("crypto");
const pool=require("./db");
const games=new Map();
const incFor=(bid)=>bid<=100?5:bid<=200?10:bid<=500?15:20;
const code=()=>crypto.randomBytes(4).toString("base64url").slice(0,6).toUpperCase();

async function newRoom(userId){
  let room; do{room=code()}while((await pool.query("SELECT 1 FROM games WHERE room_code=$1",[room])).rowCount);
  const {rows}=await pool.query("INSERT INTO games(room_code) VALUES($1) RETURNING *",[room]);
  const s={...rows[0],participants:{[userId]:{slot:1,budgetLakh:1000,ready:false,team:[],connected:true,lastSeen:Date.now()}},pool:[],order:[],unsold:[],events:[]};
  await pool.query("INSERT INTO game_participants(game_id,user_id,slot) VALUES($1,$2,1)",[s.id,userId]); games.set(s.id,s); return s;
}
async function joinRoom(userId,room){
  const {rows}=await pool.query("SELECT * FROM games WHERE room_code=$1",[room.toUpperCase()]);
  if(!rows[0])throw Error("ROOM_NOT_FOUND"); const s0=rows[0];
  const ps=await pool.query("SELECT * FROM game_participants WHERE game_id=$1",[s0.id]);
  if(ps.rowCount>=2)throw Error("ROOM_FULL"); if(s0.status!=="LOBBY")throw Error("GAME_ALREADY_STARTED");
  const slot=2; await pool.query("INSERT INTO game_participants(game_id,user_id,slot) VALUES($1,$2,$3)",[s0.id,userId,slot]);
  let s=games.get(s0.id); if(!s){s={...s0,participants:{},pool:[],order:s0.auction_order||[],unsold:[],events:[]};games.set(s.id,s)}
  s.participants[userId]={slot,budgetLakh:1000,ready:false,team:[],connected:true,lastSeen:Date.now()}; return s;
}
async function getState(id){
  if(games.has(id))return games.get(id);
  const {rows}=await pool.query("SELECT * FROM games WHERE id=$1",[id]);if(!rows[0])return null;
  const s={...rows[0],participants:{},pool:[],order:rows[0].auction_order||[],unsold:[],events:[]};
  const ps=await pool.query("SELECT * FROM game_participants WHERE game_id=$1",[id]);
  for(const p of ps.rows)s.participants[p.user_id]={slot:p.slot,budgetLakh:p.budget_lakh,ready:p.ready,team:[],connected:p.connected,lastSeen:Date.now()};
  const gp=await pool.query(`SELECT gp.*,p.full_name,p.country,p.specialism,p.status FROM game_players gp JOIN players p ON p.id=gp.player_id WHERE gp.game_id=$1`,[id]);
  s.pool=gp.rows.map(x=>x.player_id); for(const x of gp.rows)if(x.result==="UNSOLD")s.unsold.push(x.player_id);
  for(const x of gp.rows)if(x.winner_user_id)s.participants[x.winner_user_id]?.team.push(x.player_id);
  games.set(id,s);return s;
}
async function hydratePlayers(s){
  const ids=[...new Set([...(s.pool||[]),s.current_player_id].filter(Boolean))];
  if(!ids.length)return {};
  const {rows}=await pool.query(`SELECT id,full_name,country,specialism,status,reserve_price_lakh,points FROM players WHERE id=ANY($1::int[])`,[ids]);
  return Object.fromEntries(rows.map(p=>[p.id,p]));
}
async function publicState(s){
  const players=await hydratePlayers(s);
  const ps=Object.fromEntries(Object.entries(s.participants).map(([id,p])=>[id,{slot:p.slot,budgetLakh:p.budgetLakh,ready:p.ready,team:p.team,connected:p.connected}]));
  const teamPlayers={}; for(const [id,p] of Object.entries(s.participants))teamPlayers[id]=(p.team||[]).map(x=>players[x]).filter(Boolean);
  return {gameId:s.id,roomCode:s.room_code,status:s.status,strategyEndsAt:s.strategy_ends_at,auctionEndsAt:s.auction_ends_at,currentIndex:s.current_index,currentPlayerId:s.current_player_id,currentBidLakh:s.current_bid_lakh,currentBidderId:s.current_bidder_id,order:s.order,pool:s.pool,unsold:s.unsold,players,participants:ps,teamPlayers};
}
async function startGame(s){
  let rows;
  do{rows=(await pool.query("SELECT * FROM players WHERE is_active=true ORDER BY random() LIMIT 5")).rows}while(rows.reduce((a,p)=>a+p.points,0)<=100);
  s.pool=rows.map(p=>p.id);s.order=[...s.pool].sort(()=>Math.random()-0.5);s.current_index=0;s.status="STRATEGY";s.strategy_ends_at=new Date(Date.now()+180000).toISOString();
  await pool.query("UPDATE games SET status='STRATEGY',strategy_ends_at=$1,pool_player_ids=$2,auction_order=$3,started_at=now() WHERE id=$4",[s.strategy_ends_at,s.pool,s.order,s.id]);
  for(const p of rows)await pool.query("INSERT INTO game_players(game_id,player_id,points_snapshot,reserve_price_snapshot_lakh) VALUES($1,$2,$3,$4)",[s.id,p.id,p.points,p.reserve_price_lakh]);
}
async function beginAuction(s){
  const pid=s.order[s.current_index];s.status="AUCTION";s.current_player_id=pid;s.current_bid_lakh=null;s.current_bidder_id=null;s.auction_ends_at=new Date(Date.now()+10000).toISOString();
  await pool.query("UPDATE games SET status='AUCTION',current_index=$1,current_player_id=$2,current_bid_lakh=NULL,current_bidder_id=NULL,auction_ends_at=$3 WHERE id=$4",[s.current_index,pid,s.auction_ends_at,s.id]);
}
async function placeBid(s,userId){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const gr=await client.query("SELECT * FROM games WHERE id=$1 FOR UPDATE",[s.id]);if(!gr.rows[0]||gr.rows[0].status!=="AUCTION")throw Error("AUCTION_NOT_ACTIVE");
    const pr=await client.query("SELECT * FROM players WHERE id=$1",[s.current_player_id]);const player=pr.rows[0];
    const u=s.participants[userId];if(!u)throw Error("NOT_IN_GAME");
    const next=s.current_bid_lakh==null?player.reserve_price_lakh:s.current_bid_lakh+incFor(s.current_bid_lakh);
    if(next>u.budgetLakh)throw Error("INSUFFICIENT_BUDGET");
    s.current_bid_lakh=next;s.current_bidder_id=userId;s.auction_ends_at=new Date(Date.now()+10000).toISOString();
    await client.query("UPDATE games SET current_bid_lakh=$1,current_bidder_id=$2,auction_ends_at=$3 WHERE id=$4",[next,userId,s.auction_ends_at,s.id]);
    await client.query("INSERT INTO auction_events(game_id,player_id,user_id,event_type,bid_amount_lakh) VALUES($1,$2,$3,'BID',$4)",[s.id,s.current_player_id,userId,next]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
}
async function settle(s){
  const pid=s.current_player_id;
  if(s.current_bidder_id){
    const w=s.current_bidder_id,price=s.current_bid_lakh;s.participants[w].budgetLakh-=price;s.participants[w].team.push(pid);
    await pool.query("UPDATE game_participants SET budget_lakh=$1 WHERE game_id=$2 AND user_id=$3",[s.participants[w].budgetLakh,s.id,w]);
    await pool.query("UPDATE game_players SET winner_user_id=$1,purchase_price_lakh=$2,result='SOLD' WHERE game_id=$3 AND player_id=$4",[w,price,s.id,pid]);
    await pool.query("INSERT INTO auction_events(game_id,player_id,user_id,event_type,bid_amount_lakh) VALUES($1,$2,$3,'SOLD',$4)",[s.id,pid,w,price]);
  }else{
    s.unsold.push(pid);await pool.query("UPDATE game_players SET result='UNSOLD' WHERE game_id=$1 AND player_id=$2",[s.id,pid]);
    await pool.query("INSERT INTO auction_events(game_id,player_id,event_type) VALUES($1,$2,'UNSOLD')",[s.id,pid]);
  }
  s.current_index++;
  if(s.current_index>=s.order.length){s.status="FINISHED";s.finished_at=new Date().toISOString();await pool.query("UPDATE games SET status='FINISHED',finished_at=now(),current_player_id=NULL WHERE id=$1",[s.id])}
  else await beginAuction(s);
}
async function finalResults(s){
  const gp=await pool.query(`SELECT gp.*,p.full_name,p.points FROM game_players gp JOIN players p ON p.id=gp.player_id WHERE gp.game_id=$1`,[s.id]);
  return Object.entries(s.participants).map(([uid,p])=>{
    const won=gp.rows.filter(x=>x.winner_user_id===uid);const points=won.reduce((a,x)=>a+x.points,0);const bonus=Math.floor(p.budgetLakh/10);
    return {userId:uid,slot:p.slot,won,playerPoints:points,budgetLakh:p.budgetLakh,budgetBonus:bonus,finalScore:points+bonus};
  });
}
module.exports={games,newRoom,joinRoom,getState,publicState,startGame,beginAuction,placeBid,settle,finalResults};
