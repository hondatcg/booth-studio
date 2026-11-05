// Pure millimetre-based model operations, shared by editing and drawing export.
export function bounds(parts){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const p of parts) for(const [n,k,size] of [[0,'x','w'],[1,'y','h'],[2,'z','d']]){lo[n]=Math.min(lo[n],p[k]);hi[n]=Math.max(hi[n],p[k]+p[size]);}
 return {lo,hi,w:hi[0]-lo[0],h:hi[1]-lo[1],d:hi[2]-lo[2]};
}
export function localPoint(item,u,v=0,y=0){
 const b=bounds(item.parts),a=item.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=(u-.5)*b.w,z=(v-.5)*b.d;
 return [item.x+b.w/2+x*c-z*s,item.y+y*b.h,item.z+b.d/2+x*s+z*c];
}
export function resizeItem(original,key,size,side=1,uniform=false){
 const item=structuredClone(original),b=bounds(item.parts),axis={w:0,h:1,d:2}[key],pos=['x','y','z'][axis];
 const requested=Math.max(1,Math.min(30000,size))/b[key];
 const scaled=uniform?['w','h','d']:[key];
 const minFactor=Math.max(...item.parts.flatMap(p=>scaled.map(k=>1/p[k])));
 const maxFactor=Math.min(...item.parts.flatMap(p=>scaled.map(k=>30000/p[k])),...scaled.map(k=>30000/b[k]));
 const factor=Math.max(minFactor,Math.min(maxFactor,requested));
 for(const p of item.parts)for(const k of scaled){const n={w:0,h:1,d:2}[k],pk=['x','y','z'][n];p[pk]=b.lo[n]+(p[pk]-b.lo[n])*factor;p[k]*=factor;}
 const nb=bounds(item.parts),a=item.angle*Math.PI/180,delta=(nb[key]-b[key])*side/2;
 // Keep the opposite face of the edited axis fixed in world space.
 let cx=original.x+b.w/2,cz=original.z+b.d/2;
 if(key==='w'){cx+=delta*Math.cos(a);cz+=delta*Math.sin(a);}
 if(key==='d'){cx-=delta*Math.sin(a);cz+=delta*Math.cos(a);}
 item.x=cx-nb.w/2;item.z=cz-nb.d/2;
 if(key==='h')item.y=original.y+(side<0?b.h-nb.h:0);
 return item;
}
export function resolvePoint(ref,state){
 if(ref.type==='item'){const item=state.items.find(i=>i.id===ref.id);return item?localPoint(item,ref.u,ref.v,ref.y||0):null;}
 if(ref.type==='booth')return [ref.u*state.booth.w,(ref.y||0)*state.booth.h,ref.v*state.booth.d];
 return [ref.x,ref.y||0,ref.z];
}
export function dimensionGeometry(dim,state){
 const a=resolvePoint(dim.a,state),b=resolvePoint(dim.b,state);if(!a||!b)return null;
 const offset=dim.offset??180,axis=dim.axis||'x';
 const p=axis==='x'?[a[0],0,Math.max(a[2],b[2])+offset]:[Math.max(a[0],b[0])+offset,0,a[2]];
 const q=axis==='x'?[b[0],0,p[2]]:[p[0],0,b[2]];
 return {a,b,p,q,value:Math.abs(axis==='x'?b[0]-a[0]:b[2]-a[2]),axis};
}
export function normalizeExtras(state){
 state.version=2;
 state.lighting={enabled:state.lighting?.enabled===true,ambient:Math.max(0,Math.min(100,Number(state.lighting?.ambient??25)||0)),helpers:state.lighting?.helpers!==false};
 state.dimensions=Array.isArray(state.dimensions)?state.dimensions:[];
 return state;
}
export function validRef(r){return r&&((r.type==='item'&&typeof r.id==='string'&&[r.u,r.v,r.y??0].every(v=>Number.isFinite(v)&&Math.abs(v)<=1))||(r.type==='booth'&&[r.u,r.v,r.y??0].every(v=>Number.isFinite(v)&&v>=0&&v<=1))||(r.type==='point'&&[r.x,r.z,r.y??0].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)));}
export function validateExtras(state){
 if(state.dimensions!==undefined&&(!Array.isArray(state.dimensions)||state.dimensions.length>200||state.dimensions.some(d=>!validRef(d.a)||!validRef(d.b)||!['x','z'].includes(d.axis)||!Number.isFinite(d.offset)||Math.abs(d.offset)>30000)))throw Error('寸法線データが正しくありません');
 for(const i of state.items)if(i.light&&(![i.light.power,i.light.tilt,i.light.spread].every(Number.isFinite)||i.light.power<0||i.light.power>5000||i.light.tilt<0||i.light.tilt>90||i.light.spread<5||i.light.spread>120||!/^#[a-f\d]{6}$/i.test(i.light.color)))throw Error('照明データが正しくありません');
 return normalizeExtras(state);
}
export class History {
 constructor(value,limit=60){this.entries=[structuredClone(value)];this.index=0;this.limit=limit;}
 record(value){if(JSON.stringify(value)===JSON.stringify(this.entries[this.index]))return false;this.entries.splice(this.index+1);this.entries.push(structuredClone(value));if(this.entries.length>this.limit+1)this.entries.shift();this.index=this.entries.length-1;return true;}
 move(delta){const next=this.index+delta;if(next<0||next>=this.entries.length)return null;this.index=next;return structuredClone(this.entries[next]);}
 get canUndo(){return this.index>0;}get canRedo(){return this.index<this.entries.length-1;}
}
