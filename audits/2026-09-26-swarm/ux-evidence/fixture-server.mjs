import http from 'node:http';
import fs from 'node:fs';
const root = new URL('.', import.meta.url);
const modeFile = new URL('mode.txt', root);
const logFile = new URL('requests.ndjson', root);
const mode=()=>{try{return fs.readFileSync(modeFile,'utf8').trim()}catch{return 'normal'}};
const dispute={id:'test-dispute',reason:'ATTENDANCE',status:'OPEN',booking:{id:'test-booking',event:{title:'Test event — Lagos team'},payment:{grossAmount:1000000}}};
const review={id:'test-booking',status:'DISPUTED',amount:1000000,attendanceMethod:null,arrivalAssertedAt:null,checkedInAt:null,completedAt:null,event:{title:'Test event — Lagos team',venue:'Test venue',eventDate:'2026-09-27T10:00:00Z',startTime:'10:00',endTime:'16:00',client:{user:{phone:'TEST CLIENT'}}},usher:{displayName:'Test Usher',user:{phone:'TEST USHER'}},payment:{grossAmount:1000000,usherPayout:850000,platformFee:150000,escrowStatus:'FROZEN'},messages:[],disputes:[{id:'test-dispute',reason:'ATTENDANCE',note:'Synthetic evidence for local testing only.',status:'OPEN',resolution:null,createdAt:'2026-09-26T09:00:00Z',raisedBy:{phone:'TEST CLIENT'}}]};
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5179');res.setHeader('Access-Control-Allow-Headers','content-type,authorization,idempotency-key');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};
 fs.appendFileSync(logFile,JSON.stringify({at:new Date().toISOString(),method:req.method,path:req.url,mode:mode(),...(body.resolution?{resolution:body.resolution}: {})})+'\n');
 const reply=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
 if(mode()==='hang'&&req.url==='/auth/admin/otp/request')return;
 if(mode()==='hang-verify'&&req.url==='/auth/admin/otp/verify')return;
 if(mode()==='restore-fail'&&req.url==='/api/me')return reply(503,{error:{code:'UNAVAILABLE',message:'Synthetic connection failure'}});
 if(req.url==='/auth/admin/otp/request')return reply(200,{sent:true});
 if(req.url==='/auth/admin/otp/verify')return body.code==='123456'?reply(200,{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',user:{role:'ADMIN'}}):reply(401,{error:{code:'OTP_INVALID',message:'The sign-in code is incorrect or expired.'}});
 if(req.url==='/api/me')return reply(200,{role:'ADMIN'});
 if(req.url==='/auth/logout')return reply(200,{ok:true});
 if(req.url==='/api/admin/stats')return reply(200,{pendingVerifications:0,openDisputes:1,pendingApprovals:0,users:2,escrowHeldKobo:1000000,approvalThresholdKobo:5000000});
 if(req.url==='/api/admin/disputes')return reply(200,[dispute]);
 if(req.url==='/api/admin/bookings/test-booking/review')return reply(200,review);
 if(req.url==='/api/admin/disputes/test-dispute/resolve')return reply(503,{error:{code:'UNAVAILABLE',message:'Synthetic mutation uncertainty'}});
 reply(404,{error:{code:'NOT_FOUND',message:'Fixture route unavailable'}});
}).listen(4319,'127.0.0.1',()=>console.log('Local-only disposable API fixture at :4319; no external dependencies'));
