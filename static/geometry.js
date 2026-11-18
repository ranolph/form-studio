/** Form Studio · parametric, dependency-free material-volume mesher.
 * All coordinates and linear parameters are millimetres; Z is the print axis.
 * Wall thickness is radial, not a normal offset of the surface.
 */
export const LIMITS = Object.freeze({
  height:[12,500], diameter:[16,500], topRatio:[0.12,1.5], bottomRatio:[0.12,1.5],
  belly:[0,1.1], bellyPosition:[0.15,0.85], wallThickness:[0.6,12], baseThickness:[0.8,20],
  aspectRatio:[0.35,2.8], sides:[3,16], cornerRadius:[0.05,1], lobes:[3,20], lobeDepth:[0,0.55],
  twist:[-360,360], patternDepth:[0,15], patternCount:[3,72], patternRows:[1,32],
  patternTwist:[-360,360], patternSharpness:[0.5,6], rimHeight:[0,20], rimWidth:[0,10],
  footHeight:[0,15], footInset:[1,20], holeDiameter:[1,150],
  perforationCount:[4,32], perforationRows:[1,12], perforationSize:[0.2,0.8],
  twistBottom:[-360,360], twistEase:[0.25,4], leanX:[-150,150], leanY:[-150,150],
  zWaveAmplitude:[0,8],zWaveCount:[2,32],zWaveRows:[1,12],zWavePhase:[0,360],zWaveFade:[0.08,0.45]
});
export const OPTIONS = Object.freeze({
  objectType:['planter','vase','bowl','lampshade','organiser'],
  profile:['tapered','cylinder','barrel','bulb','hourglass','trumpet','bowl','custom'],
  crossSection:['circle','ellipse','rounded-square','polygon','star'],
  pattern:['smooth','ribs','flutes','waves','diamonds','ripples','scales','woven','dimples','coral','braided','chevron','honeycomb','organic','image'],
  baseMode:['closed','drain','open','mount'], perforation:['none','slots','diamonds'],
  quality:['standard','fine','ultra'], profileInterpolation:['smooth','linear'], previewQuality:['draft','preview','detail']
});
export const DEFAULTS = Object.freeze({
  name:'Spiral planter', objectType:'planter', profile:'tapered', height:140, diameter:145,
  topRatio:1, bottomRatio:0.7, belly:0.18, bellyPosition:0.5,
  wallThickness:2, baseThickness:3, crossSection:'circle', aspectRatio:1.4,
  sides:6, cornerRadius:0.35, lobes:8, lobeDepth:0.18, twist:0,
  pattern:'ribs', patternDepth:3, patternCount:36, patternRows:8,
  patternTwist:70, patternSharpness:2, rimHeight:3, rimWidth:1.2,
  footHeight:0, footInset:4, baseMode:'drain', holeDiameter:10,
  perforation:'none', perforationCount:12, perforationRows:3, perforationSize:0.55,
  quality:'fine', color:'#c77d5d', profileInterpolation:'smooth', previewQuality:'preview',
  twistBottom:0, twistTop:null, twistEase:1, aspectRatioTop:null, leanX:0, leanY:0, effects:null,
  zWaveAmplitude:0,zWaveCount:12,zWaveRows:2,zWavePhase:0,zWaveFade:0.18,
  profilePoints:[{z:0,r:0.65},{z:0.25,r:0.9},{z:0.5,r:1},{z:0.75,r:0.75},{z:1,r:0.6}]
});
export const EFFECT_LIMITS=Object.freeze({depthBottom:[0,24],depthTop:[0,24],count:[2,96],rows:[1,48],twist:[-720,720],twistEase:[0.25,4],phase:[-360,360],sharpness:[0.35,8],start:[0,0.97],end:[0.03,1],fade:[0,0.5],variation:[0,1],seed:[0,99999],imageRepeatX:[1,12],imageRepeatY:[1,12],imageOffsetX:[0,1],imageOffsetY:[0,1]});
export const EFFECT_DEFAULTS=Object.freeze({id:'effect-1',enabled:true,pattern:'ribs',blend:'add',depthBottom:2,depthTop:2,count:32,rows:8,twist:0,twistEase:1,phase:0,sharpness:2,start:0,end:1,fade:0.05,variation:0,seed:42,mask:null,image:null,imageMode:'relief',imageRepeatX:1,imageRepeatY:1,imageOffsetX:0,imageOffsetY:0,imageInvert:false,legacyEdgeFade:false});
const preset=(id,name,category,description,params)=>({id,name,category,description,params:{...DEFAULTS,...params,name}});
export const PRESETS = [
  preset('spiral-planter','Spiral planter','planter','Twisted ribs, a neat lip and a drainage hole.',{}),
  preset('fluted-cachepot','Fluted cachepot','planter','Soft vertical grooves and a solid base.',{name:'Fluted cachepot',profile:'barrel',diameter:160,height:150,topRatio:0.92,bottomRatio:0.74,belly:0.13,pattern:'flutes',patternCount:40,patternDepth:2.5,patternTwist:0,baseMode:'closed',color:'#d4c2a5'}),
  preset('petal-planter','Petal planter','planter','A six-lobed outline with a recessed standing rim.',{crossSection:'star',lobes:6,lobeDepth:0.17,pattern:'smooth',diameter:155,height:130,footHeight:3,footInset:5,patternTwist:0,color:'#9aab8d'}),
  preset('woven-pot','Woven pot','planter','Intersecting surface relief with a circular drainage hole.',{profile:'cylinder',topRatio:1,bottomRatio:0.88,pattern:'woven',patternCount:22,patternRows:12,patternDepth:2.5,patternTwist:0,diameter:150,height:140,color:'#ba9b73'}),
  preset('orb-vase','Orb vase','vase','A rounded body, short neck and flowing flutes.',{objectType:'vase',profile:'bulb',height:185,diameter:145,bottomRatio:0.45,topRatio:0.3,belly:0.85,bellyPosition:0.42,pattern:'flutes',patternCount:36,patternDepth:1.5,patternTwist:35,baseMode:'closed',rimHeight:2,rimWidth:0.6,color:'#a8b7ad'}),
  preset('wave-vase','Wave vase','vase','A tall waist with gently wandering ribs.',{objectType:'vase',profile:'hourglass',height:215,diameter:100,topRatio:0.8,bottomRatio:0.85,belly:0.33,pattern:'waves',patternCount:22,patternRows:3,patternDepth:2.8,patternTwist:25,baseMode:'closed',color:'#e1d7c5'}),
  preset('diamond-vase','Diamond vase','vase','Raised geometric texture on a full, rounded body.',{objectType:'vase',profile:'barrel',height:180,diameter:125,topRatio:0.6,bottomRatio:0.65,belly:0.38,pattern:'diamonds',patternCount:18,patternRows:10,patternDepth:3,patternTwist:0,baseMode:'closed',color:'#bb806c'}),
  preset('twisted-facets','Twisted facets','vase','A rotating hexagonal silhouette with a smooth finish.',{objectType:'vase',profile:'tapered',crossSection:'polygon',sides:6,twist:65,height:200,diameter:110,bottomRatio:0.7,topRatio:1,pattern:'smooth',baseMode:'closed',color:'#82969c'}),
  preset('ripple-bowl','Ripple bowl','bowl','A low bowl wrapped in soft horizontal waves.',{objectType:'bowl',profile:'bowl',height:65,diameter:190,bottomRatio:0.48,topRatio:1,belly:0.05,pattern:'ripples',patternRows:9,patternCount:8,patternDepth:1.4,patternTwist:0,baseMode:'closed',rimHeight:2,rimWidth:0.8,color:'#c4b5a0'}),
  preset('pebble-bowl','Pebble bowl','bowl','An oval dish with a smooth tactile finish.',{objectType:'bowl',profile:'bowl',crossSection:'ellipse',aspectRatio:1.55,height:48,diameter:195,bottomRatio:0.7,topRatio:1,pattern:'smooth',baseMode:'closed',rimHeight:3,rimWidth:1.2,color:'#9eac9a'}),
  preset('pleated-shade','Pleated shade','lampshade','A ribbed shade with a 42 mm mounting hole.',{objectType:'lampshade',profile:'tapered',height:180,diameter:205,bottomRatio:0.64,topRatio:1,wallThickness:1.2,baseThickness:2.4,pattern:'ribs',patternCount:52,patternDepth:3,patternSharpness:1.5,patternTwist:0,baseMode:'mount',holeDiameter:42,rimHeight:2,rimWidth:0.7,color:'#eddfbf'}),
  preset('lantern-shade','Lantern shade','lampshade','An open shell with repeated diamond windows.',{objectType:'lampshade',profile:'barrel',height:180,diameter:160,bottomRatio:0.75,topRatio:0.75,belly:0.25,wallThickness:2,pattern:'smooth',baseMode:'open',perforation:'diamonds',perforationCount:14,perforationRows:4,perforationSize:0.56,rimHeight:4,rimWidth:1,color:'#d9aa71'}),
  preset('slotted-shade','Slotted shade','lampshade','Tall light slots in a gently flared mounting shade.',{objectType:'lampshade',profile:'trumpet',height:175,diameter:170,bottomRatio:0.7,topRatio:1,belly:0,wallThickness:2,pattern:'smooth',baseMode:'mount',holeDiameter:42,perforation:'slots',perforationCount:18,perforationRows:2,perforationSize:0.58,rimHeight:4,rimWidth:0.8,color:'#b1b5a2'}),
  preset('desk-cup','Desk cup','organiser','A rounded square cup with straight sides.',{objectType:'organiser',profile:'cylinder',crossSection:'rounded-square',cornerRadius:0.6,height:110,diameter:85,topRatio:1,bottomRatio:1,pattern:'smooth',baseMode:'closed',wallThickness:2.4,rimHeight:2,rimWidth:0.6,color:'#6f9292'}),
  preset('dimple-vessel','Dimple vessel','organiser','A subtle dotted texture and a generous opening.',{objectType:'organiser',profile:'barrel',height:120,diameter:100,topRatio:0.88,bottomRatio:0.86,belly:0.12,pattern:'dimples',patternCount:18,patternRows:10,patternDepth:1.5,patternTwist:0,baseMode:'closed',color:'#bf8b6d'}),
  preset('scallop-vase','Scallop vase','vase','Overlapping wave relief over a custom silhouette.',{objectType:'vase',profile:'custom',height:180,diameter:125,pattern:'scales',patternCount:18,patternRows:12,patternDepth:2.5,patternTwist:0,baseMode:'closed',color:'#9eacbd',profilePoints:[{z:0,r:0.52},{z:0.25,r:0.88},{z:0.55,r:1},{z:0.8,r:0.6},{z:1,r:0.4}]})
];
const effectPreset=(id,pattern,values={})=>({...EFFECT_DEFAULTS,id,pattern,...values});
const contourTile={width:32,height:32,name:'Contour tile',data:btoa(Array.from({length:1024},(_,i)=>{
  const x=i%32/32,y=Math.floor(i/32)/31;
  const v=.5+.5*Math.sin(Math.PI*2*(x*3+y*2)+1.5*Math.sin(Math.PI*2*y));
  return String.fromCharCode(Math.round(v*255));
}).join(''))};
const accentMask={width:32,height:32,invert:false,data:btoa(Array.from({length:1024},(_,i)=>{
  const u=i%32/32,v=Math.floor(i/32)/31,du=Math.min(Math.abs(u-.68),1-Math.abs(u-.68));
  return String.fromCharCode(Math.round(255*Math.exp(-((du/.2)**4+((v-.42)/.32)**4))));
}).join(''))};
PRESETS.push(
  preset('coral-study','Coral study','vase','A pinched ceramic form with layered, flowing folds.',{
    objectType:'vase',profile:'custom',height:178,diameter:146,wallThickness:3.4,baseThickness:3.5,baseMode:'closed',rimHeight:0,rimWidth:0,color:'#e3d7c4',pattern:'smooth',
    profilePoints:[{z:0,r:.42},{z:.18,r:.76},{z:.35,r:.78},{z:.49,r:.56},{z:.64,r:.9},{z:.8,r:1},{z:.92,r:.96},{z:1,r:.83}],
    effects:[effectPreset('coral-folds','coral',{depthBottom:2.7,depthTop:6.5,count:32,rows:2,twist:24,twistEase:1.5,sharpness:1.3,fade:0,variation:.22,seed:17}),effectPreset('coral-fine-ribs','ribs',{depthBottom:.35,depthTop:.7,count:64,rows:3,twist:29,phase:32,sharpness:1.1,start:.12,end:1,fade:.04})]
  }),
  preset('braided-vase','Braided vase','vase','Crossing helical strands with a quiet collar.',{
    objectType:'vase',profile:'hourglass',height:205,diameter:135,bottomRatio:.85,topRatio:.8,belly:.22,wallThickness:2.8,baseMode:'closed',color:'#d9d1bf',pattern:'smooth',
    effects:[effectPreset('braided-body','braided',{depthBottom:2.5,depthTop:3.7,count:22,rows:6,sharpness:3,start:.03,end:.9,fade:.08}),effectPreset('braided-collar','ribs',{depthBottom:.5,depthTop:1.1,count:44,rows:1,start:.86,end:1,fade:.2,twist:6})]
  }),
  preset('honeycomb-planter','Honeycomb planter','planter','Hexagonal relief framed by smooth upper and lower bands.',{
    profile:'barrel',height:145,diameter:165,bottomRatio:.8,topRatio:1,belly:.12,wallThickness:2.6,pattern:'smooth',color:'#b4c0a7',
    effects:[effectPreset('honeycomb-panel','honeycomb',{depthBottom:1.8,depthTop:2.8,count:20,rows:9,start:.13,end:.9,fade:.1,sharpness:2.2})]
  }),
  preset('layered-pleats','Layered pleats','lampshade','Fine pleats build in depth and twist toward the rim.',{
    objectType:'lampshade',profile:'trumpet',height:195,diameter:195,bottomRatio:.6,topRatio:1,belly:.12,wallThickness:2.2,baseThickness:2.6,baseMode:'mount',holeDiameter:42,rimHeight:0,rimWidth:0,color:'#e9dfc8',pattern:'smooth',
    effects:[effectPreset('pleats-structure','ribs',{depthBottom:1.2,depthTop:4.8,count:48,rows:3,twist:85,twistEase:1.8,sharpness:1.35,fade:0}),effectPreset('pleats-weave','waves',{depthBottom:.2,depthTop:.9,count:24,rows:4,twist:-35,sharpness:1.8,start:.25,end:.94,fade:.15})]
  }),
  preset('drifting-vessel','Drifting vessel','vase','A leaning ellipse with a gradual rotation and a local relief patch.',{
    objectType:'vase',profile:'barrel',crossSection:'ellipse',aspectRatio:1.12,aspectRatioTop:1.7,height:195,diameter:145,bottomRatio:.7,topRatio:.78,belly:.25,twistBottom:-15,twistTop:70,twistEase:1.6,leanX:28,leanY:8,wallThickness:2.8,baseMode:'closed',color:'#bdc9c5',pattern:'smooth',
    effects:[effectPreset('drifting-patch','organic',{depthBottom:1.4,depthTop:2.5,count:13,rows:4,twist:15,variation:.45,seed:13,mask:accentMask,fade:.04})]
  }),
  preset('chevron-bowl','Chevron bowl','bowl','Crisp directional relief on a broad custom bowl.',{
    objectType:'bowl',profile:'custom',height:82,diameter:205,wallThickness:3.2,baseThickness:3.5,baseMode:'closed',color:'#d4b8a5',pattern:'smooth',
    profilePoints:[{z:0,r:.5},{z:.25,r:.68},{z:.55,r:.9},{z:.8,r:1},{z:1,r:.98}],
    effects:[effectPreset('chevron-relief','chevron',{depthBottom:1,depthTop:2.1,count:28,rows:3,twist:12,sharpness:1.7,start:.08,end:.92,fade:.1})]
  }),
  preset('tidal-vase','Tidal vase','vase','Organic relief with a restrained vertical wave distortion.',{
    objectType:'vase',profile:'bulb',height:205,diameter:140,bottomRatio:.6,topRatio:.48,belly:.5,bellyPosition:.5,wallThickness:3,baseMode:'closed',color:'#aebcc9',pattern:'smooth',zWaveAmplitude:1.4,zWaveCount:10,zWaveRows:2,zWavePhase:38,zWaveFade:.2,
    effects:[effectPreset('tidal-organic','organic',{depthBottom:1.5,depthTop:2.6,count:18,rows:5,twist:35,variation:.35,seed:71,sharpness:1.2,fade:.04}),effectPreset('tidal-ripples','ripples',{depthBottom:.4,depthTop:.6,count:8,rows:18,sharpness:1,start:.12,end:.91,fade:.09})]
  }),
  preset('image-contour-cup','Image contour cup','organiser','An editable grayscale image becomes real surface relief.',{
    objectType:'organiser',profile:'cylinder',height:120,diameter:100,wallThickness:2.6,baseMode:'closed',color:'#c6ad91',pattern:'smooth',
    effects:[effectPreset('image-contour','image',{image:contourTile,imageMode:'relief',depthBottom:1.1,depthTop:2.2,count:24,rows:4,start:.05,end:.96,fade:.07})]
  })
);

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const integerKeys=new Set(['sides','lobes','patternCount','patternRows','perforationCount','perforationRows','zWaveCount','zWaveRows']);
const effectIntegers=new Set(['count','rows','seed','imageRepeatX','imageRepeatY']);
export function normalizeRaster(input,kind='mask') {
  if(input===undefined||input===null)return null;
  const maximum=kind==='image'?128:64;
  if(!input||typeof input!=='object'||!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<2||input.height<2||input.width>maximum||input.height>maximum||typeof input.data!=='string'||input.data.length>Math.ceil(maximum*maximum/3)*4+4)throw new Error(`Invalid ${kind} raster. Use a ${maximum} × ${maximum} pixel or smaller grayscale map.`);
  let decoded;try{decoded=atob(input.data);}catch{throw new Error(`The ${kind} map could not be decoded. Re-import or repaint it.`);}
  if(decoded.length!==input.width*input.height)throw new Error(`The ${kind} map size does not match its pixel data. Re-import or repaint it.`);
  return {width:input.width,height:input.height,data:input.data,...(kind==='image'?{name:typeof input.name==='string'?input.name.slice(0,120):'Image map'}:{invert:input.invert===true})};
}
export function normalizeEffect(input={},index=0) {
  if(!input||typeof input!=='object'||Array.isArray(input))input={};
  const e={...EFFECT_DEFAULTS};
  for(const [key,[a,b]] of Object.entries(EFFECT_LIMITS)){
    let value=Number(input[key]);if(input[key]===undefined||input[key]===null||input[key]===''||!Number.isFinite(value))value=EFFECT_DEFAULTS[key];
    e[key]=effectIntegers.has(key)?Math.round(clamp(value,a,b)):clamp(value,a,b);
  }
  e.id=typeof input.id==='string'&&input.id.trim()?input.id.trim().slice(0,64):`effect-${index+1}`;
  e.enabled=input.enabled!==false;e.pattern=OPTIONS.pattern.includes(input.pattern)?input.pattern:EFFECT_DEFAULTS.pattern;
  e.blend=['add','max','replace'].includes(input.blend)?input.blend:'add';
  e.end=Math.max(e.end,e.start+0.03);
  e.mask=normalizeRaster(input.mask,'mask');e.image=normalizeRaster(input.image,'image');
  e.imageMode=input.imageMode==='folds'?'folds':'relief';e.imageInvert=input.imageInvert===true;
  e.legacyEdgeFade=input.legacyEdgeFade===true;
  return e;
}
export function createEffectFromLegacy(input={},id='effect-1') {
  const p=normalizeParams(input);
  return normalizeEffect({id,pattern:p.pattern,depthBottom:p.patternDepth,depthTop:p.patternDepth,count:p.patternCount,rows:p.patternRows,twist:p.patternTwist,sharpness:p.patternSharpness,fade:0,legacyEdgeFade:true});
}
export function normalizeParams(input={}) {
  if (!input || typeof input!=='object' || Array.isArray(input)) input={};
  const p={...DEFAULTS};
  for(const [key,[a,b]] of Object.entries(LIMITS)) {
    let n=Number(input[key]); if(input[key]===undefined||input[key]===null||input[key]===''||!Number.isFinite(n)) n=DEFAULTS[key];
    p[key]=integerKeys.has(key)?Math.round(clamp(n,a,b)):clamp(n,a,b);
  }
  for(const [key,values] of Object.entries(OPTIONS)) p[key]=values.includes(input[key])?input[key]:DEFAULTS[key];
  for(const [key,a,b] of [['twistTop',-720,720],['aspectRatioTop',0.35,2.8]])p[key]=input[key]===undefined||input[key]===null||input[key]===''||!Number.isFinite(Number(input[key]))?null:clamp(Number(input[key]),a,b);
  p.effects=Array.isArray(input.effects)?input.effects.slice(0,4).map(normalizeEffect):null;
  p.name=typeof input.name==='string'?input.name.trim().slice(0,100)||'Untitled design':DEFAULTS.name;
  p.color=typeof input.color==='string'&&/^#[0-9a-f]{6}$/i.test(input.color)?input.color:DEFAULTS.color;
  const pts=Array.isArray(input.profilePoints)?input.profilePoints:DEFAULTS.profilePoints;
  p.profilePoints=pts.slice(0,12).filter(v=>v&&Number.isFinite(Number(v.z))&&Number.isFinite(Number(v.r))).map(v=>({z:clamp(Number(v.z),0,1),r:clamp(Number(v.r),0.12,1.5)})).sort((a,b)=>a.z-b.z);
  p.profilePoints=p.profilePoints.filter((v,i,a)=>i===0||v.z-a[i-1].z>0.015);
  if(p.profilePoints.length<2)p.profilePoints=DEFAULTS.profilePoints.map(v=>({...v}));
  p.profilePoints[0].z=0; p.profilePoints.at(-1).z=1;
  return p;
}

