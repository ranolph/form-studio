import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { surfaceUV } from './geometry.js';

const TAU = Math.PI * 2;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const GRADIENT_BOTTOM = '#bba7ef', GRADIENT_MIDDLE = '#f5a6c6', GRADIENT_TOP = '#ff8958';

/** High-resolution model viewer. The optional software renderer uses exactly the
 * same mesh and camera, and never changes exported geometry or browser flags. */
export class ModelViewer {
  constructor(container) {
    this.container=container; this.quality='high'; this.displayMode='solid';
    this.gradient=false; this.layerHeight=.6; this.color='#c77d5d'; this.paintMode={enabled:false,erase:false,size:.05,strength:.65};
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(30,1,.1,20000);
    try {
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      this.renderer.setClearColor(0x000000,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.NeutralToneMapping;
      this.renderer.toneMappingExposure=1;
      this.renderer.localClippingEnabled=true;
      this.canvas=this.renderer.domElement;
    } catch (_) {
      this.renderer=null; this.canvas=document.createElement('canvas');
      this.context=this.canvas.getContext('2d',{alpha:true});
      if(!this.context) throw new Error('This browser cannot create a model preview.');
      this.startSoftwareWorker();
    }
    this.canvas.setAttribute('aria-label','Interactive 3D model'); this.canvas.setAttribute('role','img');
    this.canvas.dataset.renderer=this.renderer?'webgl':'software';
    this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
    container.prepend(this.canvas);
    this.controls=new OrbitControls(this.camera,this.canvas);
    this.controls.enableDamping=true; this.controls.dampingFactor=.13; this.controls.maxPolarAngle=Math.PI*.9;
    this.controls.addEventListener('change',()=>{this.needsRender=true;});
    this.scene.add(new THREE.HemisphereLight(0xffffff,0xdcd8ed,1.6));
    const key=new THREE.DirectionalLight(0xfff8f3,3.1); key.position.set(-260,350,340); this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xf3f5ff,1.2); fill.position.set(230,150,150); this.scene.add(fill);
    const rim=new THREE.DirectionalLight(0xffffff,1.3); rim.position.set(50,240,-250); this.scene.add(rim);
    this.material=new THREE.MeshStandardMaterial({color:this.color,roughness:.56,metalness:0,side:THREE.DoubleSide});
    this.uniforms={fsHeight:{value:140},fsGradient:{value:0},fsLayers:{value:0},fsLayerHeight:{value:.6},fsBottom:{value:new THREE.Color(GRADIENT_BOTTOM)},fsMiddle:{value:new THREE.Color(GRADIENT_MIDDLE)},fsTop:{value:new THREE.Color(GRADIENT_TOP)},fsMaskColor:{value:new THREE.Color('#5aa578')},fsMask:{value:null},fsShowMask:{value:0},fsMaskInvert:{value:0},fsLean:{value:new THREE.Vector2()},fsMaskSize:{value:new THREE.Vector2(64,64)}};
    this.material.onBeforeCompile=(shader)=>{
      Object.assign(shader.uniforms,this.uniforms);
      shader.vertexShader='attribute float fsVertexHeight;\nvarying float fsOriginalHeight;\nvarying vec3 fsPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfsPosition = position; fsOriginalHeight = fsVertexHeight;');
      shader.fragmentShader='varying vec3 fsPosition;\nvarying float fsOriginalHeight;\nuniform float fsHeight, fsGradient, fsLayers, fsLayerHeight, fsShowMask, fsMaskInvert;\nuniform vec3 fsBottom, fsMiddle, fsTop, fsMaskColor;\nuniform vec2 fsLean, fsMaskSize;\nuniform sampler2D fsMask;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float fsT = clamp(fsPosition.z / fsHeight, 0.0, 1.0);
        if (fsGradient > 0.5) {
          float gradientT = clamp((fsT - 0.04) / 0.92, 0.0, 1.0);
          diffuseColor.rgb = gradientT < 0.48
            ? mix(fsBottom, fsMiddle, smoothstep(0.0, 0.48, gradientT))
            : mix(fsMiddle, fsTop, smoothstep(0.48, 1.0, gradientT));
        }
        if (fsLayers > 0.5) {
          float p = fsPosition.z / fsLayerHeight;
          float visibility = 1.0-smoothstep(0.5,1.35,fwidth(p));
          float line = 0.5+0.5*cos(p*6.2831853);
          diffuseColor.rgb *= 1.0 - 0.22*visibility*pow(line,3.0);
        }
        if (fsShowMask > 0.5) {
          vec2 xy = fsPosition.xy - fsLean*fsT;
          float u = fract(atan(xy.y,xy.x)/6.2831853+1.0);
          vec2 maskUV = vec2(u + 0.5/fsMaskSize.x, ((1.0-fsOriginalHeight)*(fsMaskSize.y-1.0)+0.5)/fsMaskSize.y);
          float mask = texture2D(fsMask,maskUV).r;
          mask = mix(mask,1.0-mask,fsMaskInvert);
          diffuseColor.rgb = mix(diffuseColor.rgb,fsMaskColor,mask*0.46);
        }`);
    };
    this.sectionPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),0);
    this.bedGroup=new THREE.Group(); this.scene.add(this.bedGroup); this.setBedSize([256,256,256]);
    const shadowCanvas=document.createElement('canvas'); shadowCanvas.width=shadowCanvas.height=512;
    const ctx=shadowCanvas.getContext('2d'),g=ctx.createRadialGradient(256,256,0,256,256,250);
    g.addColorStop(0,'rgba(75,63,53,.21)');g.addColorStop(.45,'rgba(75,63,53,.10)');g.addColorStop(1,'rgba(75,63,53,0)');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
    this.shadowTexture=new THREE.CanvasTexture(shadowCanvas);
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2;this.shadow.position.y=-.35;this.scene.add(this.shadow);
    this.raycaster=new THREE.Raycaster(); this.pointer=new THREE.Vector2();
    this.cursor=document.createElement('div');this.cursor.className='paint-cursor';this.cursor.style.cssText='position:absolute;border:1.5px solid #a46e50;background:#a46e5015;border-radius:50%;pointer-events:none;z-index:4;display:none;transform:translate(-50%,-50%);';container.append(this.cursor);
    this.bindPainting();this.needsRender=true;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.frame=()=>{if(this.disposed)return;const changed=this.controls.update();if(changed||this.needsRender){this.render();this.needsRender=false;}this.animationId=requestAnimationFrame(this.frame);};this.frame();
    this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.container.dispatchEvent(new CustomEvent('viewer-error',{detail:'The 3D view lost its graphics connection. Reload to restore it; your current design is saved.'}));});
  }

  startSoftwareWorker() {
    this.softwareWorker=new Worker('/software-renderer.js',{type:'module'});
    this.softwareWorker.onmessage=({data})=>{
      if(data.type==='frame'){
        this.softwareBusy=false;
        if(data.version===this.meshVersion&&data.width===this.canvas.width&&data.height===this.canvas.height){
          this.displayedCamera=this.pendingSoftwareCamera;this.displayedMeshVersion=data.version;
          this.drawBackdrop(this.displayedCamera);this.context.drawImage(data.bitmap,0,0);this.canvas.dataset.rendered='true';
        }
        data.bitmap?.close();
        if(this.softwareAgain){this.softwareAgain=false;this.needsRender=true;}
      }
      if(data.error){this.softwareBusy=false;this.container.dispatchEvent(new CustomEvent('viewer-error',{detail:'The model preview could not finish. Reduce preview detail and try again.'}));}
    };
    this.softwareWorker.onerror=()=>{this.softwareBusy=false;this.container.dispatchEvent(new CustomEvent('viewer-error',{detail:'The compatible preview could not start. Try reloading the page.'}));};
  }

  render() {
    if(this.renderer){this.renderer.render(this.scene,this.camera);return;}
    if(!this.mesh)return;
    if(this.softwareBusy){this.softwareAgain=true;return;}
    this.camera.updateMatrixWorld();this.mesh.updateMatrixWorld();
    this.pendingSoftwareCamera=this.camera.clone();
    const mvp=new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse).multiply(this.mesh.matrixWorld);
    this.softwareBusy=true;
    this.softwareWorker.postMessage({type:'render',version:this.meshVersion,width:this.canvas.width,height:this.canvas.height,matrix:Array.from(mvp.elements),camera:this.camera.position.toArray(),color:this.color,gradient:this.gradient,mode:this.displayMode,layerHeight:this.layerHeight,section:!!this.section,mask:this.paintMode.enabled?this.paintMask:null,lean:[this.meshParams?.leanX||0,this.meshParams?.leanY||0],heightMm:this.meshParams?.height||this.dimensions[2]});
  }

  drawBackdrop(camera=this.camera) {
    const ctx=this.context,w=this.canvas.width,h=this.canvas.height;ctx.clearRect(0,0,w,h);
    const project=(x,y,z)=>{const p=new THREE.Vector3(x,y,z).project(camera);return [(p.x+1)*w/2,(1-p.y)*h/2];};
    if(this.dimensions){
      const c=project(0,0,0),half=Math.max(this.dimensions[0],this.dimensions[1])*.7,edge=project(half,0,0);
      const rx=Math.max(10,Math.hypot(edge[0]-c[0],edge[1]-c[1]));
      ctx.save();ctx.translate(c[0],c[1]);ctx.scale(1,.25);const g=ctx.createRadialGradient(0,0,0,0,0,rx*1.5);g.addColorStop(0,'rgba(75,63,53,.18)');g.addColorStop(1,'rgba(75,63,53,0)');ctx.fillStyle=g;ctx.fillRect(-rx*1.6,-rx*1.6,rx*3.2,rx*3.2);ctx.restore();
    }
    if(this.bedGroup.visible){
      ctx.strokeStyle='rgba(128,119,104,.15)';ctx.lineWidth=this.pixelRatio*.7;
      const [x,z]=this.bedSize;ctx.beginPath();
      for(let i=0;i<=16;i++)for(const points of [[-x/2+x*i/16,0,-z/2,-x/2+x*i/16,0,z/2],[-x/2,0,-z/2+z*i/16,x/2,0,-z/2+z*i/16]]){const a=project(...points.slice(0,3)),b=project(...points.slice(3));ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();
    }
  }

  setBedSize(size) {
    this.bedSize=size;
    for(const child of [...this.bedGroup.children]){this.bedGroup.remove(child);child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>m.dispose());else child.material?.dispose();}
    const grid=new THREE.GridHelper(Math.max(size[0],size[1]),16,0xa69b8e,0xbeb4a8);grid.position.y=-.55;grid.material.transparent=true;grid.material.opacity=.23;this.bedGroup.add(grid);this.needsRender=true;
  }

  setMesh(mesh,color,reset=false) {
    const previous=this.dimensions;this.dimensions=mesh.stats.dimensions;this.meshParams=mesh.params||{};
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(mesh.positions,3));geometry.setIndex(new THREE.BufferAttribute(mesh.indices,1));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const surfaceHeight=mesh.surfaceHeight||Float32Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions[i*3+2]/(this.meshParams.height||this.dimensions[2]));geometry.setAttribute('fsVertexHeight',new THREE.BufferAttribute(surfaceHeight,1));
    if(this.mesh){const old=this.mesh.geometry;this.mesh.geometry=geometry;old.dispose();}else{this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.rotation.x=-Math.PI/2;this.scene.add(this.mesh);}
    this.uniforms.fsHeight.value=this.meshParams.height||this.dimensions[2];this.uniforms.fsLean.value.set(this.meshParams.leanX||0,this.meshParams.leanY||0);this.setColor(color);
    this.shadow.scale.set(Math.max(this.dimensions[0],this.dimensions[1])*1.7,Math.max(this.dimensions[0],this.dimensions[1])*1.7,1);
    if(!this.renderer){
      this.meshVersion=(this.meshVersion||0)+1;
      const positions=mesh.positions.slice(),indices=mesh.indices.slice(),normals=geometry.getAttribute('normal').array.slice(),uvHeight=surfaceHeight.slice();
      this.softwareWorker.postMessage({type:'mesh',version:this.meshVersion,positions,indices,normals,surfaceHeight:uvHeight},[positions.buffer,indices.buffer,normals.buffer,uvHeight.buffer]);
    }
    if(!previous||reset)this.resetView();this.needsRender=true;
  }
  setColor(color){this.color=color||'#c77d5d';this.material.color.set(this.color);this.needsRender=true;}
  setGradient(value){this.gradient=!!value;this.uniforms.fsGradient.value=this.gradient?1:0;this.needsRender=true;}
  setLayerHeight(mm){this.layerHeight=clamp(Number(mm)||.6,.1,3);this.uniforms.fsLayerHeight.value=this.layerHeight;this.needsRender=true;}
  setDisplayMode(mode){this.displayMode=['solid','layers','wire'].includes(mode)?mode:'solid';this.material.wireframe=this.displayMode==='wire';this.uniforms.fsLayers.value=this.displayMode==='layers'?1:0;this.needsRender=true;}
  setQuality(value){this.quality=['balanced','high','ultra'].includes(value)?value:'high';this.resize();}
  setGrid(visible){this.bedGroup.visible=visible;this.needsRender=true;}
  setWireframe(visible){this.setDisplayMode(visible?'wire':'solid');}
  setSection(visible){this.section=!!visible;this.material.clippingPlanes=visible?[this.sectionPlane]:[];this.material.needsUpdate=true;this.needsRender=true;}
  setPaintMode(mode){this.paintMode={...this.paintMode,...mode};this.controls.enabled=!this.paintMode.enabled;this.controls.enableDamping=!this.paintMode.enabled;if(this.paintMode.enabled)this.controls.update();this.canvas.style.cursor=this.paintMode.enabled?'crosshair':'grab';if(!this.paintMode.enabled)this.cursor.style.display='none';this.uniforms.fsShowMask.value=this.paintMode.enabled&&this.paintMask?1:0;this.needsRender=true;}
  setPaintMask(mask){
    this.paintMask=mask;this.maskTexture?.dispose();this.maskTexture=null;
    if(mask?.data){try{const data=Uint8Array.from(atob(mask.data),c=>c.charCodeAt(0));this.maskTexture=new THREE.DataTexture(data,mask.width,mask.height,THREE.RedFormat);this.maskTexture.wrapS=THREE.RepeatWrapping;this.maskTexture.minFilter=this.maskTexture.magFilter=THREE.LinearFilter;this.maskTexture.needsUpdate=true;}catch{this.paintMask=null;}}
    this.uniforms.fsMaskSize.value.set(mask?.width||64,mask?.height||64);this.uniforms.fsMask.value=this.maskTexture;this.uniforms.fsMaskInvert.value=mask?.invert?1:0;this.uniforms.fsShowMask.value=this.paintMode.enabled&&this.paintMask?1:0;this.needsRender=true;
  }
  pick(event){
    if(!this.mesh||(!this.renderer&&this.displayedMeshVersion!==this.meshVersion))return null;const camera=this.renderer?this.camera:this.displayedCamera;if(!camera)return null;const rect=this.canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);camera.updateMatrixWorld();this.mesh.updateMatrixWorld();this.raycaster.setFromCamera(this.pointer,camera);const hits=this.raycaster.intersectObject(this.mesh,false);
    const hit=hits.find(item=>!this.section||this.sectionPlane.distanceToPoint(item.point)>=-1e-6);if(!hit)return null;
    const local=this.mesh.worldToLocal(hit.point.clone());
    return {...surfaceUV(local,this.meshParams),...this.paintMode};
  }
  bindPainting(){
    this.canvas.addEventListener('pointerdown',event=>{if(!this.paintMode.enabled||event.button!==0)return;const hit=this.pick(event);if(!hit)return;event.preventDefault();event.stopImmediatePropagation();this.paintPointer=event.pointerId;this.canvas.setPointerCapture(event.pointerId);this.lastPaint=hit;this.onPaint?.({...hit,phase:'start'});},true);
    this.canvas.addEventListener('pointermove',event=>{
      if(!this.paintMode.enabled)return;const rect=this.canvas.getBoundingClientRect();this.cursor.style.display='block';this.cursor.style.left=`${event.clientX-rect.left}px`;this.cursor.style.top=`${event.clientY-rect.top}px`;const diameter=Math.max(12,this.paintMode.size*rect.width*1.4);this.cursor.style.width=this.cursor.style.height=`${diameter}px`;this.cursor.style.borderColor=this.paintMode.erase?'#ae5555':'#a46e50';
      if(this.paintPointer!==event.pointerId)return;event.preventDefault();const hit=this.pick(event);if(hit){this.lastPaint=hit;this.onPaint?.({...hit,phase:'move'});}
    },true);
    const end=event=>{if(this.paintPointer!==event.pointerId)return;this.paintPointer=null;this.onPaint?.({...this.lastPaint,phase:'end'});this.lastPaint=null;};
    this.canvas.addEventListener('pointerup',end,true);this.canvas.addEventListener('pointercancel',end,true);this.canvas.addEventListener('pointerleave',()=>{this.cursor.style.display='none';});
  }
  resetView(){
    const dims=this.dimensions||[145,145,140],width=Math.max(dims[0],dims[1]),height=dims[2],aspect=this.camera.aspect||1;
    const verticalFov=THREE.MathUtils.degToRad(this.camera.fov),horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*aspect);
    const radius=this.mesh?.geometry.boundingSphere?.radius||Math.hypot(width,height)/2;
    const distance=radius/Math.sin(Math.min(verticalFov,horizontalFov)/2)*1.06;
    const center=new THREE.Vector3((this.meshParams?.leanX||0)*.5,height*.49,-(this.meshParams?.leanY||0)*.5),direction=new THREE.Vector3(.78,.53,1.5).normalize();this.camera.position.copy(center).addScaledVector(direction,distance);this.controls.target.copy(center);this.controls.minDistance=Math.max(width,height)*.22;this.controls.maxDistance=Math.max(width,height)*15;this.camera.near=Math.max(.1,distance/2000);this.camera.far=Math.max(10000,distance*40);this.camera.updateProjectionMatrix();this.controls.update();this.needsRender=true;
  }
  resize(){
    const width=this.container.clientWidth,height=this.container.clientHeight;if(!width||!height)return;
    const dpr=window.devicePixelRatio||1,factor={balanced:1,high:1.5,ultra:2}[this.quality],limit=this.renderer?3:2;
    this.pixelRatio=Math.min(limit,Math.max(dpr,factor),this.renderer?3:1800/Math.max(width,height));
    if(this.renderer){this.renderer.setPixelRatio(this.pixelRatio);this.renderer.setSize(width,height,false);}else{this.canvas.width=Math.max(1,Math.round(width*this.pixelRatio));this.canvas.height=Math.max(1,Math.round(height*this.pixelRatio));}
    const oldAspect=this.camera.aspect;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();if(this.dimensions&&Math.abs(oldAspect-this.camera.aspect)>.35)this.resetView();this.needsRender=true;
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.animationId);this.resizeObserver.disconnect();this.controls.dispose();this.softwareWorker?.terminate();this.mesh?.geometry.dispose();this.material.dispose();this.maskTexture?.dispose();this.shadowTexture.dispose();this.shadow.geometry.dispose();this.shadow.material.dispose();this.renderer?.dispose();this.cursor.remove();}
}
