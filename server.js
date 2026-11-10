'use strict';
// BLACK BOX – AI MANAGER CHALLENGE · one backend, one database, two front-ends (/ and /admin)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(__dirname,'data'),FILE=path.join(DIR,'db.json');
const PW=process.env.ADMIN_PASSWORD||'',SECRET=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
const KEY=process.env.ANTHROPIC_API_KEY,MODEL=process.env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
if(PW.length<8){console.error('Set ADMIN_PASSWORD (at least 8 characters).');process.exit(1)}
const BUDGET=100,HIDDEN=['Critical Thinking','Problem-Solving','Emotional Intelligence'];
const SKILLS=[
['critical','Critical Thinking','Questions assumptions, tests evidence and separates symptoms from causes.',18],
['problem','Problem-Solving','Breaks complex situations into parts and builds workable fixes.',16],
['emotional','Emotional Intelligence','Reads emotions, builds trust and defuses conflict with empathy.',15],
['leadership','Leadership','Sets direction, earns followers and drives decisive action.',22],
['communication','Communication','Delivers clear, honest messages to every audience.',14],
['strategic','Strategic Planning','Aligns scarce resources with long-term goals.',20],
['creativity','Creativity','Finds unconventional, low-cost ways forward.',12],
['adaptability','Adaptability','Changes course quickly as the facts shift.',13],
['teamwork','Teamwork','Unites people around shared goals and shared credit.',11],
['time','Time Management','Prioritises ruthlessly and protects critical deadlines.',9],
['risk','Risk Management','Anticipates what can go wrong and prepares fallbacks.',17],
['confidence','Confidence','Stays calm and credible when pressure is highest.',8]
].map(([id,name,desc,price])=>({id,name,desc,price}));
const CRISIS={title:'COMPANY CRISIS',facts:[
'18 experienced employees are threatening to resign following a serious conflict with management.',
"The company's biggest client may cancel a major contract within 24 hours because deliveries are at risk.",
'The company has very limited cash and cannot afford mass recruitment or large bonuses.'],
mission:'Find a solution that protects the employees, the client and the company.'};
const CTEXT=CRISIS.facts.join(' ')+' '+CRISIS.mission;
const SECK=['analysis','rootProblem','employeeStrategy','clientStrategy','solution','risks','plan','decision'];
const SCK=['critical','employees','client','feasibility','leadership'];

