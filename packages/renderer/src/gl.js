export const commonGL = `#version 300 es
precision highp float;
precision highp int;
layout(std140) uniform Scene { mat4 mvp; vec4 eye; vec4 sun; vec4 terrain; vec4 view; vec4 screen; vec4 env; vec4 range; };
uniform sampler2D uHeight; uniform sampler2D uColor; uniform int uPass;
const vec2 TRI[6]=vec2[6](vec2(0,0),vec2(0,1),vec2(1,0),vec2(1,0),vec2(0,1),vec2(1,1));
float ss(float a,float b,float x){float t=clamp((x-a)/max(.000001,b-a),0.,1.);return t*t*(3.-2.*t);}
ivec2 coord(ivec2 p){return clamp(p,ivec2(0),ivec2(int(terrain.x)-1));}
float heightAt(vec2 uv){vec2 p=clamp(uv,0.,1.)*(terrain.x-1.);ivec2 i=ivec2(floor(p));vec2 t=fract(p);return mix(mix(texelFetch(uHeight,coord(i),0).r,texelFetch(uHeight,coord(i+ivec2(1,0)),0).r,t.x),mix(texelFetch(uHeight,coord(i+ivec2(0,1)),0).r,texelFetch(uHeight,coord(i+ivec2(1,1)),0).r,t.x),t.y);}
vec3 colorAt(vec2 uv){vec2 p=clamp(uv,0.,1.)*(terrain.x-1.);ivec2 i=ivec2(floor(p));vec2 t=fract(p);return mix(mix(texelFetch(uColor,coord(i),0).rgb,texelFetch(uColor,coord(i+ivec2(1,0)),0).rgb,t.x),mix(texelFetch(uColor,coord(i+ivec2(0,1)),0).rgb,texelFetch(uColor,coord(i+ivec2(1,1)),0).rgb,t.x),t.y);}
vec3 normalAt(vec2 uv){float e=1./(terrain.x-1.);return normalize(vec3((heightAt(uv-vec2(e,0))-heightAt(uv+vec2(e,0)))*terrain.z,4.*e,(heightAt(uv-vec2(0,e))-heightAt(uv+vec2(0,e)))*terrain.z));}
vec3 bg(vec2 uv){float vignette=1.-length((uv-.5)*vec2(.6,.45));return mix(vec3(.074,.094,.111),vec3(.155,.194,.217),pow(1.-uv.y,1.2))*vignette;}
vec3 tone(vec3 c){vec3 x=max(vec3(0),c*screen.w);return pow(clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.),vec3(1./2.2));}
`;
export const vertexGL = commonGL + `
out vec3 vWorld; out vec2 vUv; out float vSide; out vec3 vNormal;
void main(){vWorld=vec3(0);vUv=vec2(0);vSide=0.;vNormal=vec3(0,1,0);
 if(uPass==-1||uPass==2){vec2 p=vec2((gl_VertexID==1)?3.:-1.,(gl_VertexID==2)?3.:-1.);gl_Position=vec4(p,0,1);vUv=p*.5+.5;return;}
 if(uPass==-2){vWorld=vec3((TRI[gl_VertexID].x-.5)*40.,-.115,(TRI[gl_VertexID].y-.5)*40.);gl_Position=mvp*vec4(vWorld,1);return;}
 if(uPass==1){vUv=TRI[gl_VertexID];vWorld=vec3((vUv.x-.5)*2.,terrain.w*terrain.z+.001,(vUv.y-.5)*2.);gl_Position=mvp*vec4(vWorld,1);return;}
 int seg=int(terrain.y);int total=seg*seg*6;float y;
 if(gl_VertexID<total){int cell=gl_VertexID/6;vUv=(vec2(float(cell%seg),float(cell/seg))+TRI[gl_VertexID%6])/float(seg);y=heightAt(vUv)*terrain.z;}
 else{int k=gl_VertexID-total;int edge=k/(seg*6);int cell=(k/6)%seg;vec2 c=TRI[k%6];float t=(float(cell)+c.x)/float(seg);if(edge==0){vUv=vec2(0,t);vNormal=vec3(-1,0,0);}else if(edge==1){vUv=vec2(1,1.-t);vNormal=vec3(1,0,0);}else if(edge==2){vUv=vec2(t,1);vNormal=vec3(0,0,1);}else{vUv=vec2(1.-t,0);vNormal=vec3(0,0,-1);}y=mix(-.105,heightAt(vUv)*terrain.z,c.y);vSide=1.;}
 vWorld=vec3((vUv.x-.5)*2.,y,(vUv.y-.5)*2.);gl_Position=mvp*vec4(vWorld,1);
}
`;
export const fragmentGL = commonGL + `
in vec3 vWorld; in vec2 vUv; in float vSide; in vec3 vNormal; out vec4 frag;
float shadowAt(vec3 pos,vec3 n){float t=.018;vec3 light=normalize(sun.xyz);for(int k=0;k<14;k++){vec3 p=pos+n*.003+light*t;vec2 uv=p.xz*.5+.5;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))break;if(heightAt(uv)*terrain.z>p.y+.001)return .33;t=t*1.23+.012;}return 1.;}
void main(){vec2 pixel=vec2(gl_FragCoord.x,screen.y-gl_FragCoord.y);
 if(uPass==-1){frag=vec4(bg(pixel/screen.xy),1);return;}
 if(uPass==-2){vec2 q=vWorld.xz*4.;vec2 d=abs(fract(q-.5)-.5)/max(fwidth(q),vec2(.001));float grid=1.-min(1.,min(d.x,d.y));vec2 mq=q*.25;vec2 md=abs(fract(mq-.5)-.5)/max(fwidth(mq),vec2(.001));float major=1.-min(1.,min(md.x,md.y));frag=vec4(bg(pixel/screen.xy)+vec3(.075,.085,.086)*(grid*.22+major*.35)*exp(-length(vWorld.xz)*.43)*env.w,1);return;}
 if(uPass==2){vec2 uv=(pixel-screen.xy*.5)/(min(screen.x,screen.y)*.86)+.5;if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1)))){frag=vec4(bg(pixel/screen.xy),1);return;}float h=heightAt(uv);float value=clamp((h-range.x)/max(.00001,range.y-range.x),0.,1.);vec3 c=vec3(value);if(view.x==0.&&view.y>.5)c=pow(colorAt(uv),vec3(1./2.2));if(view.x==3.)c=normalAt(uv)*.5+.5;if(view.z>.5){float q=value*25.;float line=1.-ss(0.,max(fwidth(q),.008),abs(fract(q+.5)-.5));c=mix(c,vec3(.08,.13,.13),line*.5);}frag=vec4(c,1);return;}
 float h=heightAt(vUv);
 if(uPass==1){float depth=terrain.w-h;if(depth<0.)discard;vec2 wave=vec2(sin(vWorld.x*67.+vWorld.z*31.+screen.z*.9),cos(vWorld.z*59.-vWorld.x*28.+screen.z*.8))*.018;vec3 n=normalize(vec3(wave.x,1,wave.y));vec3 e=normalize(eye.xyz-vWorld);float fresnel=.04+.7*pow(1.-max(0.,dot(n,e)),5.);vec3 c=mix(vec3(.095,.33,.29),vec3(.018,.11,.14),ss(0.,.14,depth));if(view.y>.5)c=mix(colorAt(vUv)*.6,c,ss(0.,.025,depth));c=mix(c,vec3(.23,.35,.41),fresnel);c+=vec3(1.3,1.2,1)*pow(max(0.,dot(reflect(-normalize(sun.xyz),n),e)),160.);float foam=(1.-ss(.001,.008,depth))*(.55+.3*sin(vUv.x*730.+vUv.y*315.));c=mix(c,vec3(.60,.69,.63),foam*.5);frag=vec4(tone(c),1);return;}
 vec3 n=normalAt(vUv);int mode=int(view.x);vec3 mat=mix(vec3(.12,.20,.13),vec3(.43,.41,.35),ss(.15,.72,h));mat=mix(mat,vec3(.85,.90,.92),ss(env.y-.04,env.y+.1,h)*(1.-ss(.4,.85,1.-n.y)));if(view.y>.5)mat=colorAt(vUv);if(mode==1)mat=vec3(clamp((h-range.x)/max(.0001,range.y-range.x),0.,1.));if(mode==2)mat=vec3(.46,.49,.51);if(vSide>.5){n=normalize(vNormal);float bands=sin(vWorld.y*180.+sin(vWorld.x*22.)*.5)*.025;mat=(vec3(.13,.12,.10)+bands)*(ss(-.115,.35,vWorld.y)*.6+.45);}if(mode==3&&vSide<.5){frag=vec4(n*.5+.5,1);return;}
 float sh=(view.w>.5&&vSide<.5)?shadowAt(vWorld,n):1.;float e=5./(terrain.x-1.);float avg=(heightAt(vUv+vec2(e,0))+heightAt(vUv-vec2(e,0))+heightAt(vUv+vec2(0,e))+heightAt(vUv-vec2(0,e)))*.25;float ao=1.-clamp((avg-h)*18.,0.,.5);vec3 c=mat*(vec3(.31,.39,.46)*(.65+.35*n.y)*ao+vec3(1.15,1.07,.9)*max(0.,dot(n,normalize(sun.xyz)))*sh);float rim=pow(1.-max(0.,dot(n,normalize(eye.xyz-vWorld))),4.);c+=vec3(.04,.05,.055)*rim;
 if(view.z>.5&&vSide<.5){float q=h*40.;float line=1.-ss(0.,max(fwidth(q)*1.2,.008),abs(fract(q+.5)-.5));c=mix(c,c*.3,line*.65);}if(mode==4&&vSide<.5){vec2 q=vUv*terrain.y;vec2 f=fract(q);float d=min(min(f.x,f.y),abs(f.x+f.y-1.));float w=max(length(fwidth(q))*.45,.02);c=mix(c*.6,vec3(.32,.65,.57),1.-ss(0.,w,d));}c=tone(c);float fog=1.-exp(-max(0.,length(eye.xyz-vWorld)-1.5)*.05);frag=vec4(mix(c,vec3(.20,.25,.28),fog),1);
}
`;
