import {DEFAULTS, PRESETS, OPTIONS, LIMITS, normalizeParams, generateMesh, encodeSTL, EFFECT_DEFAULTS, EFFECT_LIMITS, normalizeEffect, createEffectFromLegacy, sampleProfile} from './geometry.js';
import {ModelViewer} from './viewer.js';
import {randomiseDesign} from './randomise.js';

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const titleCase = (value) => String(value).replace(/-/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());
const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined,{maximumFractionDigits:digits});
const DRAFT_KEY = 'form-studio-draft-v1';
const categories = {planter:'PLANT POT',vase:'VASE',bowl:'BOWL',lampshade:'LAMPSHADE',organiser:'DESK ORGANISER'};
const colours = [{hex:'#c77d5d',label:'Terracotta'},{hex:'#d4c2a5',label:'Sand'},{hex:'#e1d7c5',label:'Chalk'},{hex:'#9aab8d',label:'Sage'},{hex:'#82969c',label:'Slate'},{hex:'#776d61',label:'Stone'}];
const STARTER=PRESETS.find(preset=>preset.id==='coral-study')||PRESETS[0];
let params = clone(STARTER?.params||DEFAULTS), savedId = null, dirty = false, selectedPreset = STARTER?.id || '', filter = 'all';
let config = {layerLibraryUrl:'',bedSize:[256,256,256],version:'1.2.0'};
let currentMesh = null, viewer = null, history = [], future = [], lastEdit = {key:'',at:0};
let previewTimer = null, previewGeneration = 0, previewBusy = false, previewAgain = false, resetNextView = false;
let worker = null, workerID = 0, requests = new Map(), exportBusy = false, activeRequest = null;
let savedView = 'designs', savedLoadSerial = 0;
let lastExportStats = null;
let activeEffectId=null,effectUiSignature='',paintBytes=null;
const paintState={enabled:false,erase:false,size:.08,strength:.7};
let displayMode='layers',gradientEnabled=true,renderQuality='high',layerSpacing=.6;
let randomiseBusy=false;
const randomiseOptions={kind:'any',keepDimensions:false};
try{const stored=JSON.parse(localStorage.getItem('form-studio-randomise-v1')||'null');if(stored){if(['any','vase','planter','bowl','lampshade','container'].includes(stored.kind))randomiseOptions.kind=stored.kind;if(typeof stored.keepDimensions==='boolean')randomiseOptions.keepDimensions=stored.keepDimensions;}}catch{}
try{const preference=JSON.parse(localStorage.getItem('form-studio-view-v1')||'null');if(preference){if(['solid','layers','wire'].includes(preference.displayMode))displayMode=preference.displayMode;if(typeof preference.gradient==='boolean')gradientEnabled=preference.gradient;if(['balanced','high','ultra'].includes(preference.quality))renderQuality=preference.quality;if(Number.isFinite(preference.layerHeight))layerSpacing=Math.max(.1,Math.min(2,preference.layerHeight));}}catch{}
function persistView(){try{localStorage.setItem('form-studio-view-v1',JSON.stringify({displayMode,gradient:gradientEnabled,quality:renderQuality,layerHeight:layerSpacing}));}catch{}}

try {
  const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  if (draft?.params && draft.schemaVersion===1) {
    params=normalizeParams(draft.params);savedId=draft.id||null;dirty=!!draft.dirty;selectedPreset=draft.preset||'';
  }
} catch { /* Private browsing can disable local persistence. Server saves still work. */ }

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i=0;i<16;i++) bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function toast(message, error=false, link=null) {
  const item=document.createElement('div');item.className=`toast${error?' error':''}`;item.textContent=message;
  if(link){const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener';a.textContent='Open Layer Library';item.append(a);}
  $('toast-stack').append(item);setTimeout(()=>item.remove(),error?11000:6500);
}

async function api(path,options={}) {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),options.timeout||25000);
  const headers={...(options.headers||{})};
  if(options.method&&options.method!=='GET')headers['X-Form-Studio']='1';
  if(options.json!==undefined){headers['Content-Type']='application/json';options.body=JSON.stringify(options.json);}
  try {
    const response=await fetch(path,{...options,headers,signal:controller.signal});
    let data;try{data=await response.json();}catch{throw new Error(`The server returned an unreadable response (${response.status}).`);}
    if(!response.ok||data.ok===false){const error=new Error(data.error||data.message||`Request failed (${response.status}).`);Object.assign(error,{uncertain:data.uncertain,requestId:data.requestId,httpStatus:response.status});throw error;}
    return data;
  } catch(error) {
    if(error.name==='AbortError')throw new Error('The server took too long to respond. Check that the app is running.');
    throw error;
  } finally {clearTimeout(timeout);}
}

function persistDraft() {
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify({schemaVersion:1,id:savedId,params,dirty,preset:selectedPreset}));}catch{}
}

function markChanged() {
  lastExportStats=null;dirty=true;$('dirty-indicator').classList.add('visible');persistDraft();
}

function remember(key='') {
  const now=Date.now();
  if(key!==lastEdit.key||now-lastEdit.at>750){history.push({params:clone(params),id:savedId,preset:selectedPreset});if(history.length>60)history.shift();}
  lastEdit={key,at:now};future=[];syncHistory();
}

function commitChange(key,value,historyKey=key) {
  if(JSON.stringify(params[key])===JSON.stringify(value))return;
  remember(historyKey);params=normalizeParams({...params,[key]:value});
  selectedPreset='';markChanged();syncControls();renderPresets();
  if(key==='color'){viewer?.setColor(params.color);return;}
  if(key==='name')return;
  queuePreview();
}

function replaceParams(next,{id=null,preset='',clean=false,record=true,resetView=true}={}) {
  if(record)remember('replace-'+Date.now());
  lastExportStats=null;stopPainting();effectUiSignature='';
  params=normalizeParams(next);savedId=id;selectedPreset=preset;dirty=!clean;
  $('dirty-indicator').classList.toggle('visible',dirty);syncControls();renderPresets();persistDraft();
  resetNextView=resetView;queuePreview();
}

function syncHistory(){ $('undo').disabled=!history.length;$('redo').disabled=!future.length; }
function undo(){if(!history.length)return;future.push({params:clone(params),id:savedId,preset:selectedPreset});const previous=history.pop();replaceParams(previous.params,{id:previous.id,preset:previous.preset,record:false,resetView:false});lastEdit={key:'',at:0};syncHistory();}
function redo(){if(!future.length)return;history.push({params:clone(params),id:savedId,preset:selectedPreset});const next=future.pop();replaceParams(next.params,{id:next.id,preset:next.preset,record:false,resetView:false});lastEdit={key:'',at:0};syncHistory();}

function createWorker() {
  if(!globalThis.Worker)return;
  try{
    worker=new Worker('/mesh-worker.js',{type:'module'});
    worker.onmessage=({data})=>{const pending=requests.get(data.id);if(!pending)return;requests.delete(data.id);data.error?pending.reject(new Error(data.error)):pending.resolve(data.mesh);};
    worker.onerror=()=>{for(const p of requests.values())p.reject(new Error('The mesh worker could not run. Reload the page to try again.'));requests.clear();worker?.terminate();worker=null;};
  }catch{worker=null;}
}

function requestMesh(input,quality='preview') {
  if(!worker)return new Promise((resolve,reject)=>{setTimeout(()=>{try{resolve(generateMesh(input,quality));}catch(error){reject(error);}},0);});
  return new Promise((resolve,reject)=>{const id=++workerID;requests.set(id,{resolve,reject});worker.postMessage({id,params:clone(input),quality});});
}

function queuePreview() {
  previewGeneration++;clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,110);
}

async function renderPreview() {
  if(previewBusy){previewAgain=true;return;}
  const generation=previewGeneration;previewBusy=true;
  $('mesh-status').textContent='Updating preview…';$('viewport-loading').hidden=!!currentMesh;
  try{
    let mesh;
    try{mesh=await requestMesh(params,params.previewQuality||'preview');}
    catch(error){
      if(/too small at this resolution/.test(error.message)){mesh=await requestMesh(params,params.quality);}
      else throw error;
    }
    if(generation===previewGeneration){
      currentMesh=mesh;viewer?.setMesh(mesh,params.color,resetNextView);resetNextView=false;
      if(viewer)$('mesh-error').hidden=true;refreshDisplayedStats();setExportsDisabled(false);
    }
  }catch(error){
    if(generation===previewGeneration){currentMesh=null;$('mesh-error').textContent=error.message;$('mesh-error').hidden=false;$('mesh-status').textContent='Adjust the highlighted design settings';$('dimensions').textContent='Invalid geometry';$('volume').textContent='—';$('triangle-count').textContent='No export available';$('bed-status').textContent='Needs adjustment';$('bed-status').classList.add('warning');setExportsDisabled(true);}
  }finally{
    previewBusy=false;$('viewport-loading').hidden=true;
    if(previewAgain||generation!==previewGeneration){previewAgain=false;renderPreview();}
  }
}

