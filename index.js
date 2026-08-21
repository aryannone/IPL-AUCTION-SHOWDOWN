
require("dotenv").config();
const express=require("express"),http=require("http"),cors=require("cors"),jwt=require("jsonwebtoken");
const {Server}=require("socket.io");const pool=require("./db");const {auth,admin,register,login}=require("./auth");const game=require("./game");
const app=express();app.use(cors({origin:process.env.CLIENT_URL||"http://localhost:5173"}));app.use(express.json());
app.get("/health",(q,r)=>r.json({ok:true}));app.post("/api/auth/register",register);app.post("/api/auth/login",login);
app.get("/api/players",auth,async(q,r)=>r.json((await pool.query("SELECT * FROM players WHERE is_active=true ORDER BY sr_no")).rows));
app.patch("/api/admin/players/:id",auth,admin,async(q,r)=>{
 const allowed=["full_name","country","specialism","status","reserve_price_lakh","points","is_active"];const ks=Object.keys(q.body||{}).filter(k=>allowed.includes(k));if(!ks.length)return r.status(400).json({error:"No editable fields"});
 const vals=ks.map(k=>q.body[k]);vals.push(q.params.id);const set=ks.map((k,i)=>`${k}=$${i+1}`).join(",");
 const x=await pool.query(`UPDATE players SET ${set},updated_at=now() WHERE id=$${vals.length} RETURNING *`,vals);if(!x.rows[0])return r.status(404).json({error:"Player not found"});r.json(x.rows[0]);
});
const server=http.createServer(app),io=new Server(server,{cors:{origin:process.env.CLIENT_URL||"http://localhost:5173"}});
io.use((s,n)=>{try{s.user=jwt.verify(s.handshake.auth?.token,process.env.JWT_SECRET);n()}catch(e){n(new Error("UNAUTHORIZED"))}});
async function emitState(id){const s=await game.getState(id);if(s)io.to(id).emit("state",await game.publicState(s));}
io.on("connection",s=>{
 s.on("create_room",async(_,cb)=>{try{const g=await game.newRoom(s.user.id);s.join(g.id);cb({ok:true,state:await game.publicState(g)})}catch(e){cb({ok:false,error:e.message})}});
 s.on("join_room",async({roomCode},cb)=>{try{const g=await game.joinRoom(s.user.id,roomCode);s.join(g.id);cb({ok:true,state:await game.publicState(g)});emitState(g.id)}catch(e){cb({ok:false,error:e.message})}});
 s.on("ready",async({gameId},cb)=>{try{const g=await game.getState(gameId);g.participants[s.user.id].ready=true;g.participants[s.user.id].connected=true;g.participants[s.user.id].lastSeen=Date.now();await pool.query("UPDATE game_participants SET ready=true,connected=true WHERE game_id=$1 AND user_id=$2",[gameId,s.user.id]);if(Object.values(g.participants).length===2&&Object.values(g.participants).every(x=>x.ready)){await game.startGame(g);setTimeout(async()=>{const x=await game.getState(gameId);if(x?.status==="STRATEGY"){await game.beginAuction(x);emitState(gameId)}},180000)}await emitState(gameId);cb({ok:true})}catch(e){cb({ok:false,error:e.message})}});
 s.on("place_bid",async({gameId},cb)=>{try{const g=await game.getState(gameId);await game.placeBid(g,s.user.id);await emitState(gameId);cb({ok:true})}catch(e){cb({ok:false,error:e.message})}});
 s.on("reconnect_game",async({gameId},cb)=>{try{const g=await game.getState(gameId);if(!g)throw Error("GAME_NOT_FOUND");g.participants[s.user.id].connected=true;g.participants[s.user.id].lastSeen=Date.now();await pool.query("UPDATE game_participants SET connected=true WHERE game_id=$1 AND user_id=$2",[gameId,s.user.id]);s.join(gameId);await emitState(gameId);cb({ok:true})}catch(e){cb({ok:false,error:e.message})}});
 s.on("disconnect",async()=>{for(const [id,g] of game.games){if(g.participants[s.user.id]){g.participants[s.user.id].connected=false;g.participants[s.user.id].lastSeen=Date.now();await pool.query("UPDATE game_participants SET connected=false WHERE game_id=$1 AND user_id=$2",[id,s.user.id]).catch(()=>{});io.to(id).emit("presence",{userId:s.user.id,connected:false,deadline:Date.now()+120000})}}});
});
setInterval(async()=>{
 for(const [id,g] of game.games){
  if(g.status==="AUCTION"&&g.auction_ends_at&&Date.now()>=new Date(g.auction_ends_at).getTime()){await game.settle(g);await emitState(id)}
  for(const [uid,p] of Object.entries(g.participants||{})){
   if(!p.connected&&g.status!=="FINISHED"&&Date.now()-p.lastSeen>120000){g.status="FINISHED";await pool.query("UPDATE games SET status='FINISHED',finished_at=now() WHERE id=$1",[id]);io.to(id).emit("forfeit",{winnerUserId:Object.keys(g.participants).find(x=>x!==uid),loserUserId:uid});await emitState(id)}
  }
 }
},250);
server.listen(process.env.PORT||4000,()=>console.log("PARADOX server running"));