// ---- shared database (single JSON file, atomic writes; all reads/writes go through this process) ----
fs.mkdirSync(DIR,{recursive:true});
let db={teams:{}};try{db=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch{}
const save=()=>{fs.writeFileSync(FILE+'.tmp',JSON.stringify(db));fs.renameSync(FILE+'.tmp',FILE)};
const teams=()=>Object.values(db.teams);
const levelOf=n=>n>=90?'Visionary Executive':n>=75?'Strategic Leader':n>=60?'Capable Manager':n>=40?'Developing Manager':'Crisis Casualty';
const busy=t=>t.deciding&&Date.now()-t.deciding<12e4;
const secret=t=>{const o=t.skills.filter(s=>HIDDEN.includes(s));return{skills:HIDDEN,owned:o,passed:o.length>0}};
// What a participant may see. Crisis only after the box is opened; score + secret skills only after completion.
const view=t=>{const v={name:t.name,status:t.status,skills:t.skills,spent:t.spent,remaining:BUDGET-t.spent};
 if(t.status==='OPENED'){v.crisis=CRISIS;v.busy=!!busy(t)}
 if(t.status==='COMPLETED')Object.assign(v,{crisis:CRISIS,report:t.report,score:t.score,total:t.total,level:t.level,verdict:t.verdict,engine:t.engine,submittedAt:t.submittedAt,secret:secret(t)});
 return v};

// ---- AI decision: manager call + independent judge call; offline engine only if no key / API failure ----
async function ask(system,user){
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:AbortSignal.timeout(70000),headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:2000,system,messages:[{role:'user',content:user}]})});
 if(!r.ok)throw new Error('API '+r.status);
 const j=await r.json(),t=j.content.map(c=>c.text||'').join('');
 return JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1));
}
function offline(sk){
 const h=n=>sk.includes(n),P=(b,...c)=>[b,...c.filter(x=>h(x[0])).map(x=>x[1])].join(' ');
 const report={
 analysis:P('The company faces two simultaneous threats: a possible exodus of 18 experienced people and the loss of its biggest client within 24 hours, with almost no cash to absorb either shock.',['Critical Thinking','The two threats are linked: the conflict is draining the very people who deliver to the client, so they are treated as one system, not two emergencies.'],['Strategic Planning','Both threats are weighed against cash runway and contract value to decide what to protect first.']),
 rootProblem:P('The visible problem is resignations; the likely cause is a breakdown of trust after the conflict with management.',['Critical Thinking','The conflict is a symptom of unclear decision rights and unheard grievances, which also explains the delivery slippage.'],['Problem-Solving','Delivery risk is traced to the specific workstreams that depend on the employees threatening to leave.']),
 employeeStrategy:P('Management meets the employees quickly, apologises and promises to review the conflict.',['Emotional Intelligence','Leaders listen first in small private sessions, acknowledge the emotional impact and agree visible non-monetary commitments: flexibility, recognition and a real voice in fixing the process.'],['Teamwork','A joint task force of staff and managers co-owns the recovery plan.'],['Communication','Every commitment is confirmed in writing within hours.']),
 clientStrategy:P('The client is told that deliveries are at risk and asked for patience.',['Communication','A senior call within the hour gives an honest status, a dated recovery plan and one named contact.'],['Time Management','Deliveries are re-sequenced so the most critical items ship first, inside the 24-hour window.'],['Problem-Solving','Partial shipments and temporary help from other teams protect the contract.']),
 solution:P('Stabilise the people, then the delivery, using existing resources only.',['Creativity','Low-cost incentives replace bonuses: project choice, flexible schedules, learning days and public recognition.'],['Adaptability','The plan is reviewed every 12 hours and adjusted as the client and team respond.']),
 risks:P('Employees may still leave and the client may still cancel.',['Risk Management','Fallbacks are prepared: cross-trained backups for key roles, a partial-delivery arrangement with the client and a daily cash-limit check.']),
 plan:P('1. Hours 0-2: meet employee representatives. 2. Hours 2-4: call the client. 3. Day 1: publish the recovery plan. 4. Week 1: review progress.',['Time Management','Each step has an owner, a deadline and a checkpoint every 12 hours.']),
 decision:P('The manager addresses employees and client in parallel without large spending.',['Leadership','The manager personally leads both conversations, takes responsibility for the conflict and commits the company to the recovery plan.'],['Confidence','The message is delivered calmly and credibly, which steadies both audiences.'])};
 const W={critical:{'Critical Thinking':7,'Problem-Solving':4,'Strategic Planning':3,'Risk Management':2},employees:{'Emotional Intelligence':7,'Communication':3,'Teamwork':3,'Leadership':2},client:{'Communication':4,'Time Management':4,'Problem-Solving':3,'Adaptability':2,'Confidence':2},feasibility:{'Risk Management':4,'Time Management':3,'Strategic Planning':3,'Creativity':3,'Adaptability':2},leadership:{'Leadership':7,'Confidence':3,'Communication':3,'Teamwork':2}};
 const score={};for(const k in W)score[k]=Math.min(20,5+Object.entries(W[k]).reduce((a,[n,v])=>a+(h(n)?v:0),0));
 return{report,score,verdict:'Scored by the built-in offline engine (no AI available): the result reflects how the purchased skills shaped the decision.'};
}
const clamp=n=>Math.max(0,Math.min(20,Math.round(+n)||0));
async function run(t){
 let o;
 try{
  if(!KEY)throw new Error('no ANTHROPIC_API_KEY');
  const rep=await ask(`You are the AI Manager in a corporate simulation. You own ONLY these skills: ${t.skills.join(', ')}. Skills you do not own are genuine blind spots: do not use their techniques, and let the depth, empathy, rigor, risk-awareness and realism of your reasoning honestly reflect what a manager with exactly this skill set would produce. Never mention being an AI. Reply with ONLY a JSON object.`,
  `CRISIS: ${CTEXT}\nReturn JSON with string fields: analysis, rootProblem, employeeStrategy, clientStrategy, solution, risks, plan, decision. Each is 2-5 sentences; plan is 4-6 numbered steps separated by \\n. Constraints: no large bonuses, no mass recruitment, 24-hour client deadline.`);
  const j=await ask('You are a strict, impartial management professor. Grade only the quality of the report text, never the list of skills. Reply with ONLY a JSON object.',
  `CRISIS: ${CTEXT}\nREPORT: ${JSON.stringify(rep)}\nScore each criterion as an integer 0-20 (use the full range; 17+ only for specific, realistic, excellent work): critical (critical analysis and root-cause depth), employees (employee management), client (client protection), feasibility (feasibility with very limited cash), leadership (leadership and implementation). Return {"critical":n,"employees":n,"client":n,"feasibility":n,"leadership":n,"verdict":"two sentences"}`);
  o={report:rep,score:j,verdict:String(j.verdict||''),engine:'Claude AI ('+MODEL+')'};
 }catch(e){console.error('AI unavailable, offline engine used:',e.message);o={...offline(t.skills),engine:'Offline engine'}}
 const report={};SECK.forEach(k=>report[k]=String(o.report[k]||'—').slice(0,2500));
 const score={};SCK.forEach(k=>score[k]=clamp(o.score[k]));
 const total=SCK.reduce((a,k)=>a+score[k],0);
 Object.assign(t,{report,score,total,level:levelOf(total),verdict:o.verdict.slice(0,600),engine:o.engine,status:'COMPLETED',submittedAt:Date.now()});
 delete t.deciding;save();
}