function setExportsDisabled(disabled){for(const id of ['download-stl','download-stl-mobile'])$(id).disabled=disabled||exportBusy;$('send-library').disabled=disabled||exportBusy||!config.layerLibraryUrl;$('send-library').title=config.layerLibraryUrl?'Send this model to Layer Library':'Add a Layer Library address in Settings to enable this.';}
function refreshDisplayedStats() {
  if(lastExportStats)updateStats(lastExportStats.stats,lastExportStats.quality);
  else if(currentMesh)updateStats(currentMesh.stats);
}
function updateStats(stats,exportQuality=null) {
  const dims=stats.dimensions||[0,0,0];$('dimensions').textContent=`${dims.map(d=>fmt(d)).join(' × ')} mm`;
  $('dimensions').title=`${dims.map(d=>fmt(d,3)).join(' × ')} mm`;
  $('size-label').textContent=exportQuality?`EXPORT SIZE · ${exportQuality.toUpperCase()}`:'PREVIEW SIZE';
  $('volume').textContent=`${fmt(stats.volumeMm3/1000)} cm³`;
  $('triangle-count').textContent=`${fmt(stats.triangles,0)} ${exportQuality?'export':'preview'} triangles`;
  const fits=dims.every((d,i)=>d<=config.bedSize[i]);
  $('bed-status').textContent=fits?(exportQuality?'Export fits':'Preview fits'):'Exceeds build volume';$('bed-status').classList.toggle('warning',!fits);
  $('bed-status').title=exportQuality?'Checked against the final exported mesh. Allow space for a brim.':'Approximate preview check. The final mesh is checked again when you export.';
  $('size-warning').hidden=fits;
  $('size-warning').textContent=fits?'':`${exportQuality?'The exported STL':'This preview'} exceeds the configured build volume. Resize it or split it in your slicer; download is still available.`;
  $('mesh-status').replaceChildren();const dot=document.createElement('span');dot.className='status-dot';$('mesh-status').append(dot,document.createTextNode(stats.watertight?'Closed mesh · 1 connected object':'Check mesh before printing'));
  const warningBox=$('geometry-warnings');
  if(warningBox){const warnings=[...(stats.warnings||[])];if(!fits)warnings.unshift('This model exceeds the configured build volume in its current orientation. Resize it or split it in your slicer.');warningBox.hidden=!warnings.length;warningBox.innerHTML=warnings.length?`<svg><use href="#i-info"/></svg><ul class="warning-list">${warnings.map(w=>`<li>${escapeHTML(w)}</li>`).join('')}</ul>`:'';}
  if($('cavity-size'))$('cavity-size').textContent=`Approx. rim opening: ${fmt(stats.rimInnerDiameter)} mm. Approx. narrowest cavity: ${fmt(stats.minimumCavityDiameter)} mm, sampled above the floor. Allow clearance when fitting another pot.`;
}

function optionLabel(key,value){
  const labels={objectType:{planter:'Plant pot',vase:'Vase',bowl:'Bowl / tray',lampshade:'Lampshade',organiser:'Desk organiser'},profile:{tapered:'Tapered',cylinder:'Straight',barrel:'Barrel',bulb:'Bulb',hourglass:'Waist',trumpet:'Trumpet',bowl:'Bowl',custom:'Custom'},crossSection:{circle:'Round',ellipse:'Oval','rounded-square':'Rounded square',polygon:'Polygon',star:'Petal / star'},baseMode:{closed:'Solid base',drain:'Central drainage hole',open:'Open at both ends',mount:'Mounting plate + hole'},perforation:{none:'No openings',slots:'Vertical slots',diamonds:'Diamond windows'},pattern:{smooth:'Smooth',ribs:'Ribs',flutes:'Flutes',waves:'Waves',diamonds:'Diamond',ripples:'Ripples',scales:'Scales',woven:'Woven',dimples:'Dimples'}};
  return labels[key]?.[value]||titleCase(value);
}

function range(key,label,unit='',step=1,scale=1,help='') {
  const limits=LIMITS[key]||({twistTop:[-720,720],aspectRatioTop:[.35,2.8],zWaveAmplitude:[0,8],zWaveCount:[2,32],zWaveRows:[1,12],zWavePhase:[0,360],zWaveFade:[.08,.45]})[key]||[0,100],min=limits[0]*scale,max=limits[1]*scale;
  return `<div class="field" data-field="${key}"><div class="field-head"><label class="field-label" for="number-${key}">${label}</label><div class="number-wrap"><input id="number-${key}" data-key="${key}" data-scale="${scale}" type="number" min="${min}" max="${max}" step="${step}" inputmode="decimal" aria-label="${label}"><span>${unit}</span></div></div><input class="range-input" type="range" data-key="${key}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" aria-label="${label} slider"><div class="range-labels"><span>${fmt(min)}${unit?' '+unit:''}</span><span>${fmt(max)}${unit?' '+unit:''}</span></div>${help?`<p class="field-help">${help}</p>`:''}</div>`;
}

function select(key,label,help='') {
  return `<div class="field"><label class="field-label" for="select-${key}">${label}</label><select class="select-input" id="select-${key}" data-key="${key}">${OPTIONS[key].map(value=>`<option value="${value}">${optionLabel(key,value)}</option>`).join('')}</select>${help?`<p class="field-help">${help}</p>`:''}</div>`;
}

function profileIcon(profile) {
  const shapes={tapered:'M5 4h20l-4 24H9L5 4Z',cylinder:'M7 4h16v24H7V4Z',barrel:'M9 4h12q8 12 0 24H9Q1 16 9 4Z',bulb:'M12 4h6v6q13 9 4 18H8q-9-9 4-18V4Z',hourglass:'M6 4h18q-12 12 0 24H6q12-12 0-24Z',trumpet:'M4 4h22q-7 14-7 24h-8Q11 18 4 4Z',bowl:'M3 11h24q-1 17-12 17T3 11Z',custom:'M10 4h10q-8 9 3 15t-2 9H9q-13-4-2-9t3-15Z'};
  return `<svg viewBox="0 0 30 33" aria-hidden="true"><path d="${shapes[profile]}"/><path d="M9 30h12" opacity=".4"/></svg>`;
}

function patternIcon(pattern) {
  const paths={smooth:'M7 6h26M7 15h26M7 24h26',ribs:'M5 3v25M11 3v25M17 3v25M23 3v25M29 3v25M35 3v25',flutes:'M5 3q6 12 0 25M13 3q6 12 0 25M21 3q6 12 0 25M29 3q6 12 0 25',waves:'M5 3q10 6 0 12t0 13M14 3q10 6 0 12t0 13M23 3q10 6 0 12t0 13M32 3q10 6 0 12t0 13',diamonds:'m10 2 9 13-9 13L1 15 10 2Zm20 0 9 13-9 13-9-13L30 2Z',ripples:'M2 4q9-4 18 0t18 0M2 11q9-4 18 0t18 0M2 18q9-4 18 0t18 0M2 25q9-4 18 0t18 0',scales:'M0 2q5 10 10 0 5 10 10 0 5 10 10 0 5 10 10 0M-5 12q5 10 10 0 5 10 10 0 5 10 10 0 5 10 10 0 5 10 10 0M0 22q5 10 10 0 5 10 10 0 5 10 10 0 5 10 10 0',woven:'M0 2 26 28M0 12l16 16M0 22l6 6M10 2l26 26M20 2l20 20M30 2l10 10M40 2 14 28M40 12 24 28M40 22l-6 6M30 2 4 28M20 2 0 22M10 2 0 12',dimples:''};
  return `<svg viewBox="0 0 40 31" aria-hidden="true">${pattern==='dimples'?[5,15,25,35].flatMap(x=>[5,15,25].map(y=>`<circle cx="${x}" cy="${y}" r="2.2"/>`)).join(''):`<path d="${paths[pattern]||paths.smooth}"/>`}</svg>`;
}

