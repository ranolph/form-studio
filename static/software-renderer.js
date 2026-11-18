/** Dependency-free CPU triangle rasterizer for browsers without WebGL.
 * Runs off the UI thread. The preview uses the same indexed model as STL export. */
let model=null,canvas=null,ctx=null;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
const toLinear=x=>(x/=255)<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const linearRGB=hex=>rgb(hex).map(toLinear);
const bottom=linearRGB('#bba7ef'),middle=linearRGB('#f5a6c6'),top=linearRGB('#ff8958'),maskColor=linearRGB('#5aa578');
// Shade in linear light, then use the same neutral display transform as WebGL.
// Multiplying sRGB bytes directly crushes the lavender shadows into grey/brown.
const displayLUT=Uint8ClampedArray.from({length:4097},(_,i)=>{const c=i/4096;return 255*(c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055);});
const encode=c=>displayLUT[Math.round(clamp(c)*4096)];
function sampleMask(mask,u,v){
  const x=((u%1+1)%1)*mask.width,y=clamp(v)*(mask.height-1),x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,w=mask.width;
  const a=mask.bytes[y0*w+x0%w],b=mask.bytes[y0*w+(x0+1)%w],c=mask.bytes[Math.min(mask.height-1,y0+1)*w+x0%w],d=mask.bytes[Math.min(mask.height-1,y0+1)*w+(x0+1)%w];
  const value=((a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy)/255;return mask.invert?1-value:value;
}
function render(config){
  if(!model||model.version!==config.version)return null;
  const {positions:p,indices:idx,normals:n,surfaceHeight:sh}=model,{width:w,height:h,matrix:m}=config;
  const vertexCount=p.length/3,projected=new Float32Array(vertexCount*4),world=new Float32Array(vertexCount*3);
  for(let i=0;i<vertexCount;i++){
    const x=p[i*3],y=p[i*3+1],z=p[i*3+2],cw=m[3]*x+m[7]*y+m[11]*z+m[15];
    projected[i*4]=((m[0]*x+m[4]*y+m[8]*z+m[12])/cw+1)*w/2;
    projected[i*4+1]=(1-(m[1]*x+m[5]*y+m[9]*z+m[13])/cw)*h/2;
    projected[i*4+2]=(m[2]*x+m[6]*y+m[10]*z+m[14])/cw;
    projected[i*4+3]=1/cw;
    world[i*3]=x;world[i*3+1]=z;world[i*3+2]=-y;
  }
  const pixels=new Uint8ClampedArray(w*h*4),depth=new Float32Array(w*h);depth.fill(Infinity);
  const base=linearRGB(config.color||'#c77d5d'),cam=config.camera,layerHeight=config.layerHeight||.6,heightMm=config.heightMm;
  let mask=null;
  if(config.mask?.data){try{mask={...config.mask,bytes:Uint8Array.from(atob(config.mask.data),c=>c.charCodeAt(0))};}catch{mask=null;}}
  const key=[-.46,.65,.60],fill=[.72,.5,.48],rim=[.15,.68,-.72];
  for(let f=0;f<idx.length;f+=3){
    const ia=idx[f],ib=idx[f+1],ic=idx[f+2],a=ia*4,b=ib*4,c=ic*4;
    const ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];
    const za=projected[a+2],zb=projected[b+2],zc=projected[c+2],wa=projected[a+3],wb=projected[b+3],wc=projected[c+3];
    if(wa<=0||wb<=0||wc<=0||Math.min(za,zb,zc)>1||Math.max(za,zb,zc)<-1)continue;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(area)<.00001)continue;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));if(x1<x0||y1<y0)continue;
    const invArea=1/area,aa=ia*3,bb=ib*3,cc=ic*3;
    const nx=(n[aa]+n[bb]+n[cc])/3,ny=(n[aa+2]+n[bb+2]+n[cc+2])/3,nz=-(n[aa+1]+n[bb+1]+n[cc+1])/3;
    const mx=(world[aa]+world[bb]+world[cc])/3,my=(world[aa+1]+world[bb+1]+world[cc+1])/3,mz=(world[aa+2]+world[bb+2]+world[cc+2])/3;
    const sign=nx*(cam[0]-mx)+ny*(cam[1]-my)+nz*(cam[2]-mz)>=0?1:-1;
    const dzdx=((p[bb+2]-p[aa+2])*(cy-ay)-(p[cc+2]-p[aa+2])*(by-ay))*invArea;
    const dzdy=((bx-ax)*(p[cc+2]-p[aa+2])-(cx-ax)*(p[bb+2]-p[aa+2]))*invArea;
    const layerVisibility=clamp((1.35-(Math.abs(dzdx)+Math.abs(dzdy))/layerHeight)/.85);
    const edgeA=Math.hypot(cx-bx,cy-by),edgeB=Math.hypot(ax-cx,ay-cy),edgeC=Math.hypot(bx-ax,by-ay),absArea=Math.abs(area);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const px=x+.5,py=y+.5,l0=((bx-px)*(cy-py)-(by-py)*(cx-px))*invArea,l1=((cx-px)*(ay-py)-(cy-py)*(ax-px))*invArea,l2=1-l0-l1;
      if(l0<-.00001||l1<-.00001||l2<-.00001)continue;
      const z=l0*za+l1*zb+l2*zc,index=y*w+x;if(z>=depth[index])continue;
      if(config.mode==='wire'&&Math.min(l0*absArea/edgeA,l1*absArea/edgeB,l2*absArea/edgeC)>1)continue;
      const denom=l0*wa+l1*wb+l2*wc,q0=l0*wa/denom,q1=l1*wb/denom,q2=1-q0-q1;
      const ox=q0*p[aa]+q1*p[bb]+q2*p[cc];if(config.section&&ox>0)continue;
      const oz=q0*p[aa+2]+q1*p[bb+2]+q2*p[cc+2];
      let vx=sign*(q0*n[aa]+q1*n[bb]+q2*n[cc]),vy=sign*(q0*n[aa+2]+q1*n[bb+2]+q2*n[cc+2]),vz=-sign*(q0*n[aa+1]+q1*n[bb+1]+q2*n[cc+1]);
      const norm=Math.hypot(vx,vy,vz)||1;vx/=norm;vy/=norm;vz/=norm;
      let lighting=.70+.58*Math.max(0,vx*key[0]+vy*key[1]+vz*key[2])+.26*Math.max(0,vx*fill[0]+vy*fill[1]+vz*fill[2])+.12*Math.max(0,vx*rim[0]+vy*rim[1]+vz*rim[2]);
      if(config.mode==='layers'){const line=.5+.5*Math.cos(oz/layerHeight*TAU);lighting*=1-.22*layerVisibility*line**3;}
      const t=clamp((oz/heightMm-.04)/.92),segment=t<.48?t/.48:(t-.48)/.52,blend=segment*segment*(3-2*segment),lo=t<.48?bottom:middle,hi=t<.48?middle:top;
      let red=config.gradient?lo[0]*(1-blend)+hi[0]*blend:base[0],green=config.gradient?lo[1]*(1-blend)+hi[1]*blend:base[1],blue=config.gradient?lo[2]*(1-blend)+hi[2]*blend:base[2];
      if(mask){const oy=q0*p[aa+1]+q1*p[bb+1]+q2*p[cc+1],zRatio=clamp(oz/heightMm),u=(Math.atan2(oy-config.lean[1]*zRatio,ox-config.lean[0]*zRatio)/TAU+1)%1,originalHeight=sh?(q0*sh[ia]+q1*sh[ib]+q2*sh[ic]):zRatio,amount=sampleMask(mask,u,1-originalHeight)*.46;red=red*(1-amount)+maskColor[0]*amount;green=green*(1-amount)+maskColor[1]*amount;blue=blue*(1-amount)+maskColor[2]*amount;}
      red*=lighting;green*=lighting;blue*=lighting;
      const minimum=Math.min(red,green,blue),offset=minimum<.08?minimum-6.25*minimum*minimum:.04;
      red-=offset;green-=offset;blue-=offset;
      const peak=Math.max(red,green,blue);
      if(peak>.76){const compressed=1-.0576/(peak-.52),scale=compressed/peak,desaturation=1-1/(.15*(peak-compressed)+1);red=red*scale*(1-desaturation)+compressed*desaturation;green=green*scale*(1-desaturation)+compressed*desaturation;blue=blue*scale*(1-desaturation)+compressed*desaturation;}
      const out=index*4;
      if(config.mode==='wire'){pixels[out]=93;pixels[out+1]=84;pixels[out+2]=76;}
      else{pixels[out]=encode(red);pixels[out+1]=encode(green);pixels[out+2]=encode(blue);}
      pixels[out+3]=255;depth[index]=z;
    }
  }
  if(!canvas){canvas=new OffscreenCanvas(w,h);ctx=canvas.getContext('2d');}else if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.putImageData(new ImageData(pixels,w,h),0,0);return canvas.transferToImageBitmap();
}
self.onmessage=({data})=>{
  try{
    if(data.type==='mesh'){model=data;return;}
    if(data.type==='render'){const bitmap=render(data);if(bitmap)self.postMessage({type:'frame',bitmap,version:data.version,width:data.width,height:data.height},[bitmap]);else self.postMessage({type:'frame',bitmap:null,version:data.version,width:0,height:0});}
  }catch(error){self.postMessage({error:error.message});}
};