// ---- admin session (HMAC-signed, HttpOnly cookie) ----
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest('hex');
const mk=()=>{const b=(Date.now()+8*36e5)+'.'+crypto.randomBytes(8).toString('hex');return b+'.'+sign(b)};
const authed=req=>{const c=((req.headers.cookie||'').split(/;\s*/).find(x=>x.startsWith('bbadmin='))||'').slice(8),p=c.split('.');
 if(p.length!==3||+p[0]<Date.now())return false;const a=Buffer.from(sign(p[0]+'.'+p[1])),b=Buffer.from(p[2]);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const fails=new Map();
const csv=v=>{v=String(v??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return'"'+v.replace(/"/g,'""')+'"'};
const ranked=()=>{const T=teams().map(({token,key,deciding,...t})=>t);return[...T.filter(t=>t.status==='COMPLETED').sort((a,b)=>b.total-a.total||a.submittedAt-b.submittedAt),...T.filter(t=>t.status!=='COMPLETED').sort((a,b)=>a.createdAt-b.createdAt)]};

const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const send=(res,code,body,type='application/json',h={})=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...h});res.end(Buffer.isBuffer(body)||typeof body==='string'?body:JSON.stringify(body))};
const body=req=>new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e4){no(0);req.destroy()}});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch{no(0)}})});
const page=n=>{const a=path.join(__dirname,n);return fs.readFileSync(fs.existsSync(a)?a:path.join(__dirname,'public',n))};
const me=req=>{const k=req.headers['x-token'];return k?teams().find(t=>t.token===k):null};

