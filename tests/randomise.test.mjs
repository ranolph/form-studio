import assert from 'node:assert/strict';
import {DEFAULTS, generateMesh, normalizeParams} from '../static/geometry.js';
import {RANDOM_KINDS, randomiseDesign} from '../static/randomise.js';

let meshChecks=0;
const shapes=new Set(),patterns=new Set(),sections=new Set(),kinds=new Set();
function check(result,fit=true){
  const mesh=generateMesh(result.params,'draft'),s=mesh.stats;
  assert.equal(s.watertight,true);assert.equal(s.components,1);
  assert.equal(s.boundaryEdges,0);assert.equal(s.nonManifoldEdges,0);assert.equal(s.inconsistentEdges,0);
  assert.equal(s.degenerateTriangles,0);assert.ok(s.volumeMm3>0);assert.equal(s.bounds.min[2],0);
  assert.ok([...mesh.positions].every(Number.isFinite));
  if(fit)assert.ok(s.dimensions.every(v=>v<=240.001),`Unlocked ${result.name} exceeds 240 mm: ${s.dimensions}`);
  assert.ok(result.params.effects.length>=1&&result.params.effects.length<=3);
  assert.ok(result.params.effects.every(e=>!e.mask&&!e.image));
  meshChecks++;
}

for(const kind of RANDOM_KINDS.slice(1)){
  for(let i=0;i<16;i++){
    const seed=20261118+Math.imul(i+1,2654435761),result=randomiseDesign({seed,kind});
    assert.deepEqual(result,randomiseDesign({seed,kind}),'Seed must reproduce every parameter.');
    assert.equal(result.kind,kind);assert.equal(result.params.objectType,kind==='container'?'organiser':kind);
    check(result);shapes.add(JSON.stringify(result.params.profilePoints));sections.add(result.params.crossSection);
    result.params.effects.forEach(e=>patterns.add(e.pattern));
  }
}
for(let seed=0;seed<64;seed++)kinds.add(randomiseDesign({seed}).kind);
assert.equal(kinds.size,5,'Any object must sample all supported kinds.');
assert.ok(shapes.size>=75,'Randomisation must create different silhouettes, not just rename presets.');
assert.ok(patterns.size>=12);assert.equal(sections.size,5);

const current=normalizeParams({...DEFAULTS,name:'Keep me',height:167.5,diameter:143.2,quality:'ultra',previewQuality:'detail'});
const before=structuredClone(current);
for(const kind of RANDOM_KINDS.slice(1)){
  const result=randomiseDesign({seed:91,kind,current,keepDimensions:true});
  assert.equal(result.params.height,current.height);assert.equal(result.params.diameter,current.diameter);
  assert.equal(result.params.quality,'ultra');assert.equal(result.params.previewQuality,'detail');
  check(result,false);
}
assert.deepEqual(current,before,'Randomisation must not mutate the current design.');
assert.notEqual(randomiseDesign({seed:0}).seed,randomiseDesign({seed:1}).seed);
assert.deepEqual(randomiseDesign({seed:'same seed'}),randomiseDesign({seed:'same seed'}));
assert.notDeepEqual(randomiseDesign({seed:42}).params,randomiseDesign({seed:43}).params);
assert.equal(randomiseDesign({seed:0}).seed,0,'A zero seed is valid, not an omitted seed.');

for(const dimensions of [{height:12,diameter:16},{height:12,diameter:500},{height:500,diameter:16}]){
  for(const kind of ['vase','lampshade']){
    const result=randomiseDesign({seed:173,kind,current:dimensions,keepDimensions:true});
    assert.equal(result.params.height,dimensions.height);assert.equal(result.params.diameter,dimensions.diameter);
    check(result,false);
  }
}
console.log(JSON.stringify({passed:true,meshChecks,unlockedDesigns:80,lockedDesigns:11,uniqueProfiles:shapes.size,patterns:patterns.size,crossSections:sections.size,objectKinds:kinds.size,determinism:true,currentPreserved:true,unlockedBoundsLimitMm:240}));
