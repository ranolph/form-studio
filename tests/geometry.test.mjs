import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DEFAULTS,PRESETS,OPTIONS,normalizeParams,normalizeEffect,normalizeRaster,createEffectFromLegacy,sampleProfile,surfaceUV,generateMesh,encodeSTL} from '../static/geometry.js';

let checks=0;
function checkMesh(params,quality='preview'){
  const mesh=generateMesh(params,quality),s=mesh.stats;
  assert.equal(s.watertight,true);assert.equal(s.components,1);
  assert.equal(s.boundaryEdges,0);assert.equal(s.nonManifoldEdges,0);
  assert.equal(s.inconsistentEdges,0);assert.equal(s.degenerateTriangles,0);
  assert.ok(s.volumeMm3>0);assert.equal(s.bounds.min[2],0);
  const stl=encodeSTL(mesh),view=new DataView(stl),triangles=view.getUint32(80,true);
  assert.equal(triangles,s.triangles);assert.equal(stl.byteLength,84+50*triangles);
  // Check exported face normals, including hole/foot faces, after Float32 rounding.
  for(let i=0;i<triangles;i+=Math.max(1,Math.floor(triangles/101))){
    const offset=84+50*i;let normal=[];for(let j=0;j<3;j++)normal.push(view.getFloat32(offset+j*4,true));
    assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-5);
  }
  checks++;return mesh;
}

for(const preset of PRESETS)checkMesh(preset.params);
const cylinder={...DEFAULTS,name:'Analytic cylinder',profile:'cylinder',diameter:100,height:100,topRatio:1,bottomRatio:1,wallThickness:2,baseThickness:3,pattern:'smooth',rimHeight:0,rimWidth:0,footHeight:0,baseMode:'closed'};
const solid=checkMesh(cylinder,'standard');
const expected=Math.PI*(50*50*100-48*48*97);
assert.ok(Math.abs(solid.stats.volumeMm3/expected-1)<0.0002,'Cylinder volume must match analytical shell volume.');
assert.ok(Math.abs(solid.stats.minimumCavityDiameter-96)<1e-8);
assert.ok(Math.abs(solid.stats.rimInnerDiameter-96)<1e-8);
assert.ok(Math.abs(solid.stats.sampledMinimumNormalWallEstimate-2)<1e-8);

const drain=checkMesh({...cylinder,baseMode:'drain',holeDiameter:10},'standard');
const drainExpected=expected-Math.PI*25*3;
assert.ok(Math.abs(drain.stats.volumeMm3/drainExpected-1)<0.0002);
const open=checkMesh({...cylinder,baseMode:'open'},'standard');
assert.ok(Math.abs(open.stats.volumeMm3/(Math.PI*(2500-2304)*100)-1)<0.0002);
const foot=checkMesh({...cylinder,footHeight:4,footInset:5},'standard');
const footExpected=Math.PI*(2500*100-2304*93-45*45*4);
assert.ok(Math.abs(foot.stats.volumeMm3/footExpected-1)<0.0002);
const footDrain=checkMesh({...cylinder,baseMode:'drain',holeDiameter:10,footHeight:4,footInset:5});
assert.ok(footDrain.stats.volumeMm3<foot.stats.volumeMm3);

for(const pattern of OPTIONS.pattern.filter(v=>v!=='image')){
  for(const count of [7,31])checkMesh({...cylinder,pattern,patternCount:count,patternRows:9,patternDepth:2.5,patternTwist:45});
}
for(const crossSection of OPTIONS.crossSection){
  for(const perforation of ['slots','diamonds']){
    const p={...cylinder,crossSection,sides:5,lobes:7,twist:80,perforation,perforationCount:13,perforationRows:3,perforationSize:0.62};
    const cut=checkMesh(p),whole=checkMesh({...p,perforation:'none'});
    assert.ok(cut.stats.volumeMm3<whole.stats.volumeMm3,'Windows must remove real material.');
  }
}
for(const profile of OPTIONS.profile)checkMesh({...cylinder,profile,topRatio:0.8,bottomRatio:0.7,belly:0.3});

const standard=checkMesh(DEFAULTS,'standard'),fine=checkMesh(DEFAULTS,'fine'),ultra=checkMesh(DEFAULTS,'ultra');
assert.ok(standard.stats.triangles<fine.stats.triangles&&fine.stats.triangles<ultra.stats.triangles);
assert.ok(Math.abs(standard.stats.volumeMm3/ultra.stats.volumeMm3-1)<0.01);
assert.throws(()=>generateMesh({...cylinder,diameter:16,wallThickness:12}),/closes the cavity/);
assert.throws(()=>generateMesh({...cylinder,baseMode:'mount',holeDiameter:150}),/hole is too large/);
assert.throws(()=>generateMesh({...cylinder,height:12,baseThickness:20}),/too little room/);
const n=normalizeParams({height:NaN,diameter:Infinity,name:' ',profile:'unknown',profilePoints:[]});
assert.equal(n.height,DEFAULTS.height);assert.equal(n.diameter,DEFAULTS.diameter);assert.equal(n.profile,DEFAULTS.profile);
assert.ok(n.profilePoints.length>=2);