http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://x').pathname,m=req.method;
  if(m==='GET'&&(u==='/'||u==='/admin'))return send(res,200,page(u==='/'?'index.html':'admin.html'),'text/html; charset=utf-8',{'Content-Security-Policy':CSP});
  if(m==='GET'&&u==='/healthz')return send(res,200,'ok','text/plain');
  if(m==='GET'&&u==='/api/skills')return send(res,200,{skills:SKILLS,budget:BUDGET});
  if(m==='POST'&&!(req.headers['content-type']||'').includes('application/json'))return send(res,415,{error:'JSON required'});
  // ----- admin -----
  if(u==='/api/admin/login'&&m==='POST'){
   const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').pop().trim(),f=fails.get(ip)||{n:0,t:0};
   if(Date.now()-f.t>6e5)f.n=0;
   if(f.n>=5)return send(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
   const b=await body(req),h=x=>crypto.createHash('sha256').update(String(x)).digest();
   if(!crypto.timingSafeEqual(h(b.password||''),h(PW))){f.n++;f.t=Date.now();fails.set(ip,f);await new Promise(r=>setTimeout(r,500));return send(res,401,{error:'Access denied.'})}
   fails.delete(ip);
   return send(res,200,{ok:true},'application/json',{'Set-Cookie':'bbadmin='+mk()+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(req.headers['x-forwarded-proto']==='https'?'; Secure':'')});
  }
  if(u.startsWith('/api/admin/')){
   if(!authed(req))return send(res,401,{error:'Unauthorized'});
   if(u==='/api/admin/data')return send(res,200,{secret:HIDDEN,teams:ranked()});
   if(u==='/api/admin/logout')return send(res,200,{ok:true},'application/json',{'Set-Cookie':'bbadmin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   if(u==='/api/admin/remove'&&m==='POST'){const b=await body(req);delete db.teams[b.id];save();return send(res,200,{ok:true})}
   if(u==='/api/admin/export.csv'){
    const rows=[['Rank','Team','Score','Level','Status','Skills','Credits spent','Credits left','Secret skills owned','Submitted (UTC)','Engine']];
    let i=0;ranked().forEach(t=>rows.push([t.status==='COMPLETED'?++i:'',t.name,t.total??'',t.level||'',t.status,t.skills.join('; '),t.spent,BUDGET-t.spent,t.skills.filter(s=>HIDDEN.includes(s)).length,t.submittedAt?new Date(t.submittedAt).toISOString():'',t.engine||'']));
    return send(res,200,rows.map(r=>r.map(csv).join(',')).join('\r\n'),'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="black-box-results.csv"'});
   }
   return send(res,404,{error:'Not found'});
  }
  // ----- teams -----
  if(u==='/api/register'&&m==='POST'){
   const b=await body(req),name=String(b.team||'').trim().replace(/\s+/g,' ');
   if(!/^[\p{L}\p{N} _.'&!-]{2,30}$/u.test(name))return send(res,400,{error:"Team name must be 2-30 characters: letters, numbers, spaces and - _ . ' & !"});
   const key=name.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
   if(key.length<2)return send(res,400,{error:'Please choose a more distinctive team name.'});
   if(teams().some(t=>t.key===key))return send(res,409,{error:'This team name is already registered. Each team can play only once.'});
   const t={id:crypto.randomBytes(6).toString('hex'),name,key,token:crypto.randomBytes(24).toString('hex'),status:'BUILDING',skills:[],spent:0,createdAt:Date.now()};
   db.teams[t.id]=t;save();return send(res,200,{token:t.token,state:view(t)});
  }
  const t=me(req);
  if(u.startsWith('/api/')&&!t)return send(res,401,{error:'Unknown session'});
  if(u==='/api/state')return send(res,200,view(t));
  if(u==='/api/lock'&&m==='POST'){
   if(t.status!=='BUILDING')return send(res,409,{error:'Your manager is already locked.'});
   const b=await body(req),ids=[...new Set(Array.isArray(b.skills)?b.skills:[])],ch=ids.map(i=>SKILLS.find(s=>s.id===i));
   if(!ch.length||ch.some(s=>!s))return send(res,400,{error:'Choose at least one valid skill.'});
   const sum=ch.reduce((a,s)=>a+s.price,0);if(sum>BUDGET)return send(res,400,{error:'Budget exceeded.'});
   Object.assign(t,{skills:ch.map(s=>s.name),spent:sum,status:'LOCKED',lockedAt:Date.now()});save();return send(res,200,view(t));
  }
  if(u==='/api/open'&&m==='POST'){
   if(t.status==='BUILDING')return send(res,409,{error:'Lock your manager first.'});
   if(t.status==='LOCKED'){t.status='OPENED';t.openedAt=Date.now();save()}
   return send(res,200,view(t));
  }
  if(u==='/api/decide'&&m==='POST'){
   if(t.status==='COMPLETED')return send(res,200,view(t));
   if(t.status!=='OPENED')return send(res,409,{error:'Open the Black Box first.'});
   if(!busy(t)){t.deciding=Date.now();save();run(t).catch(e=>console.error(e))}
   return send(res,202,{busy:true});
  }
  return send(res,404,{error:'Not found'});
 }catch(e){send(res,e===0?400:500,{error:e===0?'Bad request':'Server error'});if(e!==0)console.error(e)}
}).listen(PORT,()=>console.log('BLACK BOX ready on port '+PORT+(KEY?' · AI enabled ('+MODEL+')':' · NO ANTHROPIC_API_KEY: offline engine')));
