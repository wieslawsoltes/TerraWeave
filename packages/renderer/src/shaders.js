export const scene = /* wgsl */ `
diagnostic(off, derivative_uniformity);
struct Scene{mvp:mat4x4f,eye:vec4f,sun:vec4f,terrain:vec4f,view:vec4f,screen:vec4f,env:vec4f,range:vec4f}
@group(0) @binding(0) var<uniform> U:Scene;
const TRI=array<vec2f,6>(vec2f(0,0),vec2f(0,1),vec2f(1,0),vec2f(1,0),vec2f(0,1),vec2f(1,1));
fn saturate(x:f32)->f32{return clamp(x,0.0,1.0);}
fn smooth(a:f32,b:f32,x:f32)->f32{let t=saturate((x-a)/max(.000001,b-a));return t*t*(3.0-2.0*t);}
fn background(uv:vec2f)->vec3f{let vignette=1.0-length((uv-.5)*vec2f(min(1.1,.4+U.screen.x/max(1.0,U.screen.y)*.1),.45));return mix(vec3f(.074,.094,.111),vec3f(.155,.194,.217),pow(1.0-uv.y,1.2))*vignette;}
fn tonemap(c:vec3f)->vec3f{let x=max(vec3f(0),c*U.screen.w);return pow(clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0),vec3f(1)),vec3f(1.0/2.2));}
`;
export const backgroundShader = scene + /* wgsl */ `
struct V{@builtin(position) position:vec4f,@location(0) uv:vec2f}
@vertex fn vs(@builtin(vertex_index) id:u32)->V{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.position=vec4f(p[id],.999,1);o.uv=vec2f(p[id].x*.5+.5,.5-p[id].y*.5);return o;}
@fragment fn fs(v:V)->@location(0) vec4f{return vec4f(background(v.uv),1);}
`;
export const floorShader = scene + /* wgsl */ `
struct V{@builtin(position) position:vec4f,@location(0) world:vec3f}
@vertex fn vs(@builtin(vertex_index) id:u32)->V{var o:V;o.world=vec3f((TRI[id].x-.5)*40.0,-.115,(TRI[id].y-.5)*40.0);o.position=U.mvp*vec4f(o.world,1);return o;}
@fragment fn fs(v:V)->@location(0) vec4f{let q=v.world.xz*4.0;let width=max(fwidth(q),vec2f(.001));let d=abs(fract(q-.5)-.5)/width;let grid=1.0-min(1.0,min(d.x,d.y));let majorq=q*.25;let major=1.0-min(1.0,min(abs(fract(majorq.x-.5)-.5)/max(fwidth(majorq.x),.001),abs(fract(majorq.y-.5)-.5)/max(fwidth(majorq.y),.001)));let fade=exp(-length(v.world.xz)*.43);let bg=background(v.position.xy/U.screen.xy);let c=bg+vec3f(.075,.085,.086)*(grid*.22+major*.35)*fade*U.env.w;return vec4f(c,1);}
`;
export const terrainShader = scene + /* wgsl */ `
@group(0) @binding(1) var<storage,read> H:array<f32>;
@group(0) @binding(2) var<storage,read> Colors:array<vec4f>;
fn index(p:vec2i)->u32{let n=i32(U.terrain.x);let c=clamp(p,vec2i(0),vec2i(n-1));return u32(c.y*n+c.x);}
fn height(uv:vec2f)->f32{let p=clamp(uv,vec2f(0),vec2f(1))*(U.terrain.x-1.0);let i=vec2i(floor(p));let t=fract(p);return mix(mix(H[index(i)],H[index(i+vec2i(1,0))],t.x),mix(H[index(i+vec2i(0,1))],H[index(i+vec2i(1,1))],t.x),t.y);}
fn color(uv:vec2f)->vec3f{let p=clamp(uv,vec2f(0),vec2f(1))*(U.terrain.x-1.0);let i=vec2i(floor(p));let t=fract(p);return mix(mix(Colors[index(i)].rgb,Colors[index(i+vec2i(1,0))].rgb,t.x),mix(Colors[index(i+vec2i(0,1))].rgb,Colors[index(i+vec2i(1,1))].rgb,t.x),t.y);}
fn normal(uv:vec2f)->vec3f{let e=1.0/(U.terrain.x-1.0);return normalize(vec3f((height(uv-vec2f(e,0))-height(uv+vec2f(e,0)))*U.terrain.z,4.0*e,(height(uv-vec2f(0,e))-height(uv+vec2f(0,e)))*U.terrain.z));}
struct V{@builtin(position) position:vec4f,@location(0) world:vec3f,@location(1) uv:vec2f,@location(2) side:f32,@location(3) sideNormal:vec3f}
@vertex fn vs(@builtin(vertex_index) id:u32)->V{
 let seg=u32(U.terrain.y);let surface=seg*seg*6u;var uv:vec2f;var y:f32;var side=0.0;var sn=vec3f(0,1,0);
 if(id<surface){let cell=id/6u;uv=(vec2f(f32(cell%seg),f32(cell/seg))+TRI[id%6u])/f32(seg);y=height(uv)*U.terrain.z;}
 else{let k=id-surface;let edge=k/(seg*6u);let cell=(k/6u)%seg;let corner=TRI[k%6u];let t=(f32(cell)+corner.x)/f32(seg);
 switch edge{case 0u:{uv=vec2f(0,t);sn=vec3f(-1,0,0);}case 1u:{uv=vec2f(1,1.0-t);sn=vec3f(1,0,0);}case 2u:{uv=vec2f(t,1);sn=vec3f(0,0,1);}default:{uv=vec2f(1.0-t,0);sn=vec3f(0,0,-1);}}
 y=mix(-.105,height(uv)*U.terrain.z,corner.y);side=1.0;}
 var o:V;o.uv=uv;o.world=vec3f((uv.x-.5)*2.0,y,(uv.y-.5)*2.0);o.position=U.mvp*vec4f(o.world,1);o.side=side;o.sideNormal=sn;return o;
}
fn shadow(pos:vec3f,n:vec3f)->f32{var shade=1.0;var t=.018;let light=normalize(U.sun.xyz);for(var k=0u;k<14u;k++){let p=pos+n*.003+light*t;let uv=p.xz*.5+.5;if(any(uv<vec2f(0))||any(uv>vec2f(1))){break;}let terrain=height(uv)*U.terrain.z;if(terrain>p.y+.001){shade=.33;break;}t=t*1.23+.012;}return shade;}
@fragment fn fs(v:V)->@location(0) vec4f{
 let h=height(v.uv);var n=normal(v.uv);var material=vec3f(.28,.31,.23);let mode=u32(U.view.x);
 if(U.view.y>.5){material=color(v.uv);}else{material=mix(vec3f(.12,.20,.13),vec3f(.43,.41,.35),smooth(.15,.72,h));material=mix(material,vec3f(.85,.90,.92),smooth(U.env.y-.04,U.env.y+.1,h)*(1.0-smooth(.4,.85,1.0-n.y)));}
 if(mode==1u){material=vec3f(saturate((h-U.range.x)/max(.0001,U.range.y-U.range.x)));}
 if(mode==2u){material=vec3f(.46,.49,.51);}
 if(v.side>.5){n=normalize(v.sideNormal);let bands=sin(v.world.y*180.0+sin(v.world.x*22.0)*.5)*.025;material=vec3f(.13,.12,.10)+bands;material*=smooth(-.115,.35,v.world.y)*.6+.45;}
 if(mode==3u&&v.side<.5){return vec4f(n*.5+.5,1);}
 let light=normalize(U.sun.xyz);let ndl=max(0.0,dot(n,light));var sh=1.0;if(U.view.w>.5&&v.side<.5){sh=shadow(v.world,n);}
 let e=5.0/(U.terrain.x-1.0);let avg=(height(v.uv+vec2f(e,0))+height(v.uv-vec2f(e,0))+height(v.uv+vec2f(0,e))+height(v.uv-vec2f(0,e)))*.25;let ao=1.0-clamp((avg-h)*18.0,0.0,.5);
 var c=material*(vec3f(.31,.39,.46)*(.65+.35*n.y)*ao+vec3f(1.15,1.07,.9)*ndl*sh*1.0);let rim=pow(1.0-max(0.0,dot(n,normalize(U.eye.xyz-v.world))),4.0);c+=vec3f(.04,.05,.055)*rim;
 if(U.view.z>.5&&v.side<.5){let q=h*40.0;let d=abs(fract(q+.5)-.5);let line=1.0-smooth(0.0,max(fwidth(q)*1.2,.008),d);c=mix(c,c*.3,line*.65);}
 if(mode==4u&&v.side<.5){let q=v.uv*U.terrain.y;let f=fract(q);let d=min(min(f.x,f.y),abs(f.x+f.y-1.0));let w=max(length(fwidth(q))*.45,.02);c=mix(c*.6,vec3f(.32,.65,.57),1.0-smooth(0.0,w,d));}
 c=tonemap(c);let fog=1.0-exp(-max(0.0,length(U.eye.xyz-v.world)-1.5)*.05);c=mix(c,vec3f(.20,.25,.28),fog);return vec4f(c,1);
}
@vertex fn waterVS(@builtin(vertex_index) id:u32)->V{var o:V;o.uv=TRI[id];o.world=vec3f((o.uv.x-.5)*2.0,U.terrain.w*U.terrain.z+.001,(o.uv.y-.5)*2.0);o.position=U.mvp*vec4f(o.world,1);o.side=0;o.sideNormal=vec3f(0,1,0);return o;}
@fragment fn waterFS(v:V)->@location(0) vec4f{let h=height(v.uv);let depth=U.terrain.w-h;if(depth<0.0){discard;}let wave=vec2f(sin(v.world.x*67.0+v.world.z*31.0+U.screen.z*.9),cos(v.world.z*59.0-v.world.x*28.0+U.screen.z*.8))*.018;let n=normalize(vec3f(wave.x,1,wave.y));let eye=normalize(U.eye.xyz-v.world);let fresnel=.04+.7*pow(1.0-max(0.0,dot(n,eye)),5.0);var c=mix(vec3f(.095,.33,.29),vec3f(.018,.11,.14),smooth(0.0,.14,depth));if(U.view.y>.5){c=mix(color(v.uv)*.6,c,smooth(0.0,.025,depth));}c=mix(c,vec3f(.23,.35,.41),fresnel);let spec=pow(max(0.0,dot(reflect(-normalize(U.sun.xyz),n),eye)),160.0);c+=vec3f(1.3,1.2,1)*spec;let foam=(1.0-smooth(.001,.008,depth))*(.55+.3*sin(v.uv.x*730.0+v.uv.y*315.0));c=mix(c,vec3f(.60,.69,.63),foam*.5);return vec4f(tonemap(c),1);}
@vertex fn flatVS(@builtin(vertex_index) id:u32)->V{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.position=vec4f(p[id],0,1);o.world=vec3f(0);o.uv=vec2f(0);o.side=0;o.sideNormal=vec3f(0,1,0);return o;}
@fragment fn flatFS(v:V)->@location(0) vec4f{let uv=(v.position.xy-U.screen.xy*.5)/(min(U.screen.x,U.screen.y)*.86)+.5;if(any(uv<vec2f(0))||any(uv>vec2f(1))){return vec4f(background(v.position.xy/U.screen.xy),1);}let h=height(uv);let val=saturate((h-U.range.x)/max(.00001,U.range.y-U.range.x));var c=vec3f(val);if(U.view.x==0.0&&U.view.y>.5){c=pow(color(uv),vec3f(1.0/2.2));}if(U.view.x==3.0){c=normal(uv)*.5+.5;}if(U.view.z>.5){let q=val*25.0;let line=1.0-smooth(0.0,max(fwidth(q),.008),abs(fract(q+.5)-.5));c=mix(c,vec3f(.08,.13,.13),line*.5);}return vec4f(c,1);}
`;