// Fixed reproducible adversarial combinations: successful outputs must be closed;
// unprintable radii / base combinations must reject with actionable errors.
let seed=20261118,accepted=0,rejected=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const choice=a=>a[Math.floor(random()*a.length)];
for(let i=0;i<60;i++){
  const p={...DEFAULTS,profile:choice(OPTIONS.profile),crossSection:choice(OPTIONS.crossSection),pattern:choice(OPTIONS.pattern.filter(v=>v!=='image')),
    height:30+random()*230,diameter:30+random()*220,topRatio:.2+random(),bottomRatio:.2+random(),belly:random()*.65,
    wallThickness:.8+random()*4,patternDepth:random()*7,patternCount:3+Math.floor(random()*65),patternRows:1+Math.floor(random()*20),
    twist:-180+random()*360,patternTwist:-200+random()*400,baseMode:choice(OPTIONS.baseMode),holeDiameter:2+random()*45,
    footHeight:random()>.7?random()*8:0,footInset:2+random()*7,perforation:choice(OPTIONS.perforation),perforationCount:4+Math.floor(random()*25),
    perforationRows:1+Math.floor(random()*8),perforationSize:.25+random()*.5};
  try{checkMesh(p);accepted++;}catch(error){
    assert.match(error.message,/closes the cavity|too narrow|hole is too large|too wide for the base|too little room|too short for these windows|too small at this resolution/,
      'Every rejected geometry must have an actionable parameter error, not a mesh failure.');rejected++;
  }
}
const hash=m=>createHash('sha256').update(new Uint8Array(m.positions.buffer)).update(new Uint8Array(m.indices.buffer)).digest('hex');
const legacyHashes={
  'spiral-planter':'450c653202af12e05b3c7fffe280582d0a8959c693ea773bee9cc9a1b222f0bb',
  'fluted-cachepot':'3595fa2334154f19c2c9cb59953fee7c3aa9486172896dd5b619f11bda97007f',
  'petal-planter':'c47a48ef78a9e1d8f3bbb6ccf7434cb6a761feef55e72de8c141dc207e031c2f',
  'woven-pot':'d965defad48063ff3069a0d440b6c30ddcf2030336a97415660ecf68ac139d8b',
  'orb-vase':'803e8230555cd7425c7f0c7ddbf4b3f2f1d7e3271e42db21a2a97a1b29b3ff43',
  'wave-vase':'27f82224b7910e80478947328020b6bdd8ea54fd365987ce0881582a306915ff',
  'diamond-vase':'44540ae8a74f53d1c494b5514a83ff6f1ba70958a28eaa74c841beb227af2d9c',
  'twisted-facets':'d4e77ae238f8f9a1d33493e51918e11b70bb08a5da4ca0eb56b87d7468235070',
  'ripple-bowl':'95e522bc0f340820b82fcbbbd964204b8d3b674fa34a5556fc61a433babdc17c',
  'pebble-bowl':'1c786085d6c7a1b3e1691b409a209c5d0d3741890457819a01b3a0b92a636385',
  'pleated-shade':'5d79e9879bd4b9ce8bf5acb15ab16043d67f70e3d6f5c82437f9324b83cb58ff',
  'lantern-shade':'b9692dd170f2e945af95eb4c1b4f6a79749031e10f1f7017b680df9343b509a0',
  'slotted-shade':'8c5fcd6ef3b8b9cada7fc93aa98dca5325454cfd962aee9c04fee10b22e0c43f',
  'desk-cup':'e9f6d0695aa0fe019a3e4ff2d3932bded4cc0c32d39c593ed411e458baaa7fda',
  'dimple-vessel':'c599bc14082483563c87fd22568984c33e065ec40c0beb3c6a975e2e42204a3f',
  'scallop-vase':'466d8dd76fbfb7ed44b892e9ded5ddb22966bbb1980f06d8bbbc7db66e1437ce'
};
for(const [id,expectedHash] of Object.entries(legacyHashes))assert.equal(hash(generateMesh(PRESETS.find(p=>p.id===id).params,'standard')),expectedHash,`Legacy ${id} export changed.`);
assert.equal(hash(generateMesh(DEFAULTS,'fine')),'18ca82c67dd85642a21301a342a6341111f87d3b1440a0648ebfcdc3451718b0');
assert.equal(hash(generateMesh(DEFAULTS,'ultra')),'e497dcbef900662ad371c4af47404b3d9cb486546a91bfbb24efac6ef6defd2b');