function customCurve(points,interpolation='smooth') {
  // Shape-preserving monotone cubic Hermite interpolation, with no negative overshoot.
  const n=points.length,d=[],m=[];
  for(let i=0;i<n-1;i++)d.push((points[i+1].r-points[i].r)/(points[i+1].z-points[i].z));
  m[0]=d[0];m[n-1]=d[n-2];
  for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]<=0?0:2*d[i-1]*d[i]/(d[i-1]+d[i]);
  return t=>{let i=0;while(i<n-2&&t>points[i+1].z)i++;const a=points[i],b=points[i+1],h=b.z-a.z,u=clamp((t-a.z)/h,0,1),u2=u*u,u3=u2*u;if(interpolation==='linear')return lerp(a.r,b.r,u);return clamp((2*u3-3*u2+1)*a.r+(u3-2*u2+u)*h*m[i]+(-2*u3+3*u2)*b.r+(u3-u2)*h*m[i+1],Math.min(a.r,b.r),Math.max(a.r,b.r));};
}

function profileFunction(p) {
  const custom=customCurve(p.profilePoints,p.profileInterpolation);
  const f=t=>{
    const s=Math.sin(Math.PI*t),baseline=lerp(p.bottomRatio,p.topRatio,t);
    const bump=t<p.bellyPosition?Math.sin(Math.PI/2*t/p.bellyPosition):Math.sin(Math.PI/2*(1-t)/(1-p.bellyPosition));
    switch(p.profile){
      case 'custom':return custom(t);
      case 'cylinder':return 1;
      case 'barrel':return baseline+p.belly*s;
      case 'bulb':return baseline+p.belly*bump**1.4;
      case 'hourglass':return Math.max(0.12,baseline-p.belly*s);
      case 'trumpet':return lerp(p.bottomRatio,p.topRatio,t**2.4)+p.belly*s*0.25;
      case 'bowl':return lerp(p.bottomRatio,p.topRatio,Math.sin(t*Math.PI/2)**0.85)+p.belly*s*0.25;
      default:return baseline;
    }
  };
  let max=0;for(let i=0;i<=512;i++)max=Math.max(max,f(i/512));
  return t=>p.diameter/2*f(t)/max;
}
export function sampleProfile(input={},count=9) {
  const p=normalizeParams(input);if(p.profile==='custom')return p.profilePoints.map(v=>({...v}));
  const n=Math.round(clamp(Number(count)||9,2,12)),radius=profileFunction(p);
  return Array.from({length:n},(_,i)=>({z:i/(n-1),r:radius(i/(n-1))/(p.diameter/2)}));
}

