import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let response;
class ImageDataShim {constructor(data,width,height){this.data=data;this.width=width;this.height=height;}}
class CanvasShim {
  constructor(w,h){this.width=w;this.height=h;}
  getContext(){return {putImageData: value=>{this.image=value;}};}
  transferToImageBitmap(){return {width:this.width,height:this.height,pixels:this.image.data};}
}
const scope={self:{postMessage:value=>{response=value;}},OffscreenCanvas:CanvasShim,ImageData:ImageDataShim,Uint8Array,Uint8ClampedArray,Float32Array,Math,atob};
vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../static/software-renderer.js',import.meta.url),'utf8'),scope);
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const positions=new Float32Array([-.8,-.8,.7,.8,-.8,.7,0,.8,.7,-.8,-.8,.2,.8,-.8,.2,0,.8,.2]);
const normals=new Float32Array(Array.from({length:6},()=>[0,0,1]).flat());
let count=0;
function run(indices,overrides={}) {
  scope.self.onmessage({data:{type:'mesh',version:1,positions,indices:new Uint32Array(indices),normals}});
  scope.self.onmessage({data:{type:'render',version:1,width:96,height:96,matrix:identity,camera:[0,5,5],color:'#c77d5d',gradient:true,mode:'solid',layerHeight:.6,section:false,mask:null,lean:[0,0],heightMm:1,...overrides}});
  assert.ok(!response.error,response.error);assert.equal(response.type,'frame');return response.bitmap;
}
function check(name,fn){fn();count++;console.log('PASS '+name);}
const front=run([0,1,2,3,4,5]);
check('Depth buffering is independent of triangle order',()=>assert.deepEqual(front.pixels,run([3,4,5,0,1,2]).pixels));
check('Opaque model and transparent background are both present',()=>{const alpha=front.pixels.filter((_,i)=>i%4===3);assert.ok(alpha.filter(v=>v===255).length>2000);assert.ok(alpha.filter(v=>v===0).length>2000);});
check('Closer material occludes farther material',()=>assert.deepEqual(front.pixels,run([3,4,5]).pixels));
check('Section view removes the hidden half',()=>{const img=run([0,1,2,3,4,5],{section:true});const total=front.pixels.filter((v,i)=>i%4===3&&v).length,left=img.pixels.filter((v,i)=>i%4===3&&v).length;assert.ok(left>total*.45&&left<total*.55);});
check('Wireframe retains distinct visible edges',()=>{const img=run([3,4,5],{mode:'wire'});const count=img.pixels.filter((v,i)=>i%4===3&&v).length;assert.ok(count>100&&count<1000,`Visible edge pixels: ${count}`);});
check('Paint mask highlight changes color without changing silhouette',()=>{const mask={width:2,height:2,data:btoa(String.fromCharCode(255,255,255,255)),invert:false};const img=run([3,4,5],{mask});assert.notDeepEqual(img.pixels,front.pixels);assert.deepEqual(img.pixels.filter((_,i)=>i%4===3),front.pixels.filter((_,i)=>i%4===3));});
check('Renderer resizes the entire image buffer',()=>{const img=run([3,4,5],{width:220,height:120});assert.equal(img.width,220);assert.equal(img.height,120);assert.equal(img.pixels.length,220*120*4);});
check('Stale mesh versions return an empty frame safely',()=>{scope.self.onmessage({data:{type:'render',version:99,width:96,height:96}});assert.equal(response.bitmap,null);assert.ok(!response.error);});
console.log(`${count} renderer checks passed.`);