const layer=values=>normalizeEffect({count:24,rows:4,fade:0,depthBottom:2,depthTop:2,...values});
const raster=(values,width=8,height=8)=>({width,height,data:Buffer.from(values).toString('base64')});
const white=raster(new Uint8Array(64).fill(255)),black=raster(new Uint8Array(64));
const half=raster(Uint8Array.from({length:64},(_,i)=>i%8<4?255:0));
const baseParams={...cylinder,pattern:'smooth',height:140};
const blank=checkMesh({...baseParams,effects:[]},'standard');
const full=checkMesh({...baseParams,effects:[layer({pattern:'ribs'})]},'standard');
const off=checkMesh({...baseParams,effects:[layer({pattern:'ribs',enabled:false})]},'standard');
const maskedOff=checkMesh({...baseParams,effects:[layer({pattern:'ribs',mask:black})]},'standard');
assert.equal(hash(blank),hash(off));assert.ok(Math.abs(maskedOff.stats.volumeMm3/blank.stats.volumeMm3-1)<1e-7);
assert.ok(full.stats.volumeMm3>blank.stats.volumeMm3*1.015,'A surface layer must change real material volume.');
const two=checkMesh({...baseParams,effects:[layer({pattern:'ribs'}),layer({id:'second',pattern:'ribs',depthBottom:4,depthTop:4})]},'standard');
const replace=checkMesh({...baseParams,effects:[layer({pattern:'ribs'}),layer({id:'second',pattern:'ribs',depthBottom:4,depthTop:4,blend:'replace'})]},'standard');
const greatest=checkMesh({...baseParams,effects:[layer({pattern:'ribs'}),layer({id:'second',pattern:'ribs',depthBottom:4,depthTop:4,blend:'max'})]},'standard');
assert.ok(two.stats.volumeMm3>replace.stats.volumeMm3);assert.equal(hash(replace),hash(greatest));
const gradient=checkMesh({...baseParams,effects:[layer({pattern:'ribs',depthBottom:4,depthTop:0})]},'standard');
const maxRadiusAt=(mesh,t,a=0)=>{let best=Infinity,r=0;for(let i=0;i<mesh.surfaceHeight.length;i++){const x=mesh.positions[i*3],y=mesh.positions[i*3+1],angle=Math.atan2(y,x),distance=Math.abs(mesh.surfaceHeight[i]-t)+Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)))*.05;if(distance<best-1e-8){best=distance;r=Math.hypot(x,y);}else if(Math.abs(distance-best)<1e-8)r=Math.max(r,Math.hypot(x,y));}return r;};
assert.ok(Math.abs(maxRadiusAt(gradient,0)-54)<1e-4);assert.ok(Math.abs(maxRadiusAt(gradient,1)-50)<1e-4);
const halfMask=checkMesh({...baseParams,effects:[layer({pattern:'image',image:white,mask:half,depthBottom:4,depthTop:4})]},'standard');
assert.ok(maxRadiusAt(halfMask,.5,0)>53.9);assert.ok(Math.abs(maxRadiusAt(halfMask,.5,Math.PI)-50)<1e-4);
const inverted=checkMesh({...baseParams,effects:[layer({pattern:'image',image:white,mask:{...half,invert:true},depthBottom:4,depthTop:4})]},'standard');
assert.ok(maxRadiusAt(inverted,.5,Math.PI)>53.9);assert.ok(Math.abs(maxRadiusAt(inverted,.5,0)-50)<1e-4);
const maskedReplacement=checkMesh({...baseParams,effects:[layer({pattern:'image',image:white}),layer({id:'masked-replace',pattern:'image',image:white,mask:half,depthBottom:4,depthTop:4,blend:'replace'})]},'standard');
assert.ok(Math.abs(maxRadiusAt(maskedReplacement,.5,Math.PI)-52)<1e-4,'A masked replacement must retain earlier effects outside the mask.');
const band=checkMesh({...baseParams,effects:[layer({pattern:'image',image:white,start:.3,end:.7,fade:.1})]},'standard');
assert.ok(Math.abs(maxRadiusAt(band,.1)-50)<1e-4);assert.ok(maxRadiusAt(band,.5)>51.9);assert.ok(Math.abs(maxRadiusAt(band,.9)-50)<1e-4);
const erasedBand=checkMesh({...baseParams,effects:[layer({pattern:'image',image:white}),layer({id:'erase',pattern:'smooth',blend:'replace',start:.3,end:.7,fade:.1})]},'standard');
assert.ok(Math.abs(maxRadiusAt(erasedBand,.5)-50)<1e-4);assert.ok(maxRadiusAt(erasedBand,.1)>51.9);assert.equal(erasedBand.stats.activeEffects,2);
const fold=checkMesh({...baseParams,effects:[layer({pattern:'image',image:half,imageMode:'folds'})]},'standard');
const relief=checkMesh({...baseParams,effects:[layer({pattern:'image',image:half,imageMode:'relief'})]},'standard');
assert.notEqual(hash(fold),hash(relief),'Image relief and image folds must be distinct real geometries.');
assert.throws(()=>normalizeRaster({...white,data:'bad'}),/map size|decoded/);
assert.throws(()=>generateMesh({...baseParams,effects:[layer({pattern:'image'})]}),/needs an image/);
const organicParams={...baseParams,effects:[layer({pattern:'organic',variation:.7,seed:31})]};
const organic=checkMesh(organicParams,'standard');assert.equal(hash(organic),hash(generateMesh(organicParams,'standard')));
assert.notEqual(hash(organic),hash(generateMesh({...organicParams,effects:[layer({pattern:'organic',variation:.7,seed:32})]},'standard')));
const legacyLayer=createEffectFromLegacy(DEFAULTS);assert.equal(legacyLayer.legacyEdgeFade,true);assert.equal(legacyLayer.twist,DEFAULTS.patternTwist);