function sectionRadius(p,a,t=0) {
  switch(p.crossSection){
    case 'ellipse':{const aspect=p.aspectRatioTop===null?p.aspectRatio:lerp(p.aspectRatio,p.aspectRatioTop,t),x=Math.min(1,aspect),y=Math.min(1,1/aspect);return 1/Math.hypot(Math.cos(a)/x,Math.sin(a)/y);}
    case 'rounded-square':{const e=2+10*(1-p.cornerRadius);return (Math.abs(Math.cos(a))**e+Math.abs(Math.sin(a))**e)**(-1/e);}
    case 'polygon':{const step=TAU/p.sides,phase=((a+step/2)%step+step)%step-step/2;return Math.cos(Math.PI/p.sides)/Math.cos(phase);}
    case 'star':return 1-p.lobeDepth*(0.5-0.5*Math.cos(p.lobes*a));
    default:return 1;
  }
}

function patternOffset(p,t,a) {
  if(!['smooth','ribs','flutes','waves','diamonds','ripples','scales','woven','dimples'].includes(p.pattern))return advancedPatternOffset(p,t,a);
  if(p.pattern==='smooth'||p.patternDepth===0)return 0;
  const u=p.patternCount*(a-p.patternTwist*Math.PI/180*t),v=TAU*p.patternRows*t;
  const wave=(x)=>0.5+0.5*Math.cos(x);
  let f=0;
  switch(p.pattern){
    case 'ribs':f=wave(u)**p.patternSharpness;break;
    case 'flutes':f=-(wave(u)**p.patternSharpness);break;
    case 'waves':f=wave(u+1.6*Math.sin(v))**p.patternSharpness;break;
    case 'diamonds':f=Math.max(0,1-(Math.abs(Math.sin(u/2))+Math.abs(Math.sin(v/2))))**Math.max(0.5,p.patternSharpness*.65);break;
    case 'ripples':f=wave(v+0.45*Math.sin(u))**p.patternSharpness;break;
    case 'scales':f=wave(v+1.2*Math.cos(u))*(wave(u)**Math.max(0.5,p.patternSharpness*.6));break;
    case 'woven':f=(0.5+0.5*Math.sin(u+v)*Math.sin(u-v))**p.patternSharpness;break;
    case 'dimples':f=-Math.exp(-((1-Math.cos(u))+(1-Math.cos(v)))*Math.max(1,p.patternSharpness*2));break;
  }
  const fade=smooth(0,Math.min(0.08,3/p.height),t)*(1-smooth(1-Math.min(0.08,Math.max(1,p.rimHeight)/p.height),1,t));
  return p.patternDepth*f*fade;
}