function buildControls() {
  $('shape-controls').innerHTML=`
    <div class="control-group">${range('height','Height','mm',1)}${range('diameter','Body diameter','mm',1)}</div>
    <div class="profile-section"><div class="profile-toolbar"><span class="field-label">Profile</span><div class="segmented" role="group" aria-label="Profile interpolation"><button data-interpolation="smooth">Smooth</button><button data-interpolation="linear">Linear</button></div></div><div class="profile-editor"><span class="profile-axis-label">Radius →<br>Height ↑</span><svg id="profile-curve" viewBox="0 0 160 210" aria-label="Edit profile by dragging the points" role="img"></svg></div><p class="profile-editor-copy">Drag a point to change the silhouette.</p><div class="profile-mini-actions"><button class="btn quiet" id="add-profile-point">+ Point</button><button class="btn quiet" id="reset-profile">Reset profile</button></div><details class="control-accordion"><summary>Point values</summary><div id="profile-point-fields" class="profile-points"></div></details></div>
    <details class="control-accordion"><summary>Starting shape</summary><div>${select('profile','Profile family')}${select('objectType','Object type')}<div id="profile-ratios">${range('topRatio','Rim proportion','%',1,100)}${range('bottomRatio','Base proportion','%',1,100)}<div id="belly-fields">${range('belly','Curvature','%',1,100)}<div id="belly-position-field">${range('bellyPosition','Belly height','%',1,100)}</div></div></div></div></details>
    <details class="control-accordion"><summary>Cross-section</summary><div>${select('crossSection','Outline')}<div id="ellipse-fields">${range('aspectRatio','Oval ratio at base',':1',.05)}${range('aspectRatioTop','Oval ratio at rim',':1',.05)}</div><div id="polygon-fields">${range('sides','Sides','',1)}</div><div id="square-fields">${range('cornerRadius','Roundness','%',1,100)}</div><div id="star-fields">${range('lobes','Petals / points','',1)}${range('lobeDepth','Petal depth','%',1,100)}</div></div></details>
    <details class="control-accordion"><summary>Twist & lean</summary><div><div id="outline-twist-fields">${range('twistBottom','Twist at base','°',1)}${range('twistTop','Twist at rim','°',1)}${range('twistEase','Twist easing','',.05)}</div>${range('leanX','Lean left / right','mm',1)}${range('leanY','Lean front / back','mm',1)}<p class="field-help">Lean offsets the rim from the centre of the base.</p></div></details>
    <details class="control-accordion"><summary>Vertical wave</summary><div>${range('zWaveAmplitude','Wave height','mm',.1)}<div id="z-wave-fields">${range('zWaveCount','Waves around','',1)}${range('zWaveRows','Waves vertically','',1)}${range('zWavePhase','Phase','°',1)}${range('zWaveFade','Fade at ends','%',1,100)}</div><p class="field-help">Moves the surface vertically while retaining a flat base. Large waves may need a smaller amplitude.</p></div></details>
    <details class="control-accordion"><summary>Inner clearance</summary><div><p class="field-help" id="cavity-size"></p><p class="field-help">Body diameter excludes relief and the rim. Preview measurements are approximate; export checks the final mesh.</p></div></details>`;
  $('tab-surface').innerHTML=`<div class="effects-heading"><span id="effects-count">Effects</span><button class="btn quiet" id="add-effect"><svg><use href="#i-plus"/></svg>Add effect</button></div><div id="effect-list" class="effect-list"></div><div id="effect-editor"></div><details class="control-accordion"><summary>Openings through the wall</summary><div>${select('perforation','Cut-outs')}<div id="perforation-fields">${range('perforationCount','Openings around','',1)}${range('perforationRows','Rows','',1)}${range('perforationSize','Opening size','%',1,100)}<div class="construction-note warning"><svg><use href="#i-info"/></svg><span>Real cut-outs in the STL. Use a liner for soil or water, and inspect unsupported edges in your slicer.</span></div></div></div></details>`;
  $('tab-build').innerHTML=`<div class="control-group"><h3 class="group-title">Wall & base</h3>${range('wallThickness','Radial wall','mm',.1)}<p class="field-help">Measured towards the centre. Curves and deep relief can have a thinner perpendicular wall.</p><hr class="control-divider">${select('baseMode','Base construction')}<div id="base-thickness-field">${range('baseThickness','Base thickness','mm',.1)}</div><div id="hole-fields">${range('holeDiameter','Hole diameter','mm',.5)}<p class="field-help" id="hole-help"></p></div></div><details class="control-accordion" open><summary>Rim</summary><div>${range('rimHeight','Rim height','mm',.5)}${range('rimWidth','Extra rim width','mm',.1)}</div></details><details class="control-accordion" id="foot-accordion"><summary>Recessed underside</summary><div>${range('footHeight','Recess depth','mm',.5)}${range('footInset','Standing rim width','mm',.5)}<p class="field-help">Leaves a continuous standing rim. Check the underside bridge in your slicer.</p></div></details><div class="construction-note" id="shade-note" hidden><svg><use href="#i-info"/></svg><span>Use a cool LED light source with clearance and ventilation. Measure the actual holder. This model is a shade, not an electrical fitting.</span></div><div class="construction-note" id="water-note"><svg><use href="#i-info"/></svg><span>A closed mesh does not guarantee a watertight print. Use a liner when required.</span></div><div class="construction-note warning" id="geometry-warnings" hidden></div><p class="field-help print-help">Allow room for a brim. Inspect overhangs and thin walls in your slicer. Exported STLs contain a hollow, solid-wall model; use normal slicing.</p>`;
  bindControls();
}

function bindControls() {
  for(const input of $$('[data-key]')) input.addEventListener(input.type==='range'?'input':'change',()=>{
    const key=input.dataset.key,value=input.tagName==='SELECT'?input.value:Number(input.value)/Number(input.dataset.scale||1);
    if(input.tagName!=='SELECT'&&(!input.value||!Number.isFinite(value))){syncControls();return;}
    if(key==='objectType'){
      let next={...params,objectType:value};
      if(value==='lampshade'&&['closed','drain'].includes(params.baseMode))next={...next,baseMode:'mount',holeDiameter:42};
      if(value==='planter'&&params.baseMode==='open')next={...next,baseMode:'drain',holeDiameter:10};
      replaceParams(next,{id:savedId,resetView:false});
    }else commitChange(key,value);
  });
  $$('[data-interpolation]').forEach(button=>button.addEventListener('click',()=>{
    remember('interpolation');params=normalizeParams({...params,profile:'custom',profilePoints:editableProfile(),profileInterpolation:button.dataset.interpolation});selectedPreset='';markChanged();syncControls();renderPresets();queuePreview();
  }));
  $('add-profile-point').addEventListener('click',()=>{
    const points=editableProfile();if(points.length>=12){toast('The profile supports up to 12 points. Remove a point in Point values to add another.');return;}
    let gap=0,index=0;for(let i=0;i<points.length-1;i++)if(points[i+1].z-points[i].z>gap){gap=points[i+1].z-points[i].z;index=i;}
    points.splice(index+1,0,{z:(points[index].z+points[index+1].z)/2,r:(points[index].r+points[index+1].r)/2});commitProfile(points);
  });
  $('reset-profile').addEventListener('click',()=>commitProfile(clone(DEFAULTS.profilePoints)));
  const curve=$('profile-curve');let dragged=-1;
  curve.addEventListener('pointerdown',event=>{const target=event.target.closest('[data-point]');if(!target)return;dragged=Number(target.dataset.point);curve.setPointerCapture(event.pointerId);lastEdit={key:'',at:0};event.preventDefault();});
  curve.addEventListener('pointermove',event=>{
    if(dragged<0)return;const matrix=curve.getScreenCTM();if(!matrix)return;const point=curve.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const {x,y}=point.matrixTransform(matrix.inverse());
    const points=editableProfile(),i=dragged;if(!points[i])return;points[i].r=Math.max(.12,Math.min(1.5,(x-65)/52));
    if(i>0&&i<points.length-1)points[i].z=Math.max(points[i-1].z+.025,Math.min(points[i+1].z-.025,(190-y)/170));commitProfile(points);
  });
  for(const name of ['pointerup','pointercancel'])curve.addEventListener(name,()=>{dragged=-1;lastEdit={key:'',at:0};});
  $('add-effect').addEventListener('click',()=>{const effects=getEffects();if(effects.length>=4)return;const effect=normalizeEffect({...EFFECT_DEFAULTS,id:uuid(),pattern:effects.length?'coral':'ribs',depthBottom:1.5,depthTop:2.5,count:18,rows:6,fade:.08});activeEffectId=effect.id;commitChange('effects',[...effects,effect]);});
}

