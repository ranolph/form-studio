import {generateMesh,encodeSTL} from './geometry.js';
self.onmessage=({data})=>{
  const {id,params,quality='preview',operation='mesh'}=data||{};
  try{
    const mesh=generateMesh(params,quality);
    if(operation==='stl'){
      const buffer=encodeSTL(mesh);
      self.postMessage({id,buffer,stats:mesh.stats,params:mesh.params},[buffer]);
    }else self.postMessage({id,mesh},[mesh.positions.buffer,mesh.indices.buffer,mesh.surfaceHeight.buffer]);
  }catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