function decodeRaster(raster){
  if(!raster)return null;
  const binary=atob(raster.data),pixels=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)pixels[i]=binary.charCodeAt(i);
  return {...raster,pixels};
}
function sampleRaster(raster,u,v,wrapY=false){
  const w=raster.width,h=raster.height;
  u=((u%1)+1)%1;
  const x=u*w,x0=Math.floor(x)%w,x1=(x0+1)%w,fx=x-Math.floor(x);
  let y;if(wrapY)y=(((1-v)%1)+1)%1*h;else y=(1-clamp(v,0,1))*(h-1);
  const y0=wrapY?Math.floor(y)%h:Math.min(h-1,Math.floor(y)),y1=wrapY?(y0+1)%h:Math.min(h-1,y0+1),fy=y-Math.floor(y);
  const value=lerp(lerp(raster.pixels[y0*w+x0],raster.pixels[y0*w+x1],fx),lerp(raster.pixels[y1*w+x0],raster.pixels[y1*w+x1],fx),fy)/255;
  return raster.invert?1-value:value;
}
function effectField(e,t,a,image=null,globalT=t){
  const phase=e.phase*Math.PI/180,seed=e.seed*0.618033988749895;
  let u=e.count*(a-e.twist*Math.PI/180*t**e.twistEase)+phase;
  const v=TAU*e.rows*t,wave=x=>0.5+0.5*Math.cos(x),sharp=e.sharpness;
  if(e.variation)u+=e.variation*(0.9*Math.sin(3*a+v*.37+seed)+.55*Math.sin(5*a-v*.23+seed*1.31));
  let f=0;
  switch(e.pattern){
    case 'smooth':return 0;
    case 'ribs':f=wave(u)**sharp;break;
    case 'flutes':f=-(wave(u)**sharp);break;
    case 'waves':f=wave(u+1.6*Math.sin(v))**sharp;break;
    case 'diamonds':f=Math.max(0,1-(Math.abs(Math.sin(u/2))+Math.abs(Math.sin(v/2))))**Math.max(.5,sharp*.65);break;
    case 'ripples':f=wave(v+.45*Math.sin(u))**sharp;break;
    case 'scales':f=wave(v+1.2*Math.cos(u))*(wave(u)**Math.max(.5,sharp*.6));break;
    case 'woven':f=(.5+.5*Math.sin(u+v)*Math.sin(u-v))**sharp;break;
    case 'dimples':f=-Math.exp(-((1-Math.cos(u))+(1-Math.cos(v)))*Math.max(1,sharp*2));break;
    case 'coral':{
      const fold=u+4.2*Math.sin(v*.45+1.45*Math.sin(3*a+seed))+1.1*Math.sin(v+5*a+seed*.37);
      f=wave(fold)**sharp*(.7+.3*Math.cos(v*.5+2*a+seed)**2);break;
    }
    case 'braided':f=Math.max(wave(u+v),wave(u-v))**sharp;break;
    case 'chevron':f=wave(u-1.8*Math.asin(Math.sin(v)))**sharp;break;
    case 'honeycomb':{
      const x=u/TAU,y=v/TAU*Math.sqrt(3)/2,row=Math.round(y/(Math.sqrt(3)/2));
      let best=Infinity,dx=0,dy=0;
      for(let j=row-1;j<=row+1;j++){
        const shift=((j%2)+2)%2*.5,cx=Math.round(x-shift)+shift,cy=j*Math.sqrt(3)/2;
        const qx=x-cx,qy=y-cy,d=qx*qx+qy*qy;if(d<best){best=d;dx=qx;dy=qy;}
      }
      const gauge=2*Math.max(Math.abs(dx),Math.abs(.5*dx+Math.sqrt(3)/2*dy),Math.abs(.5*dx-Math.sqrt(3)/2*dy));
      f=Math.exp(-(((1-gauge)*(2.5+sharp*2))**2));break;
    }
    case 'organic':{
      const f1=Math.sin(u+1.4*Math.sin(3*a+v*.4+seed));
      const f2=.55*Math.sin((e.count+3)*a-v*.73+seed*1.73),f3=.3*Math.sin((e.count*2-1)*a+v*1.3+seed*2.17);
      f=clamp(.5+.5*(f1+f2+f3)/1.85,0,1)**Math.max(.4,sharp*.7);break;
    }
    case 'image':{
      if(!image)throw new Error('The image layer needs an image map. Import a grayscale or colour image first.');
      let value=sampleRaster(image,a/TAU*e.imageRepeatX+e.imageOffsetX,globalT*e.imageRepeatY+e.imageOffsetY,e.imageRepeatY!==1||e.imageOffsetY!==0);
      if(e.imageInvert)value=1-value;
      f=e.imageMode==='folds'?wave(u+v+Math.PI*value)**sharp:value;break;
    }
  }
  if(e.variation)f*=1-e.variation*.35+e.variation*.35*wave(2*a-v*.29+seed*.71);
  return f;
}
function advancedPatternOffset(p,t,a){
  const e={...EFFECT_DEFAULTS,pattern:p.pattern,depthBottom:p.patternDepth,depthTop:p.patternDepth,count:p.patternCount,rows:p.patternRows,twist:p.patternTwist,sharpness:p.patternSharpness};
  const fade=smooth(0,Math.min(.08,3/p.height),t)*(1-smooth(1-Math.min(.08,Math.max(1,p.rimHeight)/p.height),1,t));
  return p.patternDepth*effectField(e,t,a)*fade;
}
function compileEffects(p){
  if(p.effects===null)return null;
  const layers=p.effects.filter(e=>e.enabled).map(e=>({e,mask:decodeRaster(e.mask),image:decodeRaster(e.image)}));
  for(const {e,image} of layers)if(e.pattern==='image'&&!image)throw new Error('The image layer needs an image map. Import a grayscale or colour image first.');
  return (t,a)=>{
    let total=0;
    for(const {e,mask,image} of layers){
      if(t<e.start||t>e.end)continue;
      const local=clamp((t-e.start)/(e.end-e.start),0,1);
      let weight=e.fade>0?smooth(0,e.fade,local)*(1-smooth(1-e.fade,1,local)):1;
      if(mask)weight*=sampleRaster(mask,a/TAU,t);
      if(e.legacyEdgeFade)weight*=smooth(0,Math.min(.08,3/p.height),t)*(1-smooth(1-Math.min(.08,Math.max(1,p.rimHeight)/p.height),1,t));
      if(weight<=0)continue;
      const value=lerp(e.depthBottom,e.depthTop,local)*effectField(e,local,a,image,t);
      if(e.blend==='replace')total=lerp(total,value,weight);
      else if(e.blend==='max')total=lerp(total,Math.max(total,value),weight);
      else total+=weight*value;
    }
    return total;
  };
}