const shaped=checkMesh({...baseParams,profile:'custom',profileInterpolation:'linear',profilePoints:[{z:0,r:.6},{z:.4,r:1},{z:1,r:.75}],crossSection:'ellipse',aspectRatio:1.1,aspectRatioTop:1.9,twistBottom:-20,twistTop:80,twistEase:1.4,leanX:20,leanY:-12});
assert.equal(shaped.stats.dimensions[2],140);
assert.equal(sampleProfile({...baseParams,profile:'cylinder'},5).every(p=>p.r===1),true);
const lean=checkMesh({...baseParams,leanX:30,leanY:-10},'standard');
assert.ok(Math.abs(lean.stats.volumeMm3/blank.stats.volumeMm3-1)<1e-6,'Affine lean must retain material volume.');
const wavedParams={...baseParams,effects:[layer({pattern:'coral',depthBottom:2,depthTop:3})],zWaveAmplitude:1.5,zWaveCount:11,zWaveRows:2,zWavePhase:45,zWaveFade:.2,leanX:19,leanY:-8};
const waved=checkMesh(wavedParams,'standard');
assert.equal(waved.stats.dimensions[2],140);assert.ok(waved.stats.zWaveDerivativeBound<=.55);
for(let i=0;i<waved.surfaceHeight.length;i+=Math.max(1,Math.floor(waved.surfaceHeight.length/99))){
  const point={x:waved.positions[i*3],y:waved.positions[i*3+1],z:waved.positions[i*3+2]},uv=surfaceUV(point,wavedParams);
  assert.ok(Math.abs(uv.height-waved.surfaceHeight[i])<2e-6,'Brush UV must invert the actual height deformation.');
  if(waved.surfaceHeight[i]<=baseParams.baseThickness/baseParams.height+1e-8)assert.ok(Math.abs(point.z-waved.surfaceHeight[i]*baseParams.height)<1e-5);
}
assert.throws(()=>generateMesh({...baseParams,zWaveAmplitude:8,zWaveRows:12}),/Z-wave amplitude is too large/);
let waveLimitMessage='';try{generateMesh({...baseParams,zWaveAmplitude:8,zWaveRows:12});}catch(error){waveLimitMessage=error.message;}
const printedWaveLimit=Number(waveLimitMessage.match(/Use ([0-9.]+) mm/)[1]);
assert.ok(generateMesh({...baseParams,zWaveAmplitude:printedWaveLimit,zWaveRows:12}).stats.zWaveDerivativeBound<=.55,'The maximum amplitude printed in an error must actually succeed.');
const draft=generateMesh(DEFAULTS,'draft'),preview=generateMesh(DEFAULTS,'preview'),detail=generateMesh(DEFAULTS,'detail');
assert.ok(draft.stats.triangles<preview.stats.triangles&&preview.stats.triangles<detail.stats.triangles);
console.log(JSON.stringify({ok:true,meshChecks:checks,presets:PRESETS.length,randomAccepted:accepted,randomRejected:rejected,
  legacyExportHashes:18,stackMasksImagesAndDeformation:true,
  defaultTriangles:{draft:draft.stats.triangles,preview:preview.stats.triangles,detail:detail.stats.triangles,standard:standard.stats.triangles,fine:fine.stats.triangles,ultra:ultra.stats.triangles}},null,2));
