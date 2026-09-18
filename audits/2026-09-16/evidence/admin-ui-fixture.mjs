// Isolated UI fixture. Binds loopback only; sends no messages and moves no money.
import http from 'node:http';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const date='2026-09-16T09:00:00Z';
let users=Array.from({length:61},(_,i)=>({id:id(i+10),role:i%2?'USHER':'CLIENT',phone:`+234800000${String(i).padStart(4,'0')}`,email:`sample${i}@example.invalid`,status:'ACTIVE'}));
let disputes=[{id:id(1),reason:'Attendance contested',status:'OPEN',booking:{id:id(3),event:{title:'Sample Lagos reception'},payment:{grossAmount:1000000}}}];
let approvals=[{id:id(2),kind:'REFUND',amountKobo:6000000,maker:{phone:'Sample administrator'},createdAt:date,payload:{bookingId:id(3),reason:'Client requested a refund after a cancelled event.'}}];
const booking={id:id(3),status:'DISPUTED',amount:1000000,attendanceMethod:'OTP',arrivalAssertedAt:null,checkedInAt:date,completedAt:null,event:{title:'Sample Lagos reception',venue:'Example Hall',eventDate:date,startTime:'14:00',endTime:'18:00',client:{user:{phone:'Sample client'}}},usher:{displayName:'Sample usher',user:{phone:'Sample contact'}},payment:{grossAmount:1000000,usherPayout:850000,platformFee:150000,escrowStatus:'FROZEN'},disputes:[{id:id(1),reason:'Attendance contested',note:'The client and usher disagree about the arrival time. This is sample evidence for layout testing.',status:'OPEN',resolution:null,createdAt:date,raisedBy:{phone:'Sample client'}}]};
const ledger=Array.from({length:60},(_,i)=>({id:id(i+100),entryType:i%2?'RELEASE':'HOLD',amount:i%2?-1000000:1000000,balanceAfter:i%2?0:1000000,createdAt:date,booking:{id:id(3),event:{title:'Sample Lagos reception'}}}));
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4174');res.setHeader('Access-Control-Allow-Headers','content-type,authorization,idempotency-key');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');if(req.method==='OPTIONS'){res.end();return;}
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};const u=new URL(req.url,'http://127.0.0.1:4199');const p=u.pathname;
 let out={};
 if(p==='/auth/otp/request')out={devCode:'123456'};
 else if(p==='/auth/otp/verify'||p==='/auth/refresh'){if(body.code&&body.code!=='123456'){res.statusCode=400;out={error:{code:'INVALID_OTP',message:'That code is incorrect. Try again.'}};}else out={accessToken:'local-fixture-only',refreshToken:'local-fixture-only',user:{role:'ADMIN'}};}
 else if(p==='/api/me')out={role:'ADMIN'};
 else if(p==='/api/admin/stats')out={pendingVerifications:1,openDisputes:disputes.length,pendingApprovals:approvals.length,users:61,escrowHeldKobo:25000000,approvalThresholdKobo:5000000};
 else if(p.includes('/bookings/'))out=booking;
 else if(p==='/api/admin/disputes')out=disputes;
 else if(p.endsWith('/resolve')){disputes=[];out={executed:true};}
 else if(p==='/api/admin/approvals')out=approvals;
 else if(p.startsWith('/api/admin/approvals/')){approvals=[];out={ok:true};}
 else if(p==='/api/admin/verifications')out=[{id:id(4),createdAt:date,idDocumentUrl:null,selfieUrl:null,usher:{user:{phone:'Sample incomplete submission',email:null}}}];
 else if(p==='/api/admin/users'||p==='/api/admin/ledger'){
   let rows=p.endsWith('users')?users:ledger;const q=u.searchParams.get('query');const role=u.searchParams.get('role');if(q)rows=rows.filter(r=>r.phone?.includes(q)||r.email?.includes(q));if(role)rows=rows.filter(r=>r.role===role);const start=u.searchParams.get('cursor')?rows.findIndex(r=>r.id===u.searchParams.get('cursor'))+1:0;const limit=Number(u.searchParams.get('limit')||50);const items=rows.slice(start,start+limit);out={items,nextCursor:rows.length>start+limit?items.at(-1).id:null};
 }else if(p.startsWith('/api/admin/users/')){const uid=p.split('/')[4];users=users.map(user=>user.id===uid?{...user,status:p.endsWith('suspend')?'SUSPENDED':'ACTIVE'}:user);out={ok:true};}
 else if(p!=='/auth/logout'){res.statusCode=404;out={error:{message:'Fixture route not implemented'}};}
 res.end(JSON.stringify(out));
}).listen(4199,'127.0.0.1',()=>console.log('Isolated sample-data API ready on 4199'));