function buildZWave(p){
  const floor=p.baseMode==='open'?0:p.footHeight+p.baseThickness,span=p.height-floor;
  const coefficient=(1.5/p.zWaveFade+TAU*p.zWaveRows)/span,maxAmplitude=Math.min(8,.55/coefficient),bound=p.zWaveAmplitude*coefficient;
  if(p.zWaveAmplitude===0)return {bound:0,maxAmplitude:Math.max(0,maxAmplitude),warp:(z)=>z};
  if(span<=0||bound>.55000001)throw new Error(`Z-wave amplitude is too large for this height and frequency. Use ${(Math.floor(Math.max(0,maxAmplitude)*100)/100).toFixed(2)} mm or less, reduce rows, or increase height / fade.`);
  return {bound,maxAmplitude,warp:(z,a)=>{
    if(z<=floor||z>=p.height)return z;
    const s=(z-floor)/span,envelope=smooth(0,p.zWaveFade,s)*(1-smooth(1-p.zWaveFade,1,s));
    return z+p.zWaveAmplitude*envelope*Math.sin(p.zWaveCount*a+TAU*p.zWaveRows*s+p.zWavePhase*Math.PI/180);
  }};
}
/** Map a world-space hit back to the undeformed paint/image UV convention.
 * u wraps around the vessel; v=0 is the top image row; height=1-v.
 */