function syncControls() {
  $('design-name').value=params.name;$('design-category').textContent=categories[params.objectType]||'OBJECT';$('export-quality').value=params.quality;$('preview-detail').value=params.previewQuality||'preview';
  $$('[data-key]').forEach(input=>{let value=params[input.dataset.key];if(value===null)value=input.dataset.key==='twistTop'?params.twist:input.dataset.key==='aspectRatioTop'?params.aspectRatio:0;if(value===undefined)return;if(input.tagName==='SELECT')input.value=value;else{const scaled=value*Number(input.dataset.scale||1);input.value=Number(scaled.toFixed(3));if(input.type==='range')input.style.setProperty('--range-progress',`${(scaled-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);}});
  $$('[data-interpolation]').forEach(button=>{const active=button.dataset.interpolation===params.profileInterpolation;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $$('.colour-swatch').forEach(button=>{const active=button.dataset.color===params.color;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  const show=(id,condition)=>{if($(id))$(id).hidden=!condition;};
  show('profile-ratios',!['custom','cylinder'].includes(params.profile));show('belly-fields',['barrel','bulb','hourglass','trumpet','bowl'].includes(params.profile));show('belly-position-field',params.profile==='bulb');
  show('ellipse-fields',params.crossSection==='ellipse');show('polygon-fields',params.crossSection==='polygon');show('square-fields',params.crossSection==='rounded-square');show('star-fields',params.crossSection==='star');show('outline-twist-fields',params.crossSection!=='circle');
  show('z-wave-fields',params.zWaveAmplitude>0);show('perforation-fields',params.perforation!=='none');show('base-thickness-field',params.baseMode!=='open');show('hole-fields',['drain','mount'].includes(params.baseMode));show('foot-accordion',params.baseMode!=='open');show('shade-note',params.objectType==='lampshade');show('water-note',params.objectType!=='lampshade');
  const rim=document.querySelector('[data-field="rimWidth"]');if(rim)rim.hidden=params.rimHeight===0;const foot=document.querySelector('[data-field="footInset"]');if(foot)foot.hidden=params.footHeight===0;
  $('hole-help').textContent=params.baseMode==='mount'?'One circular hole through the bottom plate. Measure your holder and allow appropriate clearance.':'One circular drainage hole in the centre of the base.';
  renderProfileEditor();renderEffectUI();refreshDisplayedStats();$('dirty-indicator').classList.toggle('visible',dirty);
}

function editableProfile(){return clone(params.profile==='custom'?params.profilePoints:sampleProfile(params,9));}
function commitProfile(points){remember('profile-drag');params=normalizeParams({...params,profile:'custom',profilePoints:points});selectedPreset='';markChanged();syncControls();renderPresets();queuePreview();}
function renderProfileEditor() {
  const pts=editableProfile(),xy=(p,side=1)=>`${(65+side*52*p.r).toFixed(2)},${(190-170*p.z).toFixed(2)}`;
  const slopes=[];for(let i=0;i<pts.length-1;i++)slopes.push((pts[i+1].r-pts[i].r)/(pts[i+1].z-pts[i].z));
  const tangents=pts.map((p,i)=>i===0?slopes[0]:i===pts.length-1?slopes.at(-1):slopes[i-1]*slopes[i]<=0?0:2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]));
  let path=`M${xy(pts[0])}`;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],h=b.z-a.z;path+=params.profileInterpolation==='linear'?` L${xy(b)}`:` C${xy({r:a.r+tangents[i]*h/3,z:a.z+h/3})} ${xy({r:b.r-tangents[i+1]*h/3,z:b.z-h/3})} ${xy(b)}`;}
  const fill=`${path} L65,20 L65,190 Z`;
  $('profile-curve').innerHTML=`<path d="M65 15v180M15 190h135M15 105h135M15 20h135M117 15v180" stroke="#d9dfce" stroke-dasharray="3 4"/><path d="${fill}" fill="#e7eadb" stroke="none"/><path d="${path}" stroke="#8c9b79" stroke-width="1.5" fill="none"/>${pts.map((p,i)=>`<circle data-point="${i}" cx="${65+52*p.r}" cy="${190-170*p.z}" r="4.3" fill="#fffef9" stroke="#879a70" stroke-width="1.4"/>`).join('')}`;
  const holder=$('profile-point-fields');
  if(holder.childElementCount!==pts.length){
    holder.innerHTML=pts.map((p,i)=>`<div class="field"><div class="field-head"><div class="field-label profile-points-label">${i===0?'Base':i===pts.length-1?'Rim':`At <input class="profile-height-number" data-height-point="${i}" type="number" min="1" max="99" step="1" aria-label="Height of profile point ${i+1}">%`}</div>${i>0&&i<pts.length-1?`<button class="point-delete" data-remove-point="${i}" aria-label="Remove profile point ${i+1}">×</button>`:''}<div class="number-wrap"><input id="profile-radius-${i}" data-radius-point="${i}" type="number" min="12" max="150" step="1" aria-label="Radius of profile point ${i+1}"><span>%</span></div></div><input type="range" class="range-input" data-radius-point="${i}" min="12" max="150" step="1" aria-label="Radius of profile point ${i+1} slider"></div>`).join('');
    $$('[data-radius-point]',holder).forEach(input=>input.addEventListener(input.type==='range'?'input':'change',()=>{if(!input.value)return;const points=editableProfile();points[Number(input.dataset.radiusPoint)].r=Number(input.value)/100;commitProfile(points);}));
    $$('[data-height-point]',holder).forEach(input=>input.addEventListener('change',()=>{if(!input.value)return;const points=editableProfile(),i=Number(input.dataset.heightPoint);points[i].z=Math.max(points[i-1].z+.025,Math.min(points[i+1].z-.025,Number(input.value)/100));commitProfile(points);}));
    $$('[data-remove-point]',holder).forEach(button=>button.addEventListener('click',()=>{const points=editableProfile();points.splice(Number(button.dataset.removePoint),1);commitProfile(points);}));
  }
  pts.forEach((p,i)=>{$$(`[data-radius-point="${i}"]`,holder).forEach(input=>{input.value=Math.round(p.r*100);if(input.type==='range')input.style.setProperty('--range-progress',`${(p.r*100-12)/138*100}%`);});const height=holder.querySelector(`[data-height-point="${i}"]`);if(height)height.value=Math.round(p.z*100);});
}

function getEffects(){return Array.isArray(params.effects)?clone(params.effects):(params.pattern==='smooth'?[]:[createEffectFromLegacy(params,'legacy-effect')]);}
function selectedEffect(){return getEffects().find(effect=>effect.id===activeEffectId)||null;}
function updateEffect(key,value){const effects=getEffects(),i=effects.findIndex(effect=>effect.id===activeEffectId);if(i<0)return;effects[i]={...effects[i],[key]:value};commitChange('effects',effects,'effect-'+activeEffectId+'-'+key);}
function effectRange(key,label,unit='',step=1,scale=1){const bounds=EFFECT_LIMITS[key]||[0,1],min=bounds[0]*scale,max=bounds[1]*scale;return `<div class="field" data-effect-field="${key}"><div class="field-head"><label class="field-label" for="effect-number-${key}">${label}</label><div class="number-wrap"><input id="effect-number-${key}" data-effect-key="${key}" data-scale="${scale}" type="number" min="${min}" max="${max}" step="${step}" aria-label="Effect ${label}"><span>${unit}</span></div></div><input type="range" class="range-input" data-effect-key="${key}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" aria-label="Effect ${label} slider"></div>`;}
function effectSelect(key,label,choices){return `<div class="field"><label class="field-label" for="effect-select-${key}">${label}</label><select class="select-input" id="effect-select-${key}" data-effect-key="${key}">${choices.map(([value,name])=>`<option value="${value}">${name}</option>`).join('')}</select></div>`;}

function renderEffectUI() {
  const effects=getEffects();if(!effects.some(effect=>effect.id===activeEffectId)){activeEffectId=effects[0]?.id||null;stopPainting();}
  $('effects-count').textContent=`Effects · ${effects.length} / 4`;$('add-effect').disabled=effects.length>=4;
  $('effect-list').innerHTML=effects.map((effect,i)=>`<div class="effect-card ${effect.id===activeEffectId?'active':''} ${effect.enabled?'':'disabled'}"><div class="effect-card-main"><button class="effect-select" data-select-effect="${escapeHTML(effect.id)}"><span class="effect-number">${i+1}</span>${patternIcon(effect.pattern)}<span>${effect.pattern==='image'?'Image mapper':optionLabel('pattern',effect.pattern)}</span></button><input class="switch-input" type="checkbox" data-enable-effect="${escapeHTML(effect.id)}" ${effect.enabled?'checked':''} aria-label="Enable ${escapeHTML(effect.pattern)} effect"></div><div class="effect-tools"><button data-effect-up="${escapeHTML(effect.id)}" ${i===0?'disabled':''} aria-label="Move effect up" title="Move up">↑</button><button data-effect-down="${escapeHTML(effect.id)}" ${i===effects.length-1?'disabled':''} aria-label="Move effect down" title="Move down">↓</button><button data-effect-copy="${escapeHTML(effect.id)}" ${effects.length>=4?'disabled':''} aria-label="Duplicate effect" title="Duplicate">Duplicate</button><button class="effect-delete" data-effect-delete="${escapeHTML(effect.id)}" aria-label="Remove effect" title="Remove"><svg><use href="#i-trash"/></svg></button></div></div>`).join('');
  $$('[data-select-effect]').forEach(button=>button.addEventListener('click',()=>{activeEffectId=button.dataset.selectEffect;stopPainting();renderEffectUI();}));
  $$('[data-enable-effect]').forEach(input=>input.addEventListener('change',()=>{const next=getEffects(),effect=next.find(e=>e.id===input.dataset.enableEffect);effect.enabled=input.checked;commitChange('effects',next);}));
  for(const [attribute,direction] of [['effectUp',-1],['effectDown',1]])$$(`[data-${attribute.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}]`).forEach(button=>button.addEventListener('click',()=>{const next=getEffects(),i=next.findIndex(e=>e.id===button.dataset[attribute]),j=i+direction;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];commitChange('effects',next);}));
  $$('[data-effect-copy]').forEach(button=>button.addEventListener('click',()=>{const next=getEffects(),effect=clone(next.find(e=>e.id===button.dataset.effectCopy));effect.id=uuid();next.push(effect);activeEffectId=effect.id;commitChange('effects',next);}));
  $$('[data-effect-delete]').forEach(button=>button.addEventListener('click',()=>{stopPainting();commitChange('effects',getEffects().filter(e=>e.id!==button.dataset.effectDelete));}));
  const effect=effects.find(e=>e.id===activeEffectId);if(!effect){$('effect-editor').innerHTML='<div class="effect-empty">No surface effects.<br>Add a pattern or image map to begin.</div>';effectUiSignature='';return;}
  const signature=[effect.id,effect.pattern,!!effect.mask,effect.image?.name||'',effect.imageMode].join('|');
  if(signature!==effectUiSignature){effectUiSignature=signature;
    $('effect-editor').innerHTML=`${effectSelect('pattern','Selected effect',OPTIONS.pattern.map(value=>[value,value==='image'?'Image mapper':optionLabel('pattern',value)]))}<div class="effect-mask-tabs segmented" role="group" aria-label="Effect area"><button data-mask-mode="all">All over</button><button data-mask-mode="paint">Painted area</button></div><div id="mask-controls"></div><div id="image-controls"></div><div id="effect-pattern-controls"><div class="effect-depth-grid">${effectRange('depthBottom','Depth bottom','mm',.1)}${effectRange('depthTop','Depth top','mm',.1)}</div>${effectRange('count','Repeats around','',1)}${effectRange('rows','Repeats vertically','',1)}${effectRange('sharpness','Sharpness','',.05)}<details class="control-accordion" open><summary>Position on the form</summary><div><div class="height-band"><span id="effect-height-band"></span></div>${effectRange('start','Start height','%',1,100)}${effectRange('end','End height','%',1,100)}${effectRange('fade','Transition','%',1,100)}</div></details><details class="control-accordion"><summary>Twist & variation</summary><div>${effectRange('twist','Twist','°',1)}${effectRange('twistEase','Twist easing','',.05)}${effectRange('phase','Phase','°',1)}${effectRange('variation','Depth variation','%',1,100)}${effectRange('seed','Variation seed','',1)}<button class="text-btn" id="new-effect-seed">New variation</button></div></details><details class="control-accordion"><summary>Combine with earlier effects</summary><div>${effectSelect('blend','Blend mode',[['add','Add relief'],['max','Use the greater relief'],['replace','Replace earlier relief']])}<p class="field-help">Effects are applied from top to bottom. The painted area and height range limit this effect.</p></div></details></div>`;
    $$('[data-effect-key]',$('effect-editor')).forEach(input=>input.addEventListener(input.type==='range'?'input':'change',()=>{const key=input.dataset.effectKey,value=input.tagName==='SELECT'?input.value:Number(input.value)/Number(input.dataset.scale||1);if(input.tagName!=='SELECT'&&(!input.value||!Number.isFinite(value)))return;updateEffect(key,value);}));
    $$('[data-mask-mode]').forEach(button=>button.addEventListener('click',()=>{stopPainting();if(button.dataset.maskMode==='all')updateEffect('mask',null);else if(!selectedEffect()?.mask){updateEffect('mask',blankMask(0));setPainting(true);}else setPainting(true);}));
    $('new-effect-seed').addEventListener('click',()=>updateEffect('seed',Math.floor(Math.random()*100000)));
    renderMaskControls(effect);renderImageControls(effect);
  }
  $$('[data-effect-key]').forEach(input=>{const value=effect[input.dataset.effectKey];if(input.tagName==='SELECT')input.value=value;else{const n=Number(value)*Number(input.dataset.scale||1);input.value=Number(n.toFixed(3));if(input.type==='range')input.style.setProperty('--range-progress',`${(n-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);}});
  $$('[data-mask-mode]').forEach(button=>{const active=(button.dataset.maskMode==='paint')===!!effect.mask;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  const band=$('effect-height-band');if(band){band.style.left=`${effect.start*100}%`;band.style.right=`${(1-effect.end)*100}%`;}
  const controls=$('effect-pattern-controls');if(controls)controls.hidden=effect.pattern==='smooth';
  const rows=document.querySelector('[data-effect-field="rows"]');if(rows)rows.hidden=['ribs','flutes'].includes(effect.pattern)||(effect.pattern==='image'&&effect.imageMode==='relief');
  const count=document.querySelector('[data-effect-field="count"]');if(count)count.hidden=effect.pattern==='image'&&effect.imageMode==='relief';
  if(effect.mask){drawRaster($('mask-preview'),effect.mask);viewer?.setPaintMask?.(effect.mask);}else viewer?.setPaintMask?.(null);
  if(effect.image)drawRaster($('image-preview'),effect.image);
  if($('image-invert'))$('image-invert').checked=effect.imageInvert;
}

function blankMask(value=0){return {width:64,height:64,data:bytesToBase64(new Uint8Array(4096).fill(value)),invert:false};}
function bytesToBase64(bytes){let text='';for(let i=0;i<bytes.length;i++)text+=String.fromCharCode(bytes[i]);return btoa(text);}
function rasterBytes(raster){return Uint8Array.from(atob(raster.data),character=>character.charCodeAt(0));}
function paintMaskBytes(mask){
  if(!mask)return new Uint8Array(4096);
  const source=rasterBytes(mask),output=new Uint8Array(4096),w=mask.width,h=mask.height;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const sx=(x+.5)/64*w-.5,sy=Math.max(0,Math.min(h-1,(y+.5)/64*h-.5)),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    const value=(xx,yy)=>source[Math.min(h-1,yy)*w+((xx%w)+w)%w];
    const pixel=(value(x0,y0)*(1-fx)+value(x0+1,y0)*fx)*(1-fy)+(value(x0,y0+1)*(1-fx)+value(x0+1,y0+1)*fx)*fy;
    output[y*64+x]=Math.round(mask.invert?255-pixel:pixel);
  }
  return output;
}
function drawRaster(canvas,raster){if(!canvas||!raster)return;canvas.width=raster.width;canvas.height=raster.height;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(raster.width,raster.height),values=rasterBytes(raster);for(let i=0;i<values.length;i++){const value=raster.invert?255-values[i]:values[i];pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=value;pixels.data[i*4+3]=255;}ctx.putImageData(pixels,0,0);}
function stopPainting(){paintState.enabled=false;paintBytes=null;viewer?.setPaintMode?.({...paintState});if($('paint-toolbar'))$('paint-toolbar').hidden=true;syncPaintButtons();}
function setPainting(enabled){const effect=selectedEffect();if(!effect)return;if(enabled&&!effect.mask)updateEffect('mask',blankMask(0));paintState.enabled=enabled;viewer?.setPaintMode?.({...paintState});viewer?.setPaintMask?.(selectedEffect()?.mask||null);$('paint-toolbar').hidden=!enabled;syncPaintButtons();if(enabled&&window.innerWidth<861)$('viewport').scrollIntoView({behavior:'smooth',block:'center'});}
function syncPaintButtons(){if($('paint-toggle')){$('paint-toggle').textContent=paintState.enabled?'Painting…':'Paint on model';$('paint-toggle').classList.toggle('active',paintState.enabled);}for(const id of ['paint-erase','paint-erase-overlay'])if($(id)){$(id).classList.toggle('active',paintState.erase);$(id).setAttribute('aria-pressed',String(paintState.erase));}}
function renderMaskControls(effect){
  const holder=$('mask-controls');if(!effect.mask){holder.innerHTML='';return;}
  holder.innerHTML=`<div class="brush-controls"><div class="brush-actions"><button class="btn secondary" id="paint-toggle">Paint on model</button><button class="btn quiet" id="paint-erase" aria-pressed="false">Erase</button></div><div class="field"><div class="field-head"><label class="field-label" for="brush-size">Brush size</label><span class="small-muted" id="brush-size-value"></span></div><input id="brush-size" type="range" class="range-input" min="1" max="25" step="1" value="${paintState.size*100}"></div><div class="field"><div class="field-head"><label class="field-label" for="brush-strength">Strength</label><span class="small-muted" id="brush-strength-value"></span></div><input id="brush-strength" type="range" class="range-input" min="5" max="100" step="5" value="${paintState.strength*100}"></div><div class="raster-preview"><canvas id="mask-preview" aria-label="Paint mask preview"></canvas><div>White applies the effect.<br>Black keeps the form smooth.</div></div><div class="effect-inline-actions"><button class="text-btn" data-mask-fill="0">Clear</button><button class="text-btn" data-mask-fill="255">Fill all</button><button class="text-btn" id="invert-mask">Invert</button></div><p class="brush-note">Paint directly on the form. Choose Done above the model to orbit again.</p></div>`;
  $('paint-toggle').addEventListener('click',()=>setPainting(!paintState.enabled));$('paint-erase').addEventListener('click',()=>{paintState.erase=!paintState.erase;viewer?.setPaintMode?.({...paintState});syncPaintButtons();});
  const brush=()=>{paintState.size=Number($('brush-size').value)/100;paintState.strength=Number($('brush-strength').value)/100;$('brush-size-value').textContent=`${Math.round(paintState.size*100)}%`;$('brush-strength-value').textContent=`${Math.round(paintState.strength*100)}%`;viewer?.setPaintMode?.({...paintState});};
  $('brush-size').addEventListener('input',brush);$('brush-strength').addEventListener('input',brush);brush();
  $$('[data-mask-fill]').forEach(button=>button.addEventListener('click',()=>updateEffect('mask',blankMask(Number(button.dataset.maskFill)))));
  $('invert-mask').addEventListener('click',()=>{const mask=selectedEffect().mask;updateEffect('mask',{...mask,invert:!mask.invert});});syncPaintButtons();
}
function paintSurface(event){
  if(!paintState.enabled)return;
  const effects=getEffects(),index=effects.findIndex(effect=>effect.id===activeEffectId);if(index<0)return;
  if(event.phase==='start'){remember('paint-'+Date.now());paintBytes=paintMaskBytes(effects[index].mask);}
  if(event.phase==='end'){paintBytes=null;persistDraft();renderEffectUI();queuePreview();return;}
  if(!Number.isFinite(event.u)||!Number.isFinite(event.v))return;
  if(!paintBytes)paintBytes=paintMaskBytes(effects[index].mask);
  const size=Math.max(.01,event.size||paintState.size),strength=event.strength??paintState.strength,u=((event.u%1)+1)%1,v=Math.max(0,Math.min(1,event.v));
  for(let y=Math.max(0,Math.floor((v-size)*64));y<=Math.min(63,Math.ceil((v+size)*64));y++)for(let x=0;x<64;x++){
    const raw=Math.abs((x+.5)/64-u),dx=Math.min(raw,1-raw),dy=(y+.5)/64-v,distance=Math.hypot(dx,dy)/size;if(distance>=1)continue;
    const weight=(1-distance*distance)**2*strength,id=y*64+x;paintBytes[id]=event.erase?Math.round(paintBytes[id]*(1-weight)):Math.round(paintBytes[id]+(255-paintBytes[id])*weight);
  }
  effects[index].mask={width:64,height:64,data:bytesToBase64(paintBytes),invert:false};params={...params,effects};selectedPreset='';dirty=true;lastExportStats=null;$('dirty-indicator').classList.add('visible');viewer?.setPaintMask?.(effects[index].mask);drawRaster($('mask-preview'),effects[index].mask);queuePreview();
}

function renderImageControls(effect){
  const holder=$('image-controls');if(effect.pattern!=='image'){holder.innerHTML='';return;}
  holder.innerHTML=`${effect.image?`<div class="raster-preview"><canvas id="image-preview" aria-label="Imported grayscale image"></canvas><div><strong>${escapeHTML(effect.image.name||'Image map')}</strong>${effect.image.width} × ${effect.image.height} grayscale map</div></div>`:''}<label class="raster-upload"><svg><use href="#i-upload"/></svg>${effect.image?'Replace image':'Choose an image'}<span>PNG, JPG or WebP · processed locally</span><input id="effect-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${effectSelect('imageMode','Mapping',[['relief','Relief — brightness becomes depth'],['folds','Folds — image bends the ribs']])}<div class="effect-depth-grid">${effectRange('imageRepeatX','Repeat around','',1)}${effectRange('imageRepeatY','Repeat vertically','',1)}</div>${effectRange('imageOffsetX','Horizontal offset','%',1,100)}${effectRange('imageOffsetY','Vertical offset','%',1,100)}<label class="field-head"><span class="field-label">Invert brightness</span><input class="switch-input" type="checkbox" id="image-invert" ${effect.imageInvert?'checked':''}></label><p class="field-help">The image wraps around the full form. White creates maximum relief; transparent areas become black.</p><hr class="control-divider">`;
  $$('[data-effect-key]',holder).forEach(input=>input.addEventListener(input.type==='range'?'input':'change',()=>{if(!input.value)return;updateEffect(input.dataset.effectKey,input.tagName==='SELECT'?input.value:Number(input.value)/Number(input.dataset.scale||1));}));
  $('image-invert').addEventListener('change',()=>updateEffect('imageInvert',$('image-invert').checked));$('effect-image-file').addEventListener('change',event=>{importImage(event.target.files[0]);event.target.value='';});
}
async function importImage(file){
  const targetId=activeEffectId;
  if(!file)return;if(file.size>10*1024*1024){toast('Choose an image smaller than 10 MB.',true);return;}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Choose a PNG, JPG or WebP image.',true);return;}
  try{const bitmap=await createImageBitmap(file);if(bitmap.width>16000||bitmap.height>16000){bitmap.close();throw new Error('Choose an image under 16,000 pixels in either direction.');}const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#000';ctx.fillRect(0,0,128,128);ctx.drawImage(bitmap,0,0,128,128);bitmap.close();const rgba=ctx.getImageData(0,0,128,128).data,bytes=new Uint8Array(128*128);for(let i=0;i<bytes.length;i++)bytes[i]=Math.round(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2]);const effects=getEffects(),target=effects.find(effect=>effect.id===targetId);if(!target)throw new Error('The selected effect was removed. Choose an effect and import again.');target.image={width:128,height:128,data:bytesToBase64(bytes),name:file.name.slice(0,120)};commitChange('effects',effects,'image-import');toast('Image mapped to the selected effect. Adjust depth and mapping below.');}catch(error){toast(`Could not read image: ${error.message}`,true);}
}

function thumbnail(p,unique='preview') {
  // Decorative silhouettes only; the central WebGL model is the exact printable mesh.
  const height=Math.max(40,Math.min(83,70*(p.height/p.diameter)**.35)),baseY=94,scale=27;
  const points=[];
  for(let i=0;i<=20;i++){
    const t=i/20,s=Math.sin(Math.PI*t);let r=(p.bottomRatio||.7)*(1-t)+(p.topRatio||1)*t;
    if(p.profile==='barrel')r+=(p.belly||.2)*s;
    if(p.profile==='bulb')r+=(p.belly||.7)*Math.sin(Math.PI*t)**1.4;
    if(p.profile==='hourglass')r=Math.max(.18,r-(p.belly||.2)*s);
    if(p.profile==='trumpet')r=(p.bottomRatio||.7)+((p.topRatio||1)-(p.bottomRatio||.7))*t**2.4;
    if(p.profile==='bowl')r=(p.bottomRatio||.5)+((p.topRatio||1)-(p.bottomRatio||.5))*Math.sin(t*Math.PI/2);
    if(p.profile==='custom'&&p.profilePoints?.length){let index=0;while(index<p.profilePoints.length-2&&t>p.profilePoints[index+1].z)index++;const a=p.profilePoints[index],b=p.profilePoints[index+1];r=a.r+(b.r-a.r)*(t-a.z)/(b.z-a.z);}
    points.push({r,y:baseY-height*t});
  }
  const max=Math.max(...points.map(p=>p.r));points.forEach(p=>p.r=p.r/max*scale);
  const path=`M${75-points[0].r},${points[0].y} `+points.map(p=>`L${75-p.r},${p.y}`).join(' ')+points.slice().reverse().map(p=>`L${75+p.r},${p.y}`).join(' ')+' Z';
  const id=String(unique).replace(/[^a-z0-9_-]/gi,'');
  const texture= p.pattern==='smooth'?'':Array.from({length:13},(_,i)=>{const fraction=(i-6)/6;return `<path d="${points.map((p,j)=>`${j?'L':'M'}${75+p.r*fraction+Math.sin(j/20*Math.PI)*(p.patternTwist||0)/100},${p.y}`).join(' ')}" fill="none" stroke="#372c20" stroke-opacity="${p.pattern==='flutes'?.3:.18}" stroke-width="1.3"/>`;}).join('');
  const top=points.at(-1);
  return `<svg viewBox="0 0 150 108" aria-hidden="true"><defs><linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.color||'#c77d5d'}"/><stop offset=".34" stop-color="${p.color||'#c77d5d'}"/><stop offset="1" stop-color="#514737"/></linearGradient><clipPath id="c-${id}"><path d="${path}"/></clipPath></defs><ellipse cx="75" cy="96" rx="40" ry="6" fill="#121912" opacity=".5"/><path d="${path}" fill="url(#g-${id})"/> <g clip-path="url(#c-${id})">${texture}</g><ellipse cx="75" cy="${top.y}" rx="${top.r}" ry="4" fill="${p.color||'#c77d5d'}"/><ellipse cx="75" cy="${top.y}" rx="${Math.max(1,top.r-2)}" ry="2.3" fill="#4d4938" opacity=".85"/></svg>`;
}

function renderPresets() {
  const list=PRESETS.filter(p=>filter==='all'||p.category===filter||(filter==='bowl'&&p.category==='organiser'));
  $('preset-count').textContent=String(list.length);
  // Keep scroll position stable while sliders update the active state.
  if($('preset-list').dataset.filter===filter&&$('preset-list').childElementCount===list.length){$$('.preset-card').forEach(b=>{const active=b.dataset.preset===selectedPreset;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));const check=b.querySelector('.preset-check');if(check)check.hidden=!active;});return;}
  $('preset-list').dataset.filter=filter;
  $('preset-list').innerHTML=list.map(p=>`<button class="preset-card ${p.id===selectedPreset?'active':''}" data-preset="${p.id}" aria-pressed="${p.id===selectedPreset}" title="${escapeHTML(p.description)}"><span class="preset-art"><img class="preset-render" src="/presets/${p.id}.webp" alt="" loading="lazy"><svg class="preset-check" ${p.id===selectedPreset?'':'hidden'}><use href="#i-check"/></svg></span><span class="preset-card-name">${escapeHTML(p.name)}</span><span class="preset-card-description">${optionLabel('objectType',p.category)} · ${p.params.height} mm</span></button>`).join('');
  $$('.preset-render').forEach(image=>image.addEventListener('error',()=>{const preset=PRESETS.find(p=>p.id===image.closest('[data-preset]').dataset.preset);if(preset){const fallback=document.createElement('span');fallback.className='preset-render-fallback';fallback.innerHTML=thumbnail(preset.params,preset.id);image.replaceWith(fallback);}},{once:true}));
  $$('[data-preset]').forEach(button=>button.addEventListener('click',async()=>{const preset=PRESETS.find(p=>p.id===button.dataset.preset);if(!preset)return;if(dirty&&!await confirmAction('Start from this form?','Your current changes will stay available with Undo. Save first if you want to keep a separate copy.','Use form'))return;replaceParams(preset.params,{preset:preset.id});$('presets-dialog').close();}));
}

async function confirmAction(title,message,label='Continue') {
  $('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-accept').textContent=label;
  const dialog=$('confirm-dialog');dialog.showModal();
  return new Promise(resolve=>{
    const done=(value)=>{dialog.close();$('confirm-accept').removeEventListener('click',accept);$('confirm-cancel').removeEventListener('click',cancel);dialog.removeEventListener('close',closed);resolve(value);};
    const accept=()=>done(true),cancel=()=>done(false),closed=()=>done(false);
    $('confirm-accept').addEventListener('click',accept);$('confirm-cancel').addEventListener('click',cancel);dialog.addEventListener('close',closed);
  });
}

function download(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function filename(name,extension){return (name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'form-studio-design')+extension;}

async function exportModel(target) {
  if(exportBusy)return;
  const snapshot=clone(params),quality=$('export-quality').value,signature=JSON.stringify({...snapshot,quality});
  if(target==='library'&&activeRequest?.signature===signature&&activeRequest.uncertain){
    if(!await confirmAction('Send another copy?','The last transfer could not be confirmed. Check the Form Studio collection in Layer Library first. Continue only if you want a new upload, which could create a second copy.','Send new copy'))return;
    activeRequest=null;
  }
  exportBusy=true;setExportsDisabled(true);
  const buttons=target==='library'?[$('send-library')]:[$('download-stl'),$('download-stl-mobile')];buttons.forEach(b=>b.classList.add('busy'));
  toast(`Preparing ${quality} detail STL…`);
  try {
    const mesh=await requestMesh(snapshot,quality);const buffer=encodeSTL(mesh);const name=filename(snapshot.name,'.stl');
    const exportSize=mesh.stats.dimensions.map(d=>fmt(d,2)).join(' × ')+' mm';
    const exportFits=mesh.stats.dimensions.every((d,i)=>d<=config.bedSize[i]);
    if(JSON.stringify({...params,quality:params.quality})===signature){lastExportStats={stats:mesh.stats,quality};updateStats(mesh.stats,quality);}
    if(!exportFits)toast(`Export size ${exportSize} exceeds the configured build volume. Resize or split it before printing.`,true);
    if(target==='download'){
      download(new Blob([buffer],{type:'model/stl'}),name);toast(`${name} is ready · ${exportSize} · ${fmt(mesh.stats.triangles,0)} triangles.`);
    }else{
      if(!activeRequest||activeRequest.signature!==signature)activeRequest={id:uuid(),signature};
      await api('/api/layer-library/recipe',{method:'POST',json:{requestId:activeRequest.id,name:snapshot.name,params:{...snapshot,quality}}});
      const data=await api('/api/layer-library',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Request-ID':activeRequest.id,'X-Recipe-ID':activeRequest.id},body:buffer,timeout:90000});
      activeRequest=null;toast(data.warning||data.message||'Model added to Layer Library.',false,data.url||config.layerLibraryUrl);
    }
  }catch(error){
    if(target==='library'&&activeRequest){
      if(error.uncertain)activeRequest.uncertain=true;
      else if(error.httpStatus)activeRequest=null;
    }
    toast(error.message+(target==='library'&&error.uncertain?' Check Layer Library before exporting this design again.':''),true);
  }
  finally{exportBusy=false;buttons.forEach(b=>b.classList.remove('busy'));setExportsDisabled(!currentMesh);}
}

async function saveDesign() {
  const button=$('save-design');button.disabled=true;
  try{
    const snapshot=clone(params),data=await api('/api/designs',{method:'POST',json:{...(savedId?{id:savedId}:{}),name:snapshot.name,params:snapshot}});
    savedId=data.design.id;if(JSON.stringify(params)===JSON.stringify(snapshot)){dirty=false;$('dirty-indicator').classList.remove('visible');}persistDraft();toast('Design saved. Reopen it from My designs.');
  }catch(error){toast(`Could not save: ${error.message}`,true);}
  finally{button.disabled=false;}
}

async function openSaved() {
  savedView='designs';if(!$('saved-dialog').open)$('saved-dialog').showModal();await renderSaved();
}

async function renderSaved() {
  const trash=savedView==='trash',serial=++savedLoadSerial;
  $('saved-dialog-title').textContent=trash?'Trash':'My designs';
  $('saved-dialog-help').textContent=trash?'Restore a design to return it to My designs.':'Reopen a design to keep shaping it.';
  $('saved-list').setAttribute('aria-labelledby','saved-view-'+savedView);
  $$('[data-saved-view]').forEach(button=>{const active=button.dataset.savedView===savedView;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
  $('saved-list').innerHTML='<div class="empty-state">Loading designs…</div>';
  try{
    const data=await api(trash?'/api/trash':'/api/designs');
    if(serial!==savedLoadSerial)return;
    if(!data.designs.length){$('saved-list').innerHTML=trash?'<div class="empty-state"><strong>Trash is empty</strong>Designs moved to trash will appear here.</div>':'<div class="empty-state"><strong>No saved designs yet</strong>Save a design from the workspace, or import a recipe.</div>';return;}
    $('saved-list').innerHTML=data.designs.map((d,i)=>`<article class="saved-card">${trash?'<div class="saved-card-open">':`<button class="saved-card-open" data-design="${escapeHTML(d.id)}">`}<div class="preset-art">${thumbnail(normalizeParams(d.params),'saved-'+i)}</div><strong>${escapeHTML(d.name)}</strong><small>${new Date(d.updatedAt||d.createdAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</small>${trash?'</div>':'</button>'}${trash?`<button class="btn secondary saved-restore" data-restore-design="${escapeHTML(d.id)}" aria-label="Restore ${escapeHTML(d.name)}"><svg><use href="#i-reset"/></svg>Restore</button>`:`<button class="btn icon-btn saved-delete" data-delete-design="${escapeHTML(d.id)}" aria-label="Move ${escapeHTML(d.name)} to trash" title="Move to trash"><svg><use href="#i-trash"/></svg></button>`}</article>`).join('');
    $$('[data-design]').forEach(button=>button.addEventListener('click',async()=>{const design=data.designs.find(d=>d.id===button.dataset.design);if(dirty&&!await confirmAction('Open saved design?','Current changes are available with Undo. Save them first if you want to keep a separate copy.','Open design'))return;replaceParams(design.params,{id:design.id,clean:true});$('saved-dialog').close();}));
    $$('[data-delete-design]').forEach(button=>button.addEventListener('click',async()=>{const design=data.designs.find(d=>d.id===button.dataset.deleteDesign);if(!await confirmAction('Move design to trash?',`“${design.name}” will be removed from My designs. You can restore it from the Trash tab.`, 'Move to trash'))return;button.disabled=true;try{await api('/api/designs/'+encodeURIComponent(design.id),{method:'DELETE'});if(savedId===design.id){savedId=null;markChanged();}await renderSaved();toast('Design moved to trash. Restore it from the Trash tab.');}catch(error){button.disabled=false;toast(error.message,true);}}));
    $$('[data-restore-design]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/api/designs/'+encodeURIComponent(button.dataset.restoreDesign)+'/restore',{method:'POST'});await renderSaved();toast('Design restored to My designs.');}catch(error){button.disabled=false;toast(error.message,true);}}));
  }catch(error){if(serial===savedLoadSerial)$('saved-list').innerHTML=`<div class="empty-state">${escapeHTML(error.message)}</div>`;}
}

function exportRecipe(){download(new Blob([JSON.stringify({application:'Form Studio',schemaVersion:1,exportedAt:new Date().toISOString(),params},null,2)],{type:'application/json'}),filename(params.name,'.form.json'));toast('Editable recipe downloaded. Import it through My designs.');}

async function importRecipe(file) {
  if(!file)return;
  if(file.size>200000){toast('That recipe is too large. Choose a Form Studio JSON recipe under 200 KB.',true);return;}
  try{const data=JSON.parse(await file.text());if(data.application!=='Form Studio'||data.schemaVersion!==1||!data.params||typeof data.params!=='object'||Array.isArray(data.params))throw new Error('Choose a Form Studio version 1 recipe.');if(dirty&&!await confirmAction('Import this recipe?','Current changes are available with Undo. Save first to keep a separate copy.','Import recipe'))return;replaceParams(data.params);$('saved-dialog').close();toast('Recipe opened. Save it to add it to My designs.');}catch(error){toast(`Could not import recipe: ${error.message}`,true);}
}

function showRandomiseOptions(open) {
  $('randomise-options').hidden=!open;$('randomise-options-toggle').setAttribute('aria-expanded',String(open));
}

async function randomize() {
  if(randomiseBusy||exportBusy)return;
  showRandomiseOptions(false);
  randomiseBusy=true;const button=$('randomize');button.disabled=true;button.classList.add('busy');button.setAttribute('aria-busy','true');
  const original=JSON.stringify(params),originalGeneration=previewGeneration,options={...randomiseOptions};
  try{
    const result=randomiseDesign({...options,seed:uuid(),current:params});
    // Verify before replacing the current work; invalid size locks leave it intact.
    const mesh=await requestMesh(result.params,'draft');
    if(!mesh.stats.watertight)throw new Error('The generated form needs adjustment. Try Randomise again.');
    if(!options.keepDimensions&&!mesh.stats.dimensions.every((d,i)=>d<=config.bedSize[i]))throw new Error('This variation exceeds the build volume. Try Randomise again.');
    if(originalGeneration!==previewGeneration||JSON.stringify(params)!==original){toast('Your design changed while generating. Press Randomise again when ready.');return;}
    replaceParams(result.params);
    toast(`${result.name}. Use Undo to return to your previous design.`);
  }catch(error){toast(`Could not randomise: ${error.message}`,true);}
  finally{randomiseBusy=false;button.disabled=false;button.classList.remove('busy');button.removeAttribute('aria-busy');}
}

async function loadConfig() {
  try{const data=await api('/api/config');config={...config,...data};if(!Array.isArray(config.bedSize))config.bedSize=[256,256,256];$('connection-status').innerHTML='<span></span><span>Local studio</span>';$('connection-status').title='Connected to Form Studio';$('connection-status').classList.remove('offline');$('library-url').value=config.layerLibraryUrl||'';$('app-version').textContent=config.version||'1.2.0';viewer?.setBedSize(config.bedSize);$('printer-volume').textContent=config.bedSize.map(v=>fmt(v)).join(' × ')+' mm';$('build-volume-label').title='Configured build volume: '+$('printer-volume').textContent;setExportsDisabled(!currentMesh);refreshDisplayedStats();}
  catch{$('connection-status').innerHTML='<span></span><span>Browser draft</span>';$('connection-status').title='Server unavailable. STL downloads and the working browser draft remain available.';$('connection-status').classList.add('offline');}
}

function bindUI() {
  $('render-quality').value=renderQuality;$('layer-height').value=layerSpacing;$('toggle-gradient').classList.toggle('active',gradientEnabled);$('toggle-gradient').setAttribute('aria-pressed',String(gradientEnabled));$$('[data-display-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.displayMode===displayMode);button.setAttribute('aria-pressed',String(button.dataset.displayMode===displayMode));});
  $$('[data-tab]').forEach(button=>button.addEventListener('click',()=>{$$('[data-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});$$('.control-tab').forEach(panel=>{const active=panel.id==='tab-'+button.dataset.tab;panel.hidden=!active;panel.classList.toggle('active',active);});$('inspector-controls').scrollTop=0;}));
  $$('[data-category]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.category;$$('[data-category]').forEach(b=>b.classList.toggle('active',b===button));renderPresets();}));
  $('presets-open').addEventListener('click',()=>$('presets-dialog').showModal());
  $$('[data-mobile-panel]').forEach(button=>button.addEventListener('click',()=>{document.body.dataset.mobilePanel=button.dataset.mobilePanel;$$('[data-mobile-panel]').forEach(b=>b.classList.toggle('active',b===button));if(button.dataset.mobilePanel!=='shape')document.querySelector(`[data-tab="${button.dataset.mobilePanel}"]`).click();}));
  $('preview-detail').addEventListener('change',()=>commitChange('previewQuality',$('preview-detail').value));
  $$('[data-display-mode]').forEach(button=>button.addEventListener('click',()=>{displayMode=button.dataset.displayMode;persistView();viewer?.setDisplayMode?.(displayMode);$$('[data-display-mode]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});}));
  $('toggle-gradient').addEventListener('click',()=>{gradientEnabled=!gradientEnabled;persistView();viewer?.setGradient?.(gradientEnabled);$('toggle-gradient').classList.toggle('active',gradientEnabled);$('toggle-gradient').setAttribute('aria-pressed',String(gradientEnabled));});
  $('layer-height').addEventListener('change',()=>{const value=Math.max(.1,Math.min(2,Number($('layer-height').value)||.6));$('layer-height').value=value;layerSpacing=value;persistView();viewer?.setLayerHeight?.(value);});
  $('render-quality').addEventListener('change',()=>{renderQuality=$('render-quality').value;persistView();viewer?.setQuality?.(renderQuality);});
  $('paint-done').addEventListener('click',()=>stopPainting());
  $('paint-erase-overlay').addEventListener('click',()=>{paintState.erase=!paintState.erase;viewer?.setPaintMode?.({...paintState});syncPaintButtons();});
  $('design-name').addEventListener('change',()=>commitChange('name',$('design-name').value));
  $('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
  $('download-stl').addEventListener('click',()=>exportModel('download'));$('download-stl-mobile').addEventListener('click',()=>exportModel('download'));
  $('send-library').addEventListener('click',()=>exportModel('library'));$('save-design').addEventListener('click',saveDesign);$('saved-open').addEventListener('click',openSaved);
  $$('[data-saved-view]').forEach(button=>button.addEventListener('click',()=>{savedView=button.dataset.savedView;renderSaved();}));
  $('recipe-export').addEventListener('click',exportRecipe);$('recipe-import').addEventListener('change',event=>{importRecipe(event.target.files[0]);event.target.value='';});
  $('export-quality').addEventListener('change',()=>{params.quality=$('export-quality').value;markChanged();refreshDisplayedStats();if(!currentMesh)queuePreview();});
  $('reset-view').addEventListener('click',()=>viewer?.resetView());
  [['toggle-grid','setGrid'],['toggle-cut','setSection']].forEach(([id,method])=>$(id).addEventListener('click',()=>{const active=!$(id).classList.contains('active');$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));viewer?.[method](active);if(id==='toggle-cut'&&active)toast('Section view shows the inside. Your exported STL remains complete.');}));
  document.querySelector('.color-palette').innerHTML=colours.map(c=>`<button class="colour-swatch" data-color="${c.hex}" aria-label="${c.label} preview colour" title="${c.label}" aria-pressed="false"></button>`).join('');
  $$('.colour-swatch').forEach(b=>{b.style.backgroundColor=b.dataset.color;b.addEventListener('click',()=>{gradientEnabled=false;persistView();viewer?.setGradient?.(false);$('toggle-gradient').classList.remove('active');$('toggle-gradient').setAttribute('aria-pressed','false');commitChange('color',b.dataset.color);});});
  $('randomize').addEventListener('click',randomize);
  $('randomise-kind').value=randomiseOptions.kind;$('randomise-keep-size').checked=randomiseOptions.keepDimensions;
  $('randomise-options-toggle').addEventListener('click',()=>showRandomiseOptions($('randomise-options').hidden));
  const saveRandomiseOptions=()=>{randomiseOptions.kind=$('randomise-kind').value;randomiseOptions.keepDimensions=$('randomise-keep-size').checked;try{localStorage.setItem('form-studio-randomise-v1',JSON.stringify(randomiseOptions));}catch{}};
  $('randomise-kind').addEventListener('change',saveRandomiseOptions);$('randomise-keep-size').addEventListener('change',saveRandomiseOptions);
  document.addEventListener('click',event=>{if(!$('randomise-controls').contains(event.target))showRandomiseOptions(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('randomise-options').hidden){showRandomiseOptions(false);$('randomise-options-toggle').focus();}});
  $('settings-open').addEventListener('click',()=>{$('library-url').value=config.layerLibraryUrl||'';$('settings-status').textContent='';$('settings-dialog').showModal();});
  $('save-settings').addEventListener('click',async()=>{const button=$('save-settings');button.disabled=true;try{const data=await api('/api/config',{method:'PUT',json:{layerLibraryUrl:$('library-url').value.trim()}});config={...config,...data};activeRequest=null;setExportsDisabled(!currentMesh);$('settings-status').textContent='Settings saved.';toast('Layer Library address saved.');}catch(error){$('settings-status').textContent=error.message;}finally{button.disabled=false;}});
  $('test-library').addEventListener('click',async()=>{const button=$('test-library');button.disabled=true;$('settings-status').textContent='Checking Layer Library…';try{if($('library-url').value.trim()!==config.layerLibraryUrl)throw new Error('Save this address before testing the connection.');const data=await api('/api/layer-library/test',{method:'POST',json:{}});$('settings-status').textContent=data.message||'Layer Library is reachable.';}catch(error){$('settings-status').textContent=error.message;}finally{button.disabled=false;}});
  $$('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}}));
  document.addEventListener('keydown',event=>{if(!event.ctrlKey&&!event.metaKey)return;if(event.key.toLowerCase()==='s'){event.preventDefault();saveDesign();return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}if(event.key.toLowerCase()==='y'){event.preventDefault();redo();}});
  window.addEventListener('online',loadConfig);
}

buildControls();bindUI();syncControls();renderPresets();createWorker();
try{viewer=new ModelViewer($('viewport'));viewer.setGrid(false);viewer.setDisplayMode?.(displayMode);viewer.setGradient?.(gradientEnabled);viewer.setLayerHeight?.(layerSpacing);viewer.setQuality?.(renderQuality);viewer.onPaint=paintSurface;}catch(error){$('mesh-error').textContent='Your browser could not start the 3D view. Enable hardware acceleration or try another browser. You can still adjust controls and export an STL.';$('mesh-error').hidden=false;toast('3D preview unavailable in this browser.',true);}
$('viewport').addEventListener('viewer-error',event=>{$('mesh-error').textContent=event.detail;$('mesh-error').hidden=false;});
loadConfig();queuePreview();
