export const common = /* wgsl */ `
struct Params { meta: vec4u, p: array<vec4f,8>, world: vec4f }
@group(0) @binding(0) var<uniform> U: Params;
fn s(i:u32)->f32{return U.p[i/4u][i%4u];}
fn sat(x:f32)->f32{return clamp(x,0.0,1.0);}
fn ss(a:f32,b:f32,x:f32)->f32{let t=sat((x-a)/max(0.00000001,b-a));return t*t*(3.0-2.0*t);}
fn hash2(p:vec2i,seed:u32)->f32{var h=bitcast<u32>(p.x)*374761393u+bitcast<u32>(p.y)*668265263u+seed*1442695041u;h=(h^(h>>13u))*1274126177u;return f32(h^(h>>16u))/4294967295.0;}
fn noise(p:vec2f,seed:u32)->f32{let cell=vec2i(floor(p));let f=fract(p);let t=f*f*(3.0-2.0*f);return mix(mix(hash2(cell,seed),hash2(cell+vec2i(1,0),seed),t.x),mix(hash2(cell+vec2i(0,1),seed),hash2(cell+vec2i(1,1),seed),t.x),t.y);}
fn fbm(pos:vec2f,seed:u32,octaves:u32,roughness:f32,mode:u32)->f32{var p=pos;var sum=0.0;var amp=1.0;var total=0.0;for(var i=0u;i<octaves;i++){var v=noise(p,seed+i*101u);if(mode==1u){v=1.0-abs(v*2.0-1.0);}if(mode==2u){v=abs(v*2.0-1.0);}sum+=v*amp;total+=amp;p=p*2.03+vec2f(7.13,3.71);amp*=roughness;}return sum/max(total,0.00000001);}
fn cells(p:vec2f,seed:u32)->vec2f{var f1=10.0;var f2=10.0;let c=vec2i(floor(p));for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){let g=c+vec2i(i,j);let d=length(vec2f(g)+vec2f(hash2(g,seed),hash2(g,seed+31u))-p);if(d<f1){f2=f1;f1=d;}else if(d<f2){f2=d;}}}return vec2f(f1,f2);}
fn at(p:vec2i)->u32{let c=clamp(p,vec2i(0),vec2i(i32(U.meta.x)-1));return u32(c.y)*U.meta.x+u32(c.x);}
const DIR=array<vec2i,4>(vec2i(-1,0),vec2i(1,0),vec2i(0,-1),vec2i(0,1));
const OPP=array<u32,4>(1u,0u,3u,2u);
fn inside(p:vec2i)->bool{return all(p>=vec2i(0))&&all(p<vec2i(i32(U.meta.x)));}
`;
export const general = common + /* wgsl */ `
@group(0) @binding(1) var<storage,read> A:array<f32>;
@group(0) @binding(2) var<storage,read> B:array<f32>;
@group(0) @binding(3) var<storage,read> M:array<f32>;
@group(0) @binding(4) var<storage,read_write> O:array<f32>;
@group(0) @binding(5) var<storage,read_write> C:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> Aux:array<f32>;
fn sa(pos:vec2f)->f32{let p=clamp(pos,vec2f(0),vec2f(f32(U.meta.x-1u)));let i=vec2i(floor(p));let t=fract(p);return mix(mix(A[at(i)],A[at(i+vec2i(1,0))],t.x),mix(A[at(i+vec2i(0,1))],A[at(i+vec2i(1,1))],t.x),t.y);}
fn sb(pos:vec2f)->f32{let p=clamp(pos,vec2f(0),vec2f(f32(U.meta.x-1u)));let i=vec2i(floor(p));let t=fract(p);return mix(mix(B[at(i)],B[at(i+vec2i(1,0))],t.x),mix(B[at(i+vec2i(0,1))],B[at(i+vec2i(1,1))],t.x),t.y);}
fn grad(p:vec2i)->vec2f{return vec2f(A[at(p+vec2i(1,0))]-A[at(p-vec2i(1,0))],A[at(p+vec2i(0,1))]-A[at(p-vec2i(0,1))])*f32(U.meta.x-1u)*0.5;}
fn palette(pal:u32,idx:u32)->vec3f{
 let a=array<vec3f,20>(vec3f(.09,.14,.10),vec3f(.24,.29,.16),vec3f(.35,.34,.30),vec3f(.87,.91,.92),
 vec3f(.20,.10,.055),vec3f(.46,.25,.12),vec3f(.72,.51,.28),vec3f(.91,.76,.51),
 vec3f(.065,.065,.075),vec3f(.17,.15,.16),vec3f(.32,.30,.31),vec3f(.71,.70,.71),
 vec3f(.055,.16,.12),vec3f(.14,.28,.14),vec3f(.41,.45,.30),vec3f(.83,.81,.66),
 vec3f(.11,.20,.25),vec3f(.25,.34,.39),vec3f(.55,.65,.69),vec3f(.90,.95,.98));return a[min(pal,4u)*4u+min(idx,3u)];}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid:vec3u){
 let n=U.meta.x;if(gid.x>=n||gid.y>=n){return;}let i=gid.y*n+gid.x;let ip=vec2i(gid.xy);let uv=vec2f(gid.xy)/f32(n-1u);let pos=uv*2.0-1.0;let a=A[i];let b=B[i];var m=1.0;if((U.meta.w&1u)!=0u){m=sat(M[i]);}let op=U.meta.y;let ratio=U.world.x/U.world.y;var value=a;
 if(op<=9u){
 let seed=u32(s(0u));let warp=s(4u);let w=vec2f(noise(uv*3.0+vec2f(5,1),seed+500u),noise(uv*3.0+vec2f(2,9),seed+600u))-0.5;let q=uv*s(1u)+w*warp;
 let f=fbm(q,seed,u32(s(2u)),s(3u),0u);let r=fbm(q,seed,u32(s(2u)),s(3u),1u);let rad=length(pos);let amp=s(5u);
 switch op {
 case 1u:{value=(.055+(1.0-ss(.02,1.3,length(pos*vec2f(.85,.94))))*(.10+pow(r,1.65)*1.10))*amp;}
 case 2u:{value=fbm(q,seed,u32(s(2u)),s(3u),u32(s(6u)))*amp;}
 case 3u:{value=pow(max(0.0,1.0-pow(rad/s(6u),s(7u))),1.15)*(.16+pow(r,1.6)*.94)*amp;}
 case 4u:{let rr=rad+(f-.5)*.045;let cone=pow(max(0.0,1.0-rr/1.12),1.3);let bowl=1.0-ss(s(6u)*.3,s(6u),rr);let dd=(rr-s(6u))/(.15/s(7u));value=(cone*(.83+r*.23)-bowl*.62+exp(-dd*dd)*.075)*amp;}
 case 5u:{let angle=radians(s(6u));let d=dot(uv,vec2f(cos(angle),sin(angle)));value=(.12+pow(.5+.5*sin(d*s(1u)*12.0+f*3.0),s(7u))*.55+(r-.5)*.045)*amp;}
 case 6u:{let center=sin(pos.x*3.4+f*1.1)*.26+(f-.5)*.16;let channel=1.0-ss(s(6u)*.25,s(6u),abs(pos.y-center));value=(.70+f*.17-channel*s(7u)*.7+(r-.5)*.08)*amp;}
 case 7u:{let d=rad/s(6u);let bowl=1.0-ss(.3,.95,d);let z=(d-1.0)/.14;value=(.34+f*.10-bowl*.30+exp(-z*z)*s(7u))*amp;}
 case 8u:{let c=cells(q,seed);value=sat(select(c.x,c.y-c.x,u32(s(6u))==1u))*amp;}
 case 9u:{let angle=radians(s(6u));let d=(dot(pos,vec2f(cos(angle),sin(angle)))+(f-.5)*.45)/s(7u);value=(.06+exp(-d*d)*(.15+pow(r,1.5)*.82))*amp;}
 default:{}
 }
 }else{
 switch op{
 case 10u:{let angle=radians(s(0u));var d=.5+dot(pos,vec2f(cos(angle),sin(angle)))*.5;if(s(3u)==1.0){d=1.0-length(pos);}if(s(3u)==2.0){d=1.0-max(abs(pos.x),abs(pos.y));}value=sat(d*s(2u)+s(1u));}
 case 11u:{value=s(0u);}
 case 12u:{let sl=length(grad(ip))/ratio;let amount=ss(s(0u)-s(3u),s(0u)+s(3u),a)*(1.0-ss(.1,s(2u),sl))*s(1u)*m;value=a+amount;Aux[i]=amount;}
 case 13u:{let mode=u32(s(0u));var z=mix(a,b,s(1u));switch mode{case 1u:{z=a+b;}case 2u:{z=a*b;}case 3u:{z=max(a,b);}case 4u:{z=min(a,b);}case 5u:{z=a-b;}case 6u:{z=1.0-(1.0-a)*(1.0-b);}case 7u:{z=abs(a-b);}default:{}}value=select(mix(a,z,s(1u)),z,mode==0u);}
 case 14u:{var d=vec2f(noise(uv*s(1u),u32(s(2u))),noise(uv*s(1u)+vec2f(23,17),u32(s(2u))+9u))-.5;if((U.meta.w&2u)!=0u){d=vec2f(b,sb(vec2f(gid.yx)))-.5;}value=sa(vec2f(gid.xy)+d*s(0u)*f32(n));}
 case 15u:{let t=a*s(0u)+s(2u);value=(floor(t)+ss(.5-s(1u)*.5,.5+s(1u)*.5,fract(t))-s(2u))/s(0u);}
 case 16u:{value=mix(s(3u),s(4u),pow(sat((a-s(0u))/max(.0001,s(1u)-s(0u))),1.0/s(2u)));}
 case 17u:{value=clamp(a,min(s(0u),s(1u)),max(s(0u),s(1u)));}
 case 18u:{value=1.0-a;}
 case 19u:{let radius=i32(s(0u));var total=0.0;var count=0.0;for(var dy=-radius;dy<=radius;dy++){for(var dx=-radius;dx<=radius;dx++){total+=A[at(ip+vec2i(dx,dy))];count+=1.0;}}value=total/count;}
 case 20u:{let avg=(A[at(ip+vec2i(1,0))]+A[at(ip-vec2i(1,0))]+A[at(ip+vec2i(0,1))]+A[at(ip-vec2i(0,1))])*.25;value=sat(a+(a-avg)*s(0u));}
 case 21u:{let angle=radians(s(0u));let pp=(uv-.5-vec2f(s(2u),s(3u)))/s(1u);let q=vec2f(pp.x*cos(angle)-pp.y*sin(angle),pp.x*sin(angle)+pp.y*cos(angle));value=sa((q+.5)*f32(n-1u));}
 case 22u:{value=pow(max(0.0,a),s(0u));}
 case 23u:{value=abs(a-s(0u))*s(1u);}
 case 24u:{let angle=degrees(atan(length(grad(ip))/ratio));value=ss(s(0u),max(s(0u)+.01,s(1u)),angle);}
 case 25u:{value=ss(s(0u)-s(2u),s(0u)+s(2u),a)*(1.0-ss(s(1u)-s(2u),s(1u)+s(2u),a));}
 case 26u:{let lap=A[at(ip+vec2i(1,0))]+A[at(ip-vec2i(1,0))]+A[at(ip+vec2i(0,1))]+A[at(ip-vec2i(0,1))]-4.0*a;let z=lap*f32(n)*s(0u);value=sat(.5+z);if(s(1u)==1.0){value=sat(-z);}if(s(1u)==2.0){value=sat(z);}}
 case 27u:{let g=grad(ip);let angle=atan2(g.y,g.x);let d=acos(clamp(cos(angle-radians(s(0u))),-1.0,1.0));value=1.0-ss(0.0,radians(s(1u)),d);}
 case 28u:{value=pow(ss(0.0,s(0u),min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y))),s(1u))*select(1.0,a,(U.meta.w&4u)!=0u);}
 case 29u:{let pal=u32(s(0u));let sl=length(grad(ip))/ratio;let variation=(noise(vec2f(gid.xy)*.14,722u)-.5)*2.0*s(3u);var c=mix(palette(pal,0u),palette(pal,1u),ss(.06,.42,a));c=mix(c,palette(pal,2u),ss(s(2u)*.25,s(2u)*1.8,sl));let snow=ss(s(1u)-.035,s(1u)+.08,a+variation*.025)*(1.0-ss(1.1,3.0,sl));if(pal==0u||pal==4u){c=mix(c,palette(pal,3u),snow);}else{c=mix(c,palette(pal,3u),ss(.25,.95,a)*.65);}C[i]=vec4f(mix(vec3f(a),clamp(c*(1.0+variation)*.92,vec3f(0),vec3f(1)),m),1);}
 case 30u:{let t=sat((a-s(1u))/max(.001,s(2u)-s(1u)))*3.0;let j=min(2u,u32(floor(t)));C[i]=vec4f(mix(palette(u32(s(0u)),j),palette(u32(s(0u)),j+1u),t-f32(j)),1);}
 default:{}
 }
 }
 if((U.meta.w&1u)!=0u&&op>=13u&&op<=23u){value=mix(a,value,m);}O[i]=value;
}
`;
export const thermal = common + /* wgsl */ `
@group(0) @binding(1) var<storage,read> H:array<f32>;
@group(0) @binding(2) var<storage,read> M:array<f32>;
@group(0) @binding(3) var<storage,read_write> F:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> O:array<f32>;
@compute @workgroup_size(8,8) fn flux(@builtin(global_invocation_id) id:vec3u){if(any(id.xy>=vec2u(U.meta.x))){return;}let p=vec2i(id.xy);let i=at(p);let talus=tan(radians(s(1u)))*(U.world.x/U.world.y)/f32(U.meta.x-1u);var f=vec4f(0);var sum=0.0;var maximum=0.0;for(var d=0u;d<4u;d++){let q=p+DIR[d];if(inside(q)){f[d]=max(0.0,H[i]-H[at(q)]-talus);sum+=f[d];maximum=max(maximum,f[d]);}}var mask=1.0;if((U.meta.w&1u)!=0u){mask=sat(M[i]);}let amount=min(max(0.0,H[i]),maximum*.24*s(2u)*mask);F[i]=f/max(sum,.000000001)*amount;}
@compute @workgroup_size(8,8) fn gather(@builtin(global_invocation_id) id:vec3u){if(any(id.xy>=vec2u(U.meta.x))){return;}let p=vec2i(id.xy);let i=at(p);var h=H[i];for(var d=0u;d<4u;d++){h-=F[i][d];let q=p+DIR[d];if(inside(q)){h+=F[at(q)][OPP[d]];}}O[i]=h;}
`;
export const hydraulic = common + /* wgsl */ `
@group(0) @binding(1) var<storage,read> Height:array<f32>;
@group(0) @binding(2) var<storage,read> Mask:array<f32>;
@group(0) @binding(3) var<storage,read> State:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> Next:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> Flux:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> Diag:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> Out:array<f32>;
fn rain(i:u32)->f32{var mask=1.0;if((U.meta.w&1u)!=0u){mask=sat(Mask[i]);}return s(1u)*mask;}
@compute @workgroup_size(8,8) fn init(@builtin(global_invocation_id) id:vec3u){if(any(id.xy>=vec2u(U.meta.x))){return;}let i=id.y*U.meta.x+id.x;Next[i]=vec4f(Height[i],0,0,0);}
@compute @workgroup_size(8,8) fn flux(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(U.meta.x))){return;}let p=vec2i(id.xy);let i=at(p);let w=State[i].y+rain(i);let level=State[i].x+w;var f=vec4f(0);var total=0.0;
 for(var d=0u;d<4u;d++){let q=p+DIR[d];if(inside(q)){let j=at(q);f[d]=max(0.0,(level-State[j].x-State[j].y-rain(j))*s(6u));total+=f[d];}}
 Flux[i]=f*min(1.0,w/max(total,.000000001));
}
@compute @workgroup_size(8,8) fn erode(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(U.meta.x))){return;}let p=vec2i(id.xy);let i=at(p);let old=State[i];let w=old.y+rain(i);var fout=0.0;var fin=0.0;var sinput=0.0;var slope=0.0;
 for(var d=0u;d<4u;d++){fout+=Flux[i][d];let q=p+DIR[d];if(inside(q)){let j=at(q);let incoming=Flux[j][OPP[d]];fin+=incoming;sinput+=incoming*State[j].z/max(State[j].y+rain(j),.000000001);slope=max(slope,old.x-State[j].x);}}
 var sediment=max(0.0,old.z*(1.0-min(1.0,fout/max(w,.000000001)))+sinput);var h=old.x;let speed=(fout+fin)/max(w+fin,.000001);let capacity=max(.0001,slope*f32(U.meta.x)/256.0)*speed*s(3u)*.2;var diag=Diag[i];
 if(sediment<capacity){let amount=min(max(0.0,h),min(.02,(capacity-sediment)*s(2u)));h-=amount;sediment+=amount;diag.x+=amount;}else{let amount=min(sediment,(sediment-capacity)*s(4u));h+=amount;sediment-=amount;diag.y+=amount;}
 Next[i]=vec4f(h,max(0.0,w+fin-fout)*(1.0-s(5u)),sediment,old.w+(fin+fout)*.5);Diag[i]=diag;
}
@compute @workgroup_size(8,8) fn extract(@builtin(global_invocation_id) id:vec3u){if(any(id.xy>=vec2u(U.meta.x))){return;}let i=id.y*U.meta.x+id.x;let v=State[i];switch U.meta.z {case 0u:{Out[i]=v.x+v.z;}case 1u:{Out[i]=v.w;}case 2u:{Out[i]=Diag[i].x;}case 3u:{Out[i]=Diag[i].y+v.z;}case 4u:{Out[i]=v.y;}default:{Out[i]=0.0;}}}
`;
export const reduction = /* wgsl */ `
struct Params{count:u32,pad:vec3u}
@group(0) @binding(0) var<uniform> U:Params;
@group(0) @binding(1) var<storage,read> A:array<f32>;
@group(0) @binding(2) var<storage,read_write> O:array<vec2f>;
var<workgroup> scratch:array<vec2f,256>;
@compute @workgroup_size(256) fn reduce(@builtin(global_invocation_id) id:vec3u,@builtin(local_invocation_index) tid:u32,@builtin(workgroup_id) group:vec3u){var v=vec2f(3.402823e38,-3.402823e38);if(id.x<U.count){v=vec2f(A[id.x]);}scratch[tid]=v;workgroupBarrier();for(var stride=128u;stride>0u;stride/=2u){if(tid<stride){scratch[tid]=vec2f(min(scratch[tid].x,scratch[tid+stride].x),max(scratch[tid].y,scratch[tid+stride].y));}workgroupBarrier();}if(tid==0u){O[group.x]=scratch[0];}}
`;
export const reducePairs = reduction.replace('var<storage,read> A:array<f32>', 'var<storage,read> A:array<vec2f>').replace('v=vec2f(A[id.x]);', 'v=A[id.x];');
export const normalize = /* wgsl */ `
struct Params{count:u32,pad:vec3u}
@group(0) @binding(0) var<uniform> U:Params;
@group(0) @binding(1) var<storage,read> A:array<f32>;
@group(0) @binding(2) var<storage,read> Bounds:array<vec2f>;
@group(0) @binding(3) var<storage,read_write> O:array<f32>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=U.count){return;}let r=Bounds[0];O[id.x]=(A[id.x]-r.x)/max(r.y-r.x,.00000001);}
`;