export function surfaceUV(point,input={}){
  const p=normalizeParams({...input,effects:null});
  const x=Number(Array.isArray(point)?point[0]:point.x),y=Number(Array.isArray(point)?point[1]:point.y),z=Number(Array.isArray(point)?point[2]:point.z);
  const localX=x-p.leanX*z/p.height,localY=y-p.leanY*z/p.height;
  const a=Math.atan2(localY,localX),u=((a/TAU)%1+1)%1;
  let originalZ=z;
  if(p.zWaveAmplitude>0){const wave=buildZWave(p);let lo=0,hi=p.height;for(let i=0;i<28;i++){const mid=(lo+hi)/2;if(wave.warp(mid,a)<z)lo=mid;else hi=mid;}originalZ=(lo+hi)/2;}
  const height=clamp(originalZ/p.height,0,1);return {u,v:1-height,height};
}

/** Returns a radially sampled, closed, consistently oriented material mesh. */
export function generateMesh(input={},quality='preview') {
  const p=normalizeParams(input),warnings=[];
  const isPreview=OPTIONS.previewQuality.includes(quality);
  const q=isPreview?quality:OPTIONS.quality.includes(quality)?quality:p.quality;
  const spec={draft:[144,96,4,384,48,2,4],preview:[256,160,7,768,80,1.3,7],detail:[384,224,10,1024,120,.9,10],standard:[256,120,6,768,96,1,7],fine:[384,180,8,896,96,1,7],ultra:[512,240,10,1024,96,1,7]}[q];
  const activeEffects=p.effects===null?null:p.effects.filter(e=>e.enabled&&(e.blend==='replace'||e.pattern!=='smooth'&&(e.depthBottom>0||e.depthTop>0)));
  const angularFrequency=activeEffects===null?(p.pattern!=='smooth'?p.patternCount:0):Math.max(0,...activeEffects.map(e=>e.pattern==='image'&&e.image?Math.max(e.count,e.image.width*e.imageRepeatX/2):e.count*(e.pattern==='organic'?1.8:1)));
  const verticalFrequency=activeEffects===null?p.patternRows:Math.max(1,...activeEffects.map(e=>(e.pattern==='image'&&e.image?Math.max(e.rows,e.image.height*e.imageRepeatY/2):e.rows)/(e.end-e.start)));
  let n=Math.min(spec[3],Math.max(spec[0],angularFrequency*spec[2],p.perforation!=='none'?p.perforationCount*10:0));
  n=Math.ceil(n/4)*4;
  const m=Math.min(spec[1],Math.ceil(Math.max(spec[4],Math.ceil(p.height/spec[5]),verticalFrequency*spec[6],p.perforationRows*12)));
  const open=p.baseMode==='open',hasHole=p.baseMode==='drain'||p.baseMode==='mount';
  const foot=open?0:p.footHeight,floor=open?0:foot+p.baseThickness;
  if(p.height-floor<4)throw new Error('The base and foot leave too little room. Increase height or reduce base / foot height.');
  const zWave=buildZWave(p);
  const radius=profileFunction(p),twist=p.twist*Math.PI/180,stack=compileEffects(p);
  const advancedTwist=p.twistBottom!==0||p.twistTop!==null||p.twistEase!==1;
  const baseR=(z,a)=>{
    const t=z/p.height,angle=advancedTwist?lerp(p.twistBottom,p.twistTop===null?p.twistBottom+p.twist:p.twistTop,t**p.twistEase)*Math.PI/180:twist*z/p.height;
    return radius(t)*sectionRadius(p,a-angle,t)+(stack?stack(t,a):patternOffset(p,t,a));
  };
  const outerR=(z,a)=>baseR(z,a)+(p.rimHeight>0?p.rimWidth*smooth(p.height-p.rimHeight,p.height,z):0);
  const innerR=(z,a)=>baseR(z,a)-p.wallThickness;
  const zLevels=[];
  for(let k=0;k<=m;k++)zLevels.push(p.height*k/m);
  zLevels.push(floor);if(foot>0)zLevels.push(foot);
  if(p.profile==='custom'&&p.profileInterpolation==='linear')for(const point of p.profilePoints)zLevels.push(point.z*p.height);
  if(activeEffects)for(const e of activeEffects){zLevels.push(e.start*p.height,e.end*p.height);if(e.fade>0)zLevels.push((e.start+e.fade*(e.end-e.start))*p.height,(e.end-e.fade*(e.end-e.start))*p.height);}
  zLevels.sort((a,b)=>a-b);
  const zs=zLevels.filter((z,i,a)=>i===0||z-a[i-1]>1e-7);
  const floorK=zs.findIndex(z=>Math.abs(z-floor)<1e-6),topK=zs.length-1;
  const pos=[],tris=[],outer=[],inner=[],innerRadii=[],outerRadii=[],innerForOuter=new Map();
  let minCavity=Infinity,minOuter=Infinity,minFloor=Infinity,maxSlope=0;
  const add=(r,a,z)=>{const id=pos.length/3;pos.push(r*Math.cos(a),r*Math.sin(a),z);return id;};
  const face=(a,b,c)=>tris.push(a,b,c);
  const quad=(a,b,c,d)=>{face(a,b,c);face(a,c,d);};
  for(let k=0;k<zs.length;k++){
    outer[k]=[];outerRadii[k]=[];if(k>=floorK){inner[k]=[];innerRadii[k]=[];}
    for(let j=0;j<n;j++){
      const a=TAU*j/n,rb=baseR(zs[k],a),ro=rb+(p.rimHeight>0?p.rimWidth*smooth(p.height-p.rimHeight,p.height,zs[k]):0);minOuter=Math.min(minOuter,ro);outerRadii[k][j]=ro;
      if(ro<0.5)throw new Error('The profile becomes too narrow for this pattern. Increase diameter or reduce texture depth.');
      outer[k][j]=add(ro,a,zs[k]);
      if(k>=floorK){
        const ri=rb-p.wallThickness;minCavity=Math.min(minCavity,ri);innerRadii[k][j]=ri;
        if(ri<0.5)throw new Error('The wall or texture closes the cavity. Increase diameter, widen the narrow part, or reduce wall / texture depth.');
        inner[k][j]=add(ri,a,zs[k]);innerForOuter.set(outer[k][j],inner[k][j]);
        if(k===floorK)minFloor=Math.min(minFloor,ri);
      }
      if(k>0)maxSlope=Math.max(maxSlope,Math.abs(ro-outerRadii[k-1][j])/(zs[k]-zs[k-1]));
    }
  }
  const holes=Array.from({length:topK},()=>new Uint8Array(n));
  let cutCells=0;
  if(p.perforation!=='none'){
    const margin=Math.max(4,p.wallThickness*2,p.rimHeight+1);
    const low=floor+margin,high=p.height-margin;
    if(high-low<8)throw new Error('The vessel is too short for these windows. Increase height or remove perforations.');
    for(let k=floorK;k<topK;k++){
      const z=(zs[k]+zs[k+1])/2;
      // Keep full uncut rows at both ends so every opening is bounded.
      if(zs[k]<=low||zs[k+1]>=high)continue;
      const v=(z-low)/(high-low)*p.perforationRows;
      const dy=Math.abs((v-Math.floor(v))-0.5)*2;
      for(let j=0;j<n;j++){
        const u=(j+0.5)/n*p.perforationCount;
        const dx=Math.abs((u-Math.floor(u))-0.5)*2;
        const cut=p.perforation==='diamonds'?dx+dy<p.perforationSize*1.35:dx<p.perforationSize*0.58&&dy<p.perforationSize;
        holes[k][j]=cut?1:0;
      }
    }
    // Eliminate diagonal-only contacts, which would create non-manifold vertices.
    let changed=true,passes=0;
    while(changed&&passes++<4){changed=false;for(let k=floorK;k<topK-1;k++)for(let j=0;j<n;j++){
      const q=(j+1)%n,a=holes[k][j],b=holes[k][q],c=holes[k+1][j],d=holes[k+1][q];
      if(a&&d&&!b&&!c){holes[k][j]=0;changed=true;}
      if(b&&c&&!a&&!d){holes[k][q]=0;changed=true;}
    }}
    cutCells=holes.reduce((s,row)=>s+row.reduce((a,b)=>a+b,0),0);
    if(!cutCells)throw new Error('These windows are too small at this resolution. Increase window size or reduce the number of rows / columns.');
  }
  const bridge=(a,b)=>quad(b,a,innerForOuter.get(a),innerForOuter.get(b));
  for(let k=0;k<topK;k++)for(let j=0;j<n;j++){
    if(holes[k][j])continue;
    const next=(j+1)%n,a=outer[k][j],b=outer[k][next],c=outer[k+1][next],d=outer[k+1][j];
    quad(a,b,c,d);
    if(k>=floorK){
      quad(inner[k][j],inner[k+1][j],inner[k+1][next],inner[k][next]);
      if(k>floorK&&holes[k-1][j])bridge(a,b);
      if(k<topK-1&&holes[k+1][j])bridge(c,d);
      if(holes[k][(j+n-1)%n])bridge(d,a);
      if(holes[k][next])bridge(b,c);
    }
  }
  for(let j=0;j<n;j++){const next=(j+1)%n;quad(outer[topK][j],outer[topK][next],inner[topK][next],inner[topK][j]);}
  const annulus=(outside,inside,up)=>{for(let j=0;j<n;j++){const next=(j+1)%n;if(up)quad(outside[j],outside[next],inside[next],inside[j]);else quad(outside[j],inside[j],inside[next],outside[next]);}};
  const disk=(ring,z,up)=>{const center=add(0,0,z);for(let j=0;j<n;j++){const next=(j+1)%n;up?face(center,ring[j],ring[next]):face(center,ring[next],ring[j]);}};
  let underside=outer[0],undersideZ=0;
  if(open){annulus(outer[0],inner[0],false);}
  else{
    if(foot>0){
      const bottom=[],upper=[];
      for(let j=0;j<n;j++){
        const a=TAU*j/n;let r=Infinity;
        for(let t=0;t<=16;t++)r=Math.min(r,outerR(foot*t/16,a));
        r-=p.footInset;
        if(r<1)throw new Error('The recessed foot is too wide for the base. Reduce foot inset or widen the base.');
        bottom[j]=add(r,a,0);upper[j]=add(r,a,foot);
      }
      annulus(outer[0],bottom,false);
      for(let j=0;j<n;j++){const next=(j+1)%n;quad(bottom[j],upper[j],upper[next],bottom[next]);}
      underside=upper;undersideZ=foot;
      warnings.push('Recessed underside: inspect the first layers and bridging in your slicer.');
    }
    if(hasHole){
      const hr=p.holeDiameter/2;
      let minUnder=Infinity;for(const id of underside)minUnder=Math.min(minUnder,Math.hypot(pos[id*3],pos[id*3+1]));
      if(hr>=Math.min(minUnder,minFloor)-Math.max(1,p.wallThickness))throw new Error('The centre hole is too large for this base. Reduce hole diameter or widen the base.');
      const lower=[],upper=[];
      for(let j=0;j<n;j++){const a=TAU*j/n;lower[j]=add(hr,a,undersideZ);upper[j]=add(hr,a,floor);}
      annulus(underside,lower,false);annulus(inner[floorK],upper,true);
      for(let j=0;j<n;j++){const next=(j+1)%n;quad(lower[j],upper[j],upper[next],lower[next]);}
    }else{disk(underside,undersideZ,false);disk(inner[floorK],floor,true);}
  }
  const originalHeights=new Float32Array(pos.length/3);for(let i=0;i<originalHeights.length;i++)originalHeights[i]=pos[i*3+2]/p.height;
  if(p.zWaveAmplitude>0)for(let i=0;i<pos.length;i+=3)pos[i+2]=zWave.warp(pos[i+2],Math.atan2(pos[i+1],pos[i]));
  if(p.leanX!==0||p.leanY!==0)for(let i=0;i<pos.length;i+=3){const t=pos[i+2]/p.height;pos[i]+=p.leanX*t;pos[i+1]+=p.leanY*t;}
  // Compact away vertices inside perforations before statistics/export.
  const remap=new Int32Array(pos.length/3).fill(-1),packed=[],packedHeights=[];
  for(let i=0;i<tris.length;i++){const old=tris[i];if(remap[old]<0){remap[old]=packed.length/3;packed.push(pos[3*old],pos[3*old+1],pos[3*old+2]);packedHeights.push(originalHeights[old]);}tris[i]=remap[old];}
  const mesh={positions:new Float32Array(packed),indices:new Uint32Array(tris),surfaceHeight:new Float32Array(packedHeights),params:p};
  const stats=auditMesh(mesh);
  stats.minRadius=minOuter;
  stats.minimumCavityDiameter=2*minCavity;
  stats.rimInnerDiameter=2*Math.min(...innerRadii[topK]);
  stats.radialWallThickness=p.wallThickness;
  let normalWallEstimate=p.wallThickness;
  // First-order local normal projection of the radial wall, sampled on the
  // generated grid. This is informative, not a minimum-distance certification.
  for(let k=floorK;k<topK;k++)for(let j=0;j<n;j++){
    const a=TAU*j/n,r=innerRadii[k][j],rz=innerRadii[k+1][j],ra=innerRadii[k][(j+1)%n];
    const sz=(rz-r)/(zs[k+1]-zs[k])+(p.leanX*Math.cos(a)+p.leanY*Math.sin(a))/p.height,st=(ra-r)/(TAU/n*Math.max(0.5,r));
    normalWallEstimate=Math.min(normalWallEstimate,p.wallThickness/Math.sqrt(1+sz*sz+st*st));
  }
  normalWallEstimate*=1-zWave.bound;
  stats.sampledMinimumNormalWallEstimate=normalWallEstimate;
  stats.zWaveDerivativeBound=zWave.bound;stats.zWaveMaximumAmplitude=zWave.maxAmplitude;
  stats.maxSurfaceAngleDegrees=Math.atan(maxSlope+Math.hypot(p.leanX,p.leanY)/p.height)*180/Math.PI;
  stats.estimatedGrams=stats.volumeMm3/1000*1.24;
  stats.quality=q;
  stats.angularSegments=n;stats.heightSegments=topK;stats.activeEffects=activeEffects?.length??(p.pattern==='smooth'?0:1);
  stats.perforationWindows=(2-stats.eulerCharacteristic)/2-(open||hasHole?1:0);
  if(p.perforation!=='none'&&stats.perforationWindows!==p.perforationCount*p.perforationRows)throw new Error('These windows are too small at this resolution. Increase window size, reduce the number of rows / columns, or choose a finer export quality.');
  if(stats.dimensions.some(v=>v>256.001))warnings.push('Exceeds a 256 × 256 × 256 mm print volume in this orientation. Resize before printing.');
  if(p.wallThickness<1.2)warnings.push('Thin wall: check that your nozzle and chosen line width can print it.');
  if(activeEffects?.some(e=>e.pattern==='image'&&e.image&&(e.image.width*e.imageRepeatX>n||e.image.height*e.imageRepeatY>topK)))warnings.push('Image details are finer than this mesh resolution. Use a finer export or reduce image repeats.');
  if(Math.hypot(p.leanX,p.leanY)>p.diameter*.35)warnings.push('Large sideways lean: check stability and supports before printing.');
  if(normalWallEstimate<Math.min(1,p.wallThickness*0.65))warnings.push(`Radial wall setting: steep detail reduces the estimated local normal thickness to about ${normalWallEstimate.toFixed(2)} mm. Check thin walls in your slicer.`);
  if(stats.maxSurfaceAngleDegrees>55)warnings.push('Steep surface transitions: inspect overhangs and supports in your slicer.');
  if(p.perforation!=='none')warnings.push('Windows require bridge / overhang checks and make this vessel unsuitable for holding water.');
  if(p.baseMode==='drain')warnings.push('Drainage hole included. Use a saucer beneath plants.');
  if(p.objectType==='lampshade')warnings.push('For a cool-running LED light only. Check bulb clearance, mount fit and material temperature limits.');
  if(!stats.watertight||stats.components!==1)throw new Error('This combination did not produce a closed single-piece mesh. Adjust the shape or pattern.');
  stats.warnings=warnings;
  mesh.stats=stats;
  return mesh;
}

