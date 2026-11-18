/** Seeded, editable starting forms. All measurements are millimetres.
 * Conservative parameter ranges keep unlocked designs inside a 240 mm box.
 * This is a design generator, not a support or material suitability check.
 */
import {DEFAULTS, EFFECT_DEFAULTS, normalizeParams} from './geometry.js';

export const RANDOM_KINDS = Object.freeze(['any','vase','planter','bowl','lampshade','container']);
const KINDS = RANDOM_KINDS.slice(1);
const COLORS = ['#ff956b','#f4b789','#f6c5bc','#cfb9f5','#9cbddf','#9cc6b9','#ebcf91'];
const PATTERNS = ['ribs','flutes','waves','diamonds','ripples','scales','woven','dimples','coral','braided','chevron','honeycomb','organic'];
const LABELS = {vase:'vase',planter:'plant pot',bowl:'bowl',lampshade:'lampshade',container:'desk pot'};
const PATTERN_NAMES = {ribs:'Ribbed',flutes:'Fluted',waves:'Wavy',diamonds:'Diamond',ripples:'Ripple',scales:'Scalloped',woven:'Woven',dimples:'Dimpled',coral:'Coral',braided:'Braided',chevron:'Chevron',honeycomb:'Honeycomb',organic:'Organic'};
const PROFILES = {
  vase:[
    [[0,.55],[.18,.83],[.43,1],[.66,.9],[.84,.5],[1,.4]],
    [[0,.64],[.2,.88],[.44,.66],[.68,1],[.86,.9],[1,.74]],
    [[0,.72],[.3,.76],[.68,.98],[1,.64]],
    [[0,.6],[.2,.82],[.48,1],[.73,.82],[.88,.47],[1,.5]],
    [[0,.72],[.25,.62],[.55,.72],[.85,.88],[1,1]],
    [[0,.68],[.2,.82],[.48,.86],[.73,.72],[1,.88]]
  ],
  planter:[
    [[0,.74],[.25,.82],[.62,.94],[1,1]],
    [[0,.8],[.28,.97],[.65,1],[1,.9]],
    [[0,.9],[.24,.92],[.72,.94],[1,1]],
    [[0,.83],[.32,1],[.6,.85],[1,.97]],
    [[0,.72],[.2,.8],[.72,.88],[1,1]]
  ],
  bowl:[
    [[0,.62],[.25,.72],[.6,.9],[1,1]],
    [[0,.7],[.3,.85],[.7,1],[1,.96]],
    [[0,.78],[.35,.86],[1,1]],
    [[0,.68],[.24,.8],[.72,.98],[1,.94]]
  ],
  lampshade:[
    [[0,.76],[.3,.8],[.7,.92],[1,1]],
    [[0,1],[.3,.9],[.7,.79],[1,.76]],
    [[0,.82],[.3,.96],[.65,1],[1,.82]],
    [[0,.9],[.28,.82],[.64,.8],[1,.95]]
  ],
  container:[
    [[0,.92],[.3,.94],[.7,.96],[1,1]],
    [[0,.84],[.28,.96],[.7,1],[1,.91]],
    [[0,.86],[.3,.88],[.7,.94],[1,1]],
    [[0,.94],[.3,1],[.68,.9],[1,.96]]
  ]
};

