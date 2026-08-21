
const jwt=require("jsonwebtoken");
const bcrypt=require("bcryptjs");
const pool=require("./db");

function sign(user){return jwt.sign({id:user.id,email:user.email,isAdmin:user.is_admin},process.env.JWT_SECRET,{expiresIn:"7d"});}
function auth(req,res,next){
  try{
    const h=req.headers.authorization||"";
    if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Authentication required"});
    req.user=jwt.verify(h.slice(7),process.env.JWT_SECRET); next();
  }catch(e){return res.status(401).json({error:"Invalid or expired session"});}
}
function admin(req,res,next){ if(!req.user?.isAdmin) return res.status(403).json({error:"Admin access required"}); next(); }

async function register(req,res){
  const {email,password,displayName}=req.body||{};
  if(!email||!password||!displayName||password.length<6) return res.status(400).json({error:"Email, display name and 6+ character password required"});
  const hash=await bcrypt.hash(password,12);
  try{
    const {rows} = await pool.query("INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id,email,display_name,is_admin",[email.toLowerCase(),hash,displayName.trim()]);
    res.json({token:sign(rows[0]),user:rows[0]});
  }catch(e){res.status(409).json({error:"Email already registered"});}
}
async function login(req,res){
  const {email,password}=req.body||{};
  const {rows}=await pool.query("SELECT * FROM users WHERE email=$1",[String(email||"").toLowerCase()]);
  if(!rows[0]||!(await bcrypt.compare(password||"",rows[0].password_hash))) return res.status(401).json({error:"Invalid email or password"});
  res.json({token:sign(rows[0]),user:{id:rows[0].id,email:rows[0].email,display_name:rows[0].display_name,is_admin:rows[0].is_admin}});
}
module.exports={auth,admin,register,login};