/** Independent edge/volume audit of the actual Float32 export coordinates. */
export function auditMesh(mesh) {
  const p=mesh.positions,idx=mesh.indices,n=p.length/3,edges=new Map(),parents=new Int32Array(n),used=new Uint8Array(n);
  for(let i=0;i<n;i++)parents[i]=i;
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parents[b]=a;};
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  let volume=0,degenerate=0,finite=true;
  for(let i=0;i<p.length;i++){finite&&=Number.isFinite(p[i]);lo[i%3]=Math.min(lo[i%3],p[i]);hi[i%3]=Math.max(hi[i%3],p[i]);}
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i],b=idx[i+1],c=idx[i+2];used[a]=used[b]=used[c]=1;join(a,b);join(b,c);
    const ax=p[3*a],ay=p[3*a+1],az=p[3*a+2],bx=p[3*b],by=p[3*b+1],bz=p[3*b+2],cx=p[3*c],cy=p[3*c+1],cz=p[3*c+2];
    volume+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
    const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(nx*nx+ny*ny+nz*nz<1e-16)degenerate++;
    for(const [u,v] of [[a,b],[b,c],[c,a]]){const key=Math.min(u,v)*n+Math.max(u,v),value=edges.get(key)||[0,0];value[0]++;value[1]+=u<v?1:-1;edges.set(key,value);}
  }
  let boundaryEdges=0,nonManifoldEdges=0,inconsistentEdges=0;
  for(const [count,orientation] of edges.values()){if(count===1)boundaryEdges++;if(count!==2)nonManifoldEdges++;if(orientation!==0)inconsistentEdges++;}
  const components=new Set();for(let i=0;i<n;i++)if(used[i])components.add(root(i));
  return {dimensions:hi.map((v,i)=>v-lo[i]),bounds:{min:lo,max:hi},vertices:n,triangles:idx.length/3,volumeMm3:volume,
    watertight:finite&&boundaryEdges===0&&nonManifoldEdges===0&&inconsistentEdges===0&&degenerate===0&&volume>0,
    components:components.size,boundaryEdges,nonManifoldEdges,inconsistentEdges,degenerateTriangles:degenerate,eulerCharacteristic:n-edges.size+idx.length/3};
}

export function encodeSTL(mesh) {
  const p=mesh.positions,idx=mesh.indices,buffer=new ArrayBuffer(84+idx.length/3*50),view=new DataView(buffer);
  const header='Form Studio binary STL; coordinates in millimetres; Z up';
  for(let i=0;i<header.length;i++)view.setUint8(i,header.charCodeAt(i));
  view.setUint32(80,idx.length/3,true);
  let offset=84;
  for(let t=0;t<idx.length;t+=3){
    const a=idx[t]*3,b=idx[t+1]*3,c=idx[t+2]*3;
    const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
    for(const val of [nx,ny,nz,p[a],p[a+1],p[a+2],p[b],p[b+1],p[b+2],p[c],p[c+1],p[c+2]]){view.setFloat32(offset,val,true);offset+=4;}
    view.setUint16(offset,0,true);offset+=2;
  }
  return buffer;
}