function seedValue(value) {
  if(value===undefined||value===null){
    if(globalThis.crypto?.getRandomValues)return crypto.getRandomValues(new Uint32Array(1))[0];
    return (Date.now()^Math.floor(Math.random()*0x100000000))>>>0;
  }
  if(typeof value==='number'&&Number.isFinite(value))return value>>>0;
  let hash=2166136261;
  for(const char of String(value)){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}

function seededRandom(seed){
  let state=seed;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const round=(value,places=2)=>Number(value.toFixed(places));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/**
 * Generate a complete new design without modifying current.
 * keepDimensions preserves height and nominal body diameter, not exact bounds:
 * patterns, cross-section and lean can change the final outside measurements.
 * Return the seed if the caller wants to offer reproducible variations.
 */
export function randomiseDesign({seed,kind='any',current=null,keepDimensions=false}={}) {
  seed=seedValue(seed);
  const random=seededRandom(seed),pick=list=>list[Math.floor(random()*list.length)];
  const between=(a,b)=>a+(b-a)*random(),integer=(a,b)=>Math.floor(between(a,b+1));
  if(!KINDS.includes(kind))kind=pick(KINDS);
  const ranges={vase:[150,230,85,155],planter:[95,175,110,185],bowl:[48,88,145,205],lampshade:[135,220,135,190],container:[75,130,75,125]}[kind];
  let height=integer(ranges[0],ranges[1]),diameter=integer(ranges[2],ranges[3]);
  if(keepDimensions&&current){
    const dimensions=normalizeParams({height:current.height,diameter:current.diameter});
    height=dimensions.height;diameter=dimensions.diameter;
  }
  const tiny=diameter<45||height<28;
  let crossSection=tiny?'circle':pick(kind==='container'?['circle','ellipse','rounded-square','rounded-square','polygon']:['circle','circle','ellipse','rounded-square','polygon','star']);
  // A rotating rounded square can be wider on the diagonal than its diameter.
  if(!keepDimensions&&crossSection==='rounded-square')diameter=Math.min(diameter,148);
  const aspects=pick([[1.08,1.25],[1.3,1.12],[1.2,1.45],[1.45,1.3]]);
  const template=pick(PROFILES[kind]);
  let profilePoints=template.map(([z,r])=>({z,r:round(clamp(r+between(-.035,.035),.38,1.04),3)}));
  if(tiny||height/diameter<.2)profilePoints=profilePoints.map(v=>({...v,r:round(.9+v.r*.1,3)}));
  const minProfile=Math.min(...profilePoints.map(v=>v.r))/Math.max(...profilePoints.map(v=>v.r));
  const sides=pick([5,6,7,8,10]),lobes=pick([5,6,8,10]),lobeDepth=round(between(.07,.16));
  const minSection=crossSection==='ellipse'?1/Math.max(...aspects):crossSection==='polygon'?Math.cos(Math.PI/sides):crossSection==='star'?1-lobeDepth:1;
  const minimumRadius=diameter/2*minProfile*minSection;
  const wallThickness=round(tiny?1.2:kind==='lampshade'?between(1.8,2.4):between(2.2,3.2));
  const baseThickness=round(Math.min(height*.12,kind==='bowl'?between(3,4):between(2.8,3.6)));
  const bodyDepth=Math.min(between(2,4.6),diameter*.035,Math.max(.12,(minimumRadius-wallThickness-1.5)*.45));
  const layerCount=pick([1,1,2,2,2,3]);
  const mainPattern=pick(PATTERNS);
  const effects=[];
  for(let index=0;index<layerCount;index++){
    const pattern=index===0?mainPattern:pick(['ribs','waves','ripples','woven','organic','chevron']);
    const depth=bodyDepth*(index===0?1:index===1?.3:.15);
    const start=index===0?0:index===1?pick([.08,.18,.42]):.76;
    const end=index===0?1:index===1?pick([.76,.9,.98]):1;
    effects.push({...EFFECT_DEFAULTS,id:`random-${seed.toString(16)}-${index+1}`,pattern,
      blend:index===0?'add':pick(['add','add','max']),
      depthBottom:round(depth*between(.55,1)),depthTop:round(depth*between(.65,1.2)),
      count:pick(pattern==='coral'?[18,22,28,32]:pattern==='honeycomb'?[12,16,20,24]:[12,16,20,24,28,32,36,40]),
      rows:pattern==='ripples'?integer(5,14):pattern==='coral'?integer(1,3):integer(2,8),
      twist:round(between(-80,80),1),twistEase:round(between(.8,1.8)),phase:integer(0,359),
      sharpness:round(between(.8,2.3)),start,end,fade:index===0?round(between(.045,.1)):round(between(.1,.2)),
      variation:round(between(0,pattern==='organic'||pattern==='coral'?.45:.15)),seed:integer(0,99999),mask:null,image:null
    });
  }
  let baseMode=kind==='lampshade'?pick(['mount','mount','open']):kind==='planter'?pick(['drain','drain','closed']):'closed';
  const maxNegativeDepth=effects.filter(e=>e.pattern==='flutes'||e.pattern==='dimples').reduce((sum,e)=>sum+Math.max(e.depthBottom,e.depthTop),0);
  const holeAllowance=2*(minimumRadius-wallThickness*2-maxNegativeDepth-2);
  let holeDiameter=round(Math.max(1,Math.min(kind==='lampshade'?42:between(6,11),holeAllowance)));
  if(holeAllowance<2&&baseMode!=='open')baseMode='closed';
  const hasFoot=!tiny&&height>45&&kind!=='lampshade'&&random()<.18;
  const footHeight=hasFoot?round(between(1,2)):0;
  const footInset=hasFoot?round(Math.min(between(2,4),minimumRadius*.18)):2;
  const leanScale=!tiny&&kind==='vase'?.065:0;
  const leanX=round(diameter*leanScale*between(-1,1)),leanY=round(diameter*leanScale*between(-.5,.5));
  const twistBottom=round(between(-12,12),1),twistTop=round(twistBottom+between(-65,65),1);
  const zWaveRows=integer(1,3),zWaveFade=.2;
  const floor=baseMode==='open'?0:footHeight+baseThickness;
  const zWaveCap=.24*(height-floor)/(1.5/zWaveFade+Math.PI*2*zWaveRows);
  const zWaveAmplitude=!tiny&&kind==='vase'&&random()<.22?round(Math.min(1.4,zWaveCap)*between(.45,1)):0;
  const name=`${PATTERN_NAMES[mainPattern]} ${LABELS[kind]} · ${seed.toString(16).padStart(8,'0').toUpperCase()}`;
  const params=normalizeParams({...DEFAULTS,name,objectType:kind==='container'?'organiser':kind,
    height,diameter,profile:'custom',profilePoints,profileInterpolation:'smooth',crossSection,
    aspectRatio:aspects[0],aspectRatioTop:aspects[1],sides,cornerRadius:round(between(.45,.85)),lobes,lobeDepth,
    twist:0,twistBottom:tiny?0:twistBottom,twistTop:tiny?0:twistTop,twistEase:round(between(.8,1.7)),leanX,leanY,
    effects,pattern:'smooth',patternDepth:0,wallThickness,baseThickness,baseMode,holeDiameter,footHeight,footInset,
    rimHeight:tiny?0:round(between(1,3)),rimWidth:tiny?0:round(between(.3,.9)),perforation:'none',
    zWaveAmplitude,zWaveRows,zWaveFade,zWaveCount:pick([6,8,10,12]),zWavePhase:integer(0,359),
    color:pick(COLORS),quality:current?.quality||DEFAULTS.quality,previewQuality:current?.previewQuality||DEFAULTS.previewQuality
  });
  return {params,name,seed,kind};
}
