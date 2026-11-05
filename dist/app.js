import * as T from 'three';
import {History, resizeItem, localPoint, resolvePoint, dimensionGeometry, normalizeExtras, validateExtras} from './model.mjs';
import {makeDrawingPdf,makeDxf,makeDrawingPreview} from './drawings.mjs';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const $=id=>document.getElementById(id), clone=x=>structuredClone(x), uid=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const part=(w,d,h,x=0,y=0,z=0,color='#c9bba1',shape='box',opacity=1)=>({w,d,h,x,y,z,color,shape,opacity});
const templates=[
{name:'机',category:'什器',icon:'table',parts:[part(1500,600,40,0,700,0),...[0,1420].flatMap(x=>[0,520].map(z=>part(65,65,700,x,0,z,'#9aaba5')))]},
{name:'椅子',category:'什器',icon:'chair',parts:[part(450,450,50,0,420,0,'#8da89b'),part(450,40,450,0,470,410,'#8da89b'),...[0,390].flatMap(x=>[0,390].map(z=>part(45,45,420,x,0,z,'#73817d')))]},
{name:'受付カウンター',category:'什器',icon:'counter',parts:[part(1000,500,950,0,0,0,'#e0dbcd'),part(1080,560,45,-40,950,-30,'#a08c6a')]},
{name:'棚・陳列台',category:'什器',icon:'shelf',parts:[part(35,400,1600),part(35,400,1600,765),...[0,500,1000,1560].map(y=>part(800,400,35,0,y))]},
{name:'大型モニター',category:'機器',icon:'monitor',parts:[part(1250,65,720,0,950,0,'#293e42'),part(1170,15,640,40,990,-12,'#69b8ae'),part(90,90,950,580,0,20,'#657674'),part(750,500,45,250,0,-180,'#657674')]},
{name:'展示パネル',category:'サイン',icon:'panel',parts:[part(900,40,1800,0,0,0,'#f1ece1')]},
{name:'ロールバナー',category:'サイン',icon:'banner',parts:[part(850,25,1900,0,80,20,'#9cb6a5'),part(900,200,80,-25,0,-70,'#9aa6a1')]},
{name:'荷物箱',category:'備品',icon:'box',parts:[part(500,400,350,0,0,0,'#c8aa7a')]},
{name:'人物モデル',category:'人物',icon:'person',parts:[part(300,220,650,100,750,0,'#b9c6be','cylinder'),part(220,220,250,140,1400,0,'#d9c9ae','cylinder'),part(130,150,750,100,0,30,'#687e77'),part(130,150,750,270,0,30,'#687e77'),part(90,160,550,0,760,30,'#b9c6be'),part(90,160,550,410,760,30,'#b9c6be')]}
];
function bounds(parts){let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts){[p.x,p.y,p.z].forEach((v,i)=>{lo[i]=Math.min(lo[i],v);hi[i]=Math.max(hi[i],v+[p.w,p.h,p.d][i])})}return {lo,hi,w:hi[0]-lo[0],h:hi[1]-lo[1],d:hi[2]-lo[2]}}
function instantiate(t,x,z){return {id:uid(),name:t.name,category:t.category,parts:clone(t.parts),...(t.light?{light:clone(t.light)}:{}),x,y:0,z,angle:0}}
const DEFAULT_WALL_COLORS={back:'#acc8ba',left:'#bfd3c8',right:'#bfd3c8'};
function normalizeBoothAppearance(booth){
 const isColor=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);
 const colors=booth.wallColors&&typeof booth.wallColors==='object'?booth.wallColors:{};
 booth.wallColors=Object.fromEntries(Object.keys(DEFAULT_WALL_COLORS).map(key=>[key,isColor(colors[key])?colors[key]:DEFAULT_WALL_COLORS[key]]));
 booth.topOutline=booth.topOutline!==false;
 booth.outlineColor=isColor(booth.outlineColor)?booth.outlineColor:'#34594d';
 return booth;
}
function initial(){return normalizeExtras({version:1,booth:{w:3000,d:3000,h:2700,back:true,left:true,right:false,wallColors:{...DEFAULT_WALL_COLORS},topOutline:true,outlineColor:'#34594d'},items:[instantiate(templates[0],400,650),instantiate(templates[4],1600,1650),instantiate(templates[5],250,2910)],snap:true,grid:true,dims:true})}
let state=initial(),library=[],selected=null,mode='place',view='iso',editId=null,editParts=[],editLight=null;
try{const raw=localStorage.getItem('boothstudio-layout');if(raw)state=validateLayout(JSON.parse(raw));const lib=localStorage.getItem('boothstudio-library');if(lib)library=validateLibrary(JSON.parse(lib));}catch(e){console.warn('Saved layout could not be restored',e)}
function num(v,min,max){return Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max}
function validParts(parts){return Array.isArray(parts)&&parts.length>0&&parts.length<=100&&parts.every(p=>['box','cylinder','panel'].includes(p.shape)&&['w','d','h'].every(k=>num(p[k],1,30000))&&['x','y','z'].every(k=>num(p[k],-30000,30000))&&num(p.opacity,0,1)&&/^#[a-f\d]{6}$/i.test(p.color))}
function validateLayout(s){if(!s||!s.booth||!['w','d','h'].every(k=>num(s.booth[k],500,k==='h'?10000:30000))||!Array.isArray(s.items)||s.items.length>500||!s.items.every(i=>typeof i.name==='string'&&validParts(i.parts)&&['x','y','z'].every(k=>num(i[k],-100000,100000))&&num(i.angle,-36000,36000)))throw Error('レイアウトデータの形式が正しくありません');s=clone(s);normalizeBoothAppearance(s.booth);const ids=new Set(),idMap=new Map();s.items.forEach(i=>{const old=i.id;if(typeof old!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(old)||ids.has(old))i.id=uid();ids.add(i.id);idMap.set(old,i.id)});validateExtras(s);s.dimensions.forEach(d=>{d.id=uid();for(const ref of [d.a,d.b])if(ref.type==='item')ref.id=idMap.get(ref.id)||ref.id});s.dimensions=s.dimensions.filter(d=>[d.a,d.b].every(r=>r.type!=='item'||ids.has(r.id)));return s}
function validateLibrary(l){if(!Array.isArray(l)||l.length>500||!l.every(t=>typeof t.name==='string'&&validParts(t.parts)))throw Error('マイアイテムデータの形式が正しくありません');validateExtras({items:l});return l.map(t=>({...t,id:t.id||uid()}))}
let history=null,historyHold=false,restoringHistory=false;
normalizeExtras(state);
let saveTimer;function persist(){recordHistory();try{localStorage.setItem('boothstudio-layout',JSON.stringify(state));localStorage.setItem('boothstudio-library',JSON.stringify(library));$('saveState').textContent='保存済み';clearTimeout(saveTimer);saveTimer=setTimeout(()=>$('saveState').textContent='自動保存 ON',1800)}catch{$('saveState').textContent='保存できません：JSONで保存してください'}}
let toastTimer;function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000)}
function icon(t){const shapes={table:'<path d="M4 15 23 5 43 14 24 25Z" fill="#cbbd9e"/><path d="M7 18v15m31-16v15M24 25v13" stroke="#7f9990" stroke-width="3"/>',chair:'<path d="M13 4 31 4 31 22 13 22Z" fill="#99b1a1"/><path d="M9 22h27v5H9Z" fill="#b7c9bb"/><path d="M12 27v10m21-10v10" stroke="#81958b" stroke-width="3"/>',monitor:'<path d="M4 4h37v23H4Z" fill="#4d6660"/><path d="M7 7h31v17H7Z" fill="#a5ccc0"/><path d="M22 27v9m-10 1h22" stroke="#83998e" stroke-width="3"/>',panel:'<path d="M10 3h27v35H10Z" fill="#d7d6c6"/><path d="M15 9h17m-17 5h12" stroke="#a3b6a6" stroke-width="2"/>',banner:'<path d="M12 2h23v32H12Z" fill="#9cb6a5"/><path d="M9 36h29" stroke="#81958b" stroke-width="4"/>',box:'<path d="m5 12 19-8 18 8-18 9Z" fill="#d5bf9e"/><path d="m5 12 19 9v18L5 30Z" fill="#bd9f75"/><path d="m24 21 18-9v18l-18 9Z" fill="#cbb28b"/>',person:'<circle cx="24" cy="8" r="5" fill="#d4c4a9"/><path d="M17 16h14l4 15h-6v10h-5V30h-2v11h-5V30h-4Z" fill="#92aa9a"/>',counter:'<path d="m5 11 19-7 18 7-18 8Z" fill="#b9a88a"/><path d="m6 13 18 7v19L6 32Z" fill="#d8d6c5"/><path d="m24 20 17-7v19l-17 7Z" fill="#c3c7b5"/>',shelf:'<path d="M8 5v32M37 5v32M8 6h29M8 16h29M8 26h29M8 36h29" stroke="#adab8d" stroke-width="4"/>'};return `<svg viewBox="0 0 48 44" aria-hidden="true">${shapes[t.icon]||shapes.box}</svg>`}
$('standard').innerHTML=templates.map((t,i)=>`<button class="tile" data-template="${i}">${icon(t)}<span>${t.name}</span></button>`).join('');
$('standard').onclick=e=>{const b=e.target.closest('[data-template]');if(b)add(templates[+b.dataset.template])};
function renderLibrary(){$('myItems').innerHTML=library.length?library.map(t=>`<div class="myrow"><button class="add" data-add="${esc(t.id)}">＋ ${esc(t.name)}<small>${esc(t.category||'未分類')} · ${Math.round(bounds(t.parts).w)}mm</small></button><button data-edit="${esc(t.id)}" title="元アイテムを編集">編集</button><button data-copy="${esc(t.id)}" title="複製">⧉</button><button data-remove="${esc(t.id)}" title="削除">×</button></div>`).join(''):'<div class="empty-lib">いつも使う什器を登録しましょう。<br>寸法や形を自由に設定できます。</div>'}
$('myItems').onclick=e=>{const b=e.target.closest('button');if(!b)return;let id=Object.values(b.dataset)[0],t=library.find(t=>t.id===id);if(!t)return;if(b.dataset.add)add(t);if(b.dataset.edit)openEditor(t);if(b.dataset.copy){library.push({...clone(t),id:uid(),name:t.name+' のコピー'});renderLibrary();persist()}if(b.dataset.remove&&confirm(`「${t.name}」をライブラリから削除しますか？配置済みのものは残ります。`)){library=library.filter(t=>t.id!==id);renderLibrary();persist()}};
function add(t){const b=bounds(t.parts);const i=instantiate(t,Math.max(0,(state.booth.w-b.w)/2),Math.max(0,(state.booth.d-b.d)/2));state.items.push(i);selected=i.id;refresh();toast(t.name+'を追加しました')}
class SoftwareRenderer {
 constructor(){this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d');this.shadowMap={};this.ratio=1;this.color='#edf1ec'}
 setPixelRatio(r){this.ratio=r} setClearColor(c){this.color=c}
 setSize(w,h){this.domElement.width=w*this.ratio;this.domElement.height=h*this.ratio;this.domElement.style.width=w+'px';this.domElement.style.height=h+'px'}
 render(scene,camera){const c=this.ctx,w=this.domElement.width,h=this.domElement.height;c.fillStyle=this.color;c.fillRect(0,0,w,h);scene.updateMatrixWorld();camera.updateMatrixWorld();const faces=[],segments=[];const project=v=>{const p=v.clone().project(camera);return [(p.x+1)*w/2,(-p.y+1)*h/2,p.z]};scene.traverse(o=>{if(!o.visible||!o.geometry)return;const g=o.geometry,pos=g.attributes.position;if(!pos)return;const m=Array.isArray(o.material)?o.material[0]:o.material;if(o.isMesh){if(g.parameters?.width===120||m.map)return;const idx=g.index;for(let n=0;n<(idx?idx.count:pos.count);n+=3){const vs=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(pos,idx?idx.getX(n+k):n+k).applyMatrix4(o.matrixWorld));const normal=new T.Vector3().subVectors(vs[1],vs[0]).cross(new T.Vector3().subVectors(vs[2],vs[0])).normalize(),center=vs[0].clone().add(vs[1]).add(vs[2]).divideScalar(3);if(normal.dot(camera.position.clone().sub(center))<0)continue;const pts=vs.map(project);if(pts.some(p=>p[2]>1||p[2]<-1))continue;const lit=(view==='top'||m.isMeshBasicMaterial)?1:.78+.22*Math.max(0,normal.dot(new T.Vector3(-.5,1,-.5).normalize()));const col=state.lighting.enabled&&view!=='top'&&!m.isMeshBasicMaterial?softwareLight(m.color,center,normal,o):m.color.clone().multiplyScalar(lit);faces.push({pts,depth:-center.clone().applyMatrix4(camera.matrixWorldInverse).z,color:'#'+col.getHexString(),opacity:m.opacity??1})}}else if(o.isLineSegments){for(let n=0;n<(g.index?g.index.count:pos.count);n+=2){const a=project(new T.Vector3().fromBufferAttribute(pos,g.index?g.index.getX(n):n).applyMatrix4(o.matrixWorld)),b=project(new T.Vector3().fromBufferAttribute(pos,g.index?g.index.getX(n+1):n+1).applyMatrix4(o.matrixWorld));if(a[2]<1&&b[2]<1)segments.push({a,b,color:'#'+m.color.getHexString(),top:o.isBoxHelper||o.userData.wallOutline,wallOutline:!!o.userData.wallOutline,opacity:m.opacity??1})}}});faces.sort((a,b)=>b.depth-a.depth);for(const f of faces){c.globalAlpha=f.opacity;c.beginPath();f.pts.forEach((p,n)=>n?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle=f.color;c.fill();c.strokeStyle=f.color;c.lineWidth=.45;c.stroke()}segments.sort((a,b)=>Number(a.top)-Number(b.top));for(const l of segments){c.globalAlpha=l.opacity*(l.top?1:.55);c.strokeStyle=l.color;c.lineWidth=l.wallOutline?2.2*this.ratio:l.top?1.6*this.ratio:.5*this.ratio;c.beginPath();c.moveTo(l.a[0],l.a[1]);c.lineTo(l.b[0],l.b[1]);c.stroke()}c.globalAlpha=1;const aisle=project(new T.Vector3(state.booth.w/2000,0,-.43));if(aisle[2]<1){c.fillStyle='#698d7d';c.font=12*this.ratio+'px sans-serif';c.textAlign='center';c.fillText('↓ 通路 / AISLE ↓',aisle[0],aisle[1])}}
}
const viewport=$('viewport');let renderer;try{renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})}catch{renderer=new SoftwareRenderer();$('saveState').textContent='互換描画モード';}renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor('#edf1ec');viewport.appendChild(renderer.domElement);
const scene=new T.Scene(),world=new T.Group(),furniture=new T.Group(),lines=new T.Group();scene.add(world,furniture,lines);const hemisphere=new T.HemisphereLight(0xffffff,0x98aa98,2.5);scene.add(hemisphere);const sun=new T.DirectionalLight(0xfffcf1,3);sun.position.set(-3,8,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.025;scene.add(sun);const ambient=new T.AmbientLight(0xffffff,.3);scene.add(ambient);
let camera=new T.PerspectiveCamera(40,1,.01,200),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=.3;controls.maxDistance=70;let modelGroups=new Map(),bad=new Set();
function clear(group){while(group.children.length){let c=group.children[0];group.remove(c);c.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose()}})}}
function meshBox(w,h,d,color,x,y,z,opacity=1){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.8,transparent:opacity<1,opacity,depthWrite:opacity>.7}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m}
function textSprite(text){const c=document.createElement('canvas');c.width=640;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#6d8d80';ctx.font='500 36px sans-serif';ctx.textAlign='center';ctx.fillText(text,320,62);const m=new T.Mesh(new T.PlaneGeometry(2.2,.33),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;return m}
function applyViewAppearance(){
 const shadows=view!=='top';renderer.shadowMap.enabled=shadows;renderer.shadowMap.needsUpdate=true;
 sun.castShadow=shadows;sun.shadow.needsUpdate=true;
}
function buildWorld(){
 clear(world);normalizeBoothAppearance(state.booth);
 const b=state.booth,w=b.w/1000,d=b.d/1000,h=b.h/1000,top=view==='top';
 const floor=meshBox(w,.055,d,'#fbfbf5',w/2,-.035,d/2);if(renderer instanceof SoftwareRenderer&&state.lighting.enabled&&!top){floor.geometry.dispose();floor.geometry=new T.BoxGeometry(w,.055,d,20,1,20);}
 if(top){floor.material.dispose();floor.material=new T.MeshBasicMaterial({color:'#fbfbf5'});floor.receiveShadow=false}
 world.add(floor);
 const ground=meshBox(120,.05,120,'#edf1ec',0,-.11,0);ground.receiveShadow=!top;world.add(ground);
 function wall(key,width,depth,x,z){
  const mesh=meshBox(width,h,depth,b.wallColors[key],x,h/2,z);mesh.userData.wall=key;
  if(top){mesh.material.dispose();mesh.material=new T.MeshBasicMaterial({color:b.wallColors[key]});mesh.castShadow=false;mesh.receiveShadow=false}
  world.add(mesh);
  if(top&&b.topOutline){
   const outline=new T.LineSegments(new T.EdgesGeometry(mesh.geometry),new T.LineBasicMaterial({color:b.outlineColor,depthTest:false,depthWrite:false,linewidth:2}));
   outline.position.copy(mesh.position);outline.userData.wallOutline=true;outline.renderOrder=10;world.add(outline);
  }
 }
 if(b.back)wall('back',w,.045,w/2,d+.025);
 if(b.left)wall('left',.045,d,-.025,d/2);
 if(b.right)wall('right',.045,d,w+.025,d/2);
 if(state.grid){
  const points=[];for(let x=0;x<=w+.0001;x+=.1)points.push(x,.001,0,x,.001,d);for(let z=0;z<=d+.0001;z+=.1)points.push(0,.001,z,w,.001,z);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
  world.add(new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#d6e1d8',transparent:true,opacity:.7})));
 }
 const aisle=textSprite('↓　通 路 / AISLE　↓');aisle.position.set(w/2,-.07,-.43);world.add(aisle);
 $('sceneSize').textContent=`${b.w.toLocaleString()} × ${b.d.toLocaleString()} mm`;
 applyViewAppearance();buildLighting();
}
function buildItems(){clear(furniture);clear(lines);modelGroups.clear();for(const i of state.items){const b=bounds(i.parts),g=new T.Group();g.userData.id=i.id;for(const p of i.parts){let geometry=p.shape==='cylinder'?new T.CylinderGeometry(.5,.5,1,32):new T.BoxGeometry(1,1,1);const m=new T.Mesh(geometry,new T.MeshStandardMaterial({color:p.color,roughness:.72,transparent:p.opacity<1,opacity:p.opacity,depthWrite:p.opacity>.7}));m.scale.set(p.w/1000,p.h/1000,p.d/1000);m.position.set((p.x-b.lo[0]-b.w/2+p.w/2)/1000,(p.y-b.lo[1]+p.h/2)/1000,(p.z-b.lo[2]-b.d/2+p.d/2)/1000);m.castShadow=true;m.receiveShadow=true;g.add(m)}g.position.set((i.x+b.w/2)/1000,i.y/1000,(i.z+b.d/2)/1000);g.rotation.y=-i.angle*Math.PI/180;furniture.add(g);modelGroups.set(i.id,g)}checkCollisions();buildLighting();}
function footprint(i){const b=bounds(i.parts),a=i.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=i.x+b.w/2,cz=i.z+b.d/2;return [[-b.w/2,-b.d/2],[b.w/2,-b.d/2],[b.w/2,b.d/2],[-b.w/2,b.d/2]].map(([x,z])=>[cx+x*c-z*s,cz+x*s+z*c])}
function intersect(a,b){for(const poly of [a,b])for(let j=0;j<4;j++){const p=poly[j],q=poly[(j+1)%4],axis=[q[1]-p[1],p[0]-q[0]],project=v=>v.map(p=>p[0]*axis[0]+p[1]*axis[1]),pa=project(a),pb=project(b);if(Math.max(...pa)<=Math.min(...pb)+.001||Math.max(...pb)<=Math.min(...pa)+.001)return false}return true}
function checkCollisions(){bad=new Set();const items=state.items;for(let n=0;n<items.length;n++){const i=items[n],p=footprint(i),b=bounds(i.parts);if(p.some(([x,z])=>x<-.1||x>state.booth.w+.1||z<-.1||z>state.booth.d+.1)||i.y<0||i.y+b.h>state.booth.h)bad.add(i.id);for(let k=n+1;k<items.length;k++){const j=items[k],bj=bounds(j.parts);if(i.y+b.h<=j.y||j.y+bj.h<=i.y)continue;if(intersect(p,footprint(j))){bad.add(i.id);bad.add(j.id)}}}clear(lines);for(const i of items){const g=modelGroups.get(i.id);if(bad.has(i.id)||i.id===selected){const helper=new T.BoxHelper(g,bad.has(i.id)?'#d87564':'#159482');helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.9;helper.renderOrder=5;lines.add(helper)}}$('warning').textContent=`⚠ ${bad.size}個のアイテムに重なり・はみ出しがあります`;$('warning').style.display=bad.size?'block':'none';}
function setView(v){view=v;const b=state.booth,w=b.w/1000,d=b.d/1000,h=b.h/1000,size=Math.max(w,d,h);const old=controls;const aspect=viewport.clientWidth/viewport.clientHeight;if(v==='top'){const fr=size*1.4;camera=new T.OrthographicCamera(-fr*aspect/2,fr*aspect/2,fr/2,-fr/2,.01,200);camera.position.set(w/2,Math.max(10,size*2),d/2);camera.up.set(0,0,-1);old.target.set(w/2,0,d/2)}else{camera=new T.PerspectiveCamera(v==='eye'?60:40,aspect,.01,200);camera.up.set(0,1,0);if(v==='iso'){camera.position.set(w/2+size*1.35,size*1.35,d/2-size*1.7);old.target.set(w/2,h*.3,d/2)}if(v==='front'){camera.position.set(w/2,h*.6,-size*2.6);old.target.set(w/2,h*.5,d/2)}if(v==='eye'){camera.position.set(w/2,1.6,-Math.max(1.3,d*.55));old.target.set(w/2,1.6,d/2)}}const target=old.target.clone();old.dispose();controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(target);controls.enableDamping=true;controls.maxPolarAngle=v==='top'?Math.PI:Math.PI*.495;controls.minDistance=.2;controls.maxDistance=100;controls.enableRotate=v!=='top';controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));buildWorld();}
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);if(camera.isPerspectiveCamera)camera.aspect=w/h;else{let height=camera.top-camera.bottom;camera.left=-height*w/h/2;camera.right=height*w/h/2}camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(viewport);
function label(text,x,y,z,cls=''){const p=new T.Vector3(x,y,z).project(camera);if(p.z>1||p.z<-1)return '';return `<span class="measure ${cls}" style="left:${(p.x+1)*50}%;top:${(-p.y+1)*50}%">${esc(text)}</span>`}
function drawDimensions(){if(!state.dims){$('measurements').innerHTML='';return}const b=state.booth,w=b.w/1000,d=b.d/1000;let html=label(`${b.w.toLocaleString()} mm`,w/2,.01,-.14)+label(`${b.d.toLocaleString()} mm`,w+.15,.01,d/2);const i=state.items.find(i=>i.id===selected);if(i&&view==='top'){const f=footprint(i),xs=f.map(p=>p[0]),zs=f.map(p=>p[1]);let minX=Math.min(...xs),minZ=Math.min(...zs),maxX=Math.max(...xs),maxZ=Math.max(...zs);html+=label(`幅 ${Math.round(maxX-minX)} / 奥行 ${Math.round(maxZ-minZ)} mm`,(minX+maxX)/2000,(i.y+bounds(i.parts).h)/1000,(minZ+maxZ)/2000,'item-measure');if(minX>0)html+=label(`左 ${Math.round(minX)} mm`,minX/2000,.02,(minZ+maxZ)/2000);if(minZ>0)html+=label(`通路側 ${Math.round(minZ)} mm`,(minX+maxX)/2000,.02,minZ/2000);if(maxX<state.booth.w)html+=label(`右 ${Math.round(state.booth.w-maxX)} mm`,(maxX+state.booth.w)/2000,.02,(minZ+maxZ)/2000);if(maxZ<state.booth.d)html+=label(`奥 ${Math.round(state.booth.d-maxZ)} mm`,(minX+maxX)/2000,.02,(maxZ+state.booth.d)/2000)}if(dimensionDrag){const label=dimensionDrag.element;for(const child of [...$('measurements').children])if(child!==label)child.remove();$('measurements').insertAdjacentHTML('afterbegin',html);}else $('measurements').innerHTML=html;}
function animate(){requestAnimationFrame(animate);controls.update();drawAdvanced();renderer.render(scene,camera);drawDimensions();drawCustomLabels()}
function refresh(rebuild=true){if(rebuild){buildWorld();buildItems()}renderProperties();renderList();renderAdvanced();$('count').textContent=state.items.length+'アイテム';persist()}
function renderList(){$('listCount').textContent=state.items.length+'点';$('sceneList').innerHTML=state.items.map(i=>`<button class="scene-row ${selected===i.id?'active':''}" data-select="${i.id}"><span>${esc(i.name)}</span><small>${bad.has(i.id)?'⚠ ':''}${Math.round(bounds(i.parts).w)}mm</small></button>`).join('')}
$('sceneList').onclick=e=>{const b=e.target.closest('[data-select]');if(b)select(b.dataset.select)};
function select(id){selected=id;selectedDimension=null;checkCollisions();renderProperties();renderList();renderAdvanced()}
function field(label,key,value,attrs=''){return `<label>${label}<input data-prop="${key}" type="number" value="${Math.round(value*100)/100}" ${attrs}></label>`}
function renderProperties(){const i=state.items.find(i=>i.id===selected);if(!i){$('properties').innerHTML='<div class="nothing"><b>アイテムを選択</b>3D画面や配置一覧から選ぶと、<br>寸法・位置を編集できます。</div>';return}const b=bounds(i.parts);$('properties').innerHTML=`<span class="property-tag">${esc(i.category||'マイアイテム')}</span><label style="margin-top:14px">名前<input id="propName" maxlength="80" value="${esc(i.name)}"></label><div class="fields three">${field('幅 / mm','w',b.w,'min="1" max="30000"')}${field('奥行 / mm','d',b.d,'min="1" max="30000"')}${field('高さ / mm','h',b.h,'min="1" max="30000"')}</div><div class="divider"></div><h3>配置位置 <small>mm</small></h3><div class="fields">${field('X：左端から','x',i.x)}${field('Z：通路から奥へ','z',i.z)}${field('床からの高さ','y',i.y,'min="0"')}${field('回転角度 / °','angle',i.angle,'step="10"')}</div><div class="fields"><label>全パーツの色<input id="propColor" type="color" value="${i.parts[0].color}"></label><label>不透明度 / %<input id="propOpacity" type="number" min="0" max="100" value="${Math.round(i.parts[0].opacity*100)}"></label></div><div class="rotation-controls"><span>10度ずつ回転</span><div class="action-row"><button id="rotateMinus" aria-label="反時計回りに10度回転">↶ −10°</button><button id="rotatePlus" aria-label="時計回りに10度回転">↷ ＋10°</button></div></div><div class="action-row"><button id="rotate">↻ 90°回転</button><button id="duplicate">⧉ 複製</button><button id="delete" class="danger">削除</button></div><button id="registerPlaced" class="full">＋ マイアイテムとして登録</button><p class="note">この配置だけを編集します。登録した元アイテムは変更されません。</p>`;
renderLightProperties(i);$('propName').onchange=e=>{i.name=e.target.value.trim()||i.name;refresh(false)};$('properties').querySelectorAll('[data-prop]').forEach(el=>el.oninput=()=>{const k=el.dataset.prop,v=+el.value;if(!Number.isFinite(v)||Math.abs(v)>100000||(['w','d','h'].includes(k)&&(v<1||v>30000))||(k==='y'&&v<0)){renderProperties();return}if(['w','h','d'].includes(k)){const current=bounds(i.parts),pos={w:'x',h:'y',d:'z'}[k],ratio=v/current[k];for(const p of i.parts){p[k]*=ratio;p[pos]=current.lo[{x:0,y:1,z:2}[pos]]+(p[pos]-current.lo[{x:0,y:1,z:2}[pos]])*ratio}}else i[k]=v;buildItems();renderList();renderAdvanced();persist()});$('propColor').oninput=e=>{i.parts.forEach(p=>p.color=e.target.value);buildItems();persist()};$('propOpacity').onchange=e=>{i.parts.forEach(p=>p.opacity=Math.max(0,Math.min(100,+e.target.value))/100);refresh()};const rotateBy=degrees=>{i.angle=((i.angle+degrees)%360+360)%360;refresh()};$('rotateMinus').onclick=()=>rotateBy(-10);$('rotatePlus').onclick=()=>rotateBy(10);$('rotate').onclick=()=>rotateBy(90);$('duplicate').onclick=()=>{const c=clone(i);c.id=uid();c.name+=' のコピー';c.x+=100;c.z+=100;state.items.push(c);selected=c.id;refresh()};$('delete').onclick=removeSelected;$('registerPlaced').onclick=()=>openEditor({name:i.name,category:i.category,parts:i.parts,light:i.light});}
function removeSelected(){if(!selected)return;state.dimensions=state.dimensions.filter(d=>![d.a,d.b].some(r=>r.type==='item'&&r.id===selected));state.items=state.items.filter(i=>i.id!==selected);selected=null;refresh()}
const ray=new T.Raycaster(),mouse=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0);let drag=null;
function cast(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(mouse,camera)}
renderer.domElement.addEventListener('contextmenu',e=>{if(mode!=='orbit')e.preventDefault()});
renderer.domElement.addEventListener('pointerdown',startPointer,true);
renderer.domElement.addEventListener('pointermove',movePointer);
renderer.domElement.addEventListener('pointerup',endPointer);
renderer.domElement.addEventListener('pointercancel',cancelPointer);
function setMode(m){endPointer();mode=m;if(m==='measure'&&view!=='top')setView('top');pendingMeasure=null;for(const [id,k] of [['placeMode','place'],['orbitMode','orbit'],['resizeMode','resize'],['measureMode','measure']])$(id).classList.toggle('active',m===k);$('resizeOptions').hidden=m!=='resize';$('canvasHelp').textContent={place:'左ドラッグ：移動 · 選択アイテムを右ドラッグ：10°回転 · Esc：選択解除',orbit:'ドラッグ：視点回転 · 右ドラッグ：視点移動 · ホイール：拡大',resize:'ハンドルをドラッグ：伸縮 · 反対側の端を固定 · Esc：操作をキャンセル',measure:'真上で2点をクリック：寸法追加 · 端・角に吸着 · Esc：キャンセル'}[m];}
$('placeMode').onclick=()=>setMode('place');$('orbitMode').onclick=()=>setMode('orbit');$('views').onclick=e=>{const b=e.target.closest('[data-view]');if(b)setView(b.dataset.view)};$('fit').onclick=()=>setView(view);
for(const id of ['snap','grid','dims']){$(id).checked=state[id]!==false;$(id).onchange=()=>{state[id]=$(id).checked;refresh()}}
for(const [id,k] of [['bw','w'],['bd','d'],['bh','h']]){$(id).value=state.booth[k];$(id).onchange=()=>{const n=+$(id).value;if(!num(n,500,k==='h'?10000:30000)){toast('寸法の入力範囲を確認してください');$(id).value=state.booth[k];return}state.booth[k]=n;refresh();setView(view)}}
for(const key of ['back','left','right']){
 $(key).checked=state.booth[key];$(key).onchange=()=>{state.booth[key]=$(key).checked;refresh()};
 $(key+'Color').oninput=e=>{state.booth.wallColors[key]=e.target.value;buildWorld();persist()};
}
$('topOutline').onchange=()=>{state.booth.topOutline=$('topOutline').checked;buildWorld();persist()};
$('wallOutlineColor').oninput=e=>{state.booth.outlineColor=e.target.value;buildWorld();persist()};
function syncBooth(){
 normalizeBoothAppearance(state.booth);
 for(const [id,key] of [['bw','w'],['bd','d'],['bh','h']])$(id).value=state.booth[key];
 for(const key of ['back','left','right']){$(key).checked=state.booth[key];$(key+'Color').value=state.booth.wallColors[key]}
 $('topOutline').checked=state.booth.topOutline;$('wallOutlineColor').value=state.booth.outlineColor;
 for(const key of ['snap','grid','dims'])$(key).checked=state[key]!==false;
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('catalog').hidden=b.dataset.tab!=='catalog';$('booth').hidden=b.dataset.tab!=='booth'});
$('reset').onclick=()=>{if(!confirm('現在の配置を初期レイアウトに戻しますか？マイアイテムは残ります。'))return;state=initial();selected=null;syncBooth();refresh();setView('iso')};
function openEditor(t){editLight=t?.light?clone(t.light):null;editId=t?.id||null;editParts=clone(t?.parts||[part(600,400,800)]);$('itemName').value=t?.name||'新しいアイテム';$('itemCategory').value=t?.category||'マイアイテム';$('editorTitle').textContent=editId?'元アイテムを編集':'アイテムを新規作成';$('editorError').textContent='';renderParts();$('editor').showModal()}
function renderParts(){$('parts').innerHTML=editParts.map((p,n)=>`<div class="part" data-part="${n}"><div class="part-head"><strong>パーツ ${n+1}</strong><button data-deletepart="${n}" ${editParts.length===1?'disabled':''}>削除</button></div><div class="part-grid"><label>形状<select data-k="shape"><option value="box" ${p.shape==='box'?'selected':''}>直方体</option><option value="cylinder" ${p.shape==='cylinder'?'selected':''}>円柱</option><option value="panel" ${p.shape==='panel'?'selected':''}>薄いパネル</option></select></label>${['w','d','h'].map((k,j)=>`<label>${['幅','奥行き','高さ'][j]} / mm<input data-k="${k}" type="number" min="1" max="30000" value="${p[k]}"></label>`).join('')}</div><div class="part-grid">${['x','y','z'].map((k,j)=>`<label>${['X：左右','Y：床から','Z：前後'][j]} / mm<input data-k="${k}" type="number" min="-30000" max="30000" value="${p[k]}"></label>`).join('')}<label>色<input data-k="color" type="color" value="${p.color}"></label></div><div style="width:150px;margin-top:10px"><label>不透明度 / %<input data-k="opacity" type="number" min="0" max="100" value="${Math.round(p.opacity*100)}"></label></div></div>`).join('')}
$('parts').oninput=e=>{const k=e.target.dataset.k;if(!k)return;const n=+e.target.closest('[data-part]').dataset.part;editParts[n][k]=['color','shape'].includes(k)?e.target.value:+e.target.value/(k==='opacity'?100:1)};
$('parts').onchange=e=>{if(e.target.dataset.k==='shape'&&e.target.value==='panel'){const n=+e.target.closest('[data-part]').dataset.part;editParts[n].d=30;renderParts()}};
$('parts').onclick=e=>{const b=e.target.closest('[data-deletepart]');if(b&&editParts.length>1){editParts.splice(+b.dataset.deletepart,1);renderParts()}};$('addPart').onclick=()=>{if(editParts.length>=100)return;editParts.push(part(400,300,200));renderParts()};$('newItem').onclick=()=>openEditor();$('closeEditor').onclick=$('cancelEditor').onclick=()=>$('editor').close();
$('saveItem').onclick=()=>{const name=$('itemName').value.trim();if(!name||!validParts(editParts)){$('editorError').textContent='名前と寸法を確認してください。寸法は1〜30,000mm、不透明度は0〜100%です。';return}const t={id:editId||uid(),name,category:$('itemCategory').value.trim()||'未分類',parts:clone(editParts),...(editLight?{light:clone(editLight)}:{})};const idx=library.findIndex(t=>t.id===editId);if(idx>=0)library[idx]=t;else library.push(t);persist();renderLibrary();$('editor').close();toast('マイアイテムを登録しました')};
let exportFile=null,exportUrl=null,downloadUrl=null;
function closeExportMenu(restoreFocus=false){$('exportMenu').hidden=true;$('exportMenuButton').setAttribute('aria-expanded','false');if(restoreFocus)$('exportMenuButton').focus()}
$('exportMenuButton').onclick=()=>{const open=$('exportMenu').hidden;$('exportMenu').hidden=!open;$('exportMenuButton').setAttribute('aria-expanded',String(open));if(open)$('exportPng').focus()};
document.addEventListener('click',e=>{if(!e.target.closest('.export-wrap'))closeExportMenu()});
$('exportMenuButton').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();$('exportMenuButton').click()}};
$('exportMenu').onkeydown=e=>{const buttons=[...$('exportMenu').querySelectorAll('button')],n=buttons.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closeExportMenu(true)}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(n+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()}};
function prepareExport(blob,name,{preview=null,json=null,description=''}={}){
 if(!(blob instanceof Blob)||!blob.size)throw Error('ファイルを作成できませんでした');
 if(exportUrl)URL.revokeObjectURL(exportUrl);if(downloadUrl)URL.revokeObjectURL(downloadUrl);exportFile={blob,name};exportUrl=URL.createObjectURL(blob);downloadUrl=URL.createObjectURL(new Blob([blob],{type:'application/octet-stream'}));
 $('exportTitle').textContent=name.endsWith('.dxf')?'DXFをエクスポート':name.endsWith('.pdf')?'PDFをエクスポート':name.endsWith('.png')?'PNG画像をエクスポート':'JSONをエクスポート';
 $('exportDescription').textContent=description;$('exportFilename').textContent=name;$('exportFileSize').textContent=blob.size<1024*1024?Math.max(1,Math.round(blob.size/1024))+' KB':(blob.size/1024/1024).toFixed(1)+' MB';
 $('downloadExport').href=downloadUrl;$('downloadExport').download=name;$('openExport').href=exportUrl;
 $('exportPreview').hidden=!preview;if(preview)$('exportPreview').src=preview;else $('exportPreview').removeAttribute('src');
 $('jsonPreviewLabel').hidden=json===null;$('jsonPreview').value=json??'';$('copyJson').hidden=json===null;
 $('nativeSave').hidden=typeof window.showSaveFilePicker!=='function'||window.self!==window.top;
 $('exportFeedback').textContent='';closeExportMenu();$('exportDialog').showModal();
}
function dataUrlBlob(url){const [header,body]=url.split(','),raw=atob(body),bytes=new Uint8Array(raw.length);for(let n=0;n<raw.length;n++)bytes[n]=raw.charCodeAt(n);return new Blob([bytes],{type:header.match(/data:([^;]+)/)[1]})}
function makeExportCanvas(){
 controls.update();drawAdvanced();renderer.render(scene,camera);drawDimensions();drawCustomLabels();
 const source=renderer.domElement,canvas=document.createElement('canvas');
 const sceneWidth=viewport.clientWidth,sceneHeight=viewport.clientHeight;
 const sidebar=340,header=80,footer=36,padding=22;
 const scratch=document.createElement('canvas').getContext('2d');
 if(!scratch||!sceneWidth||!sceneHeight)throw Error('画像の作成に失敗しました');
 function wrapName(name,maxWidth){
  scratch.font='600 14px sans-serif';const lines=[];let line='';
  for(const character of String(name)){if(line&&scratch.measureText(line+character).width>maxWidth){lines.push(line);line=character}else line+=character}
  lines.push(line);return lines;
 }
 const number=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1});
 const rows=state.items.map((item,index)=>{
  const size=bounds(item.parts),nameLines=wrapName(`${index+1}. ${item.name}`,sidebar-padding*2);
  return {nameLines,size:`${number.format(size.w)} × ${number.format(size.d)} × ${number.format(size.h)}`,height:nameLines.length*19+34};
 });
 const listHeight=70+rows.reduce((sum,row)=>sum+row.height,0)+padding;
 const width=sidebar+sceneWidth,height=header+Math.max(sceneHeight,listHeight)+footer;
 // Keep all rows, while staying within conservative browser canvas limits.
 const scale=Math.min(2,16000/width,16000/height,Math.sqrt(24000000/(width*height)));
 canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('画像の作成に失敗しました');
 ctx.scale(scale,scale);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#224f44';ctx.font='600 21px sans-serif';ctx.fillText('Booth Studio',padding,30);
 ctx.font='12px sans-serif';ctx.fillStyle='#617970';
 const views={iso:'斜め上',top:'真上',front:'正面',eye:'来場者目線'};
 ctx.fillText(`ブース ${state.booth.w.toLocaleString()} × ${state.booth.d.toLocaleString()} × 高さ ${state.booth.h.toLocaleString()} mm  /  ${views[view]}  /  ${state.items.length}アイテム`,padding,54);
 ctx.fillStyle='#f4f8f5';ctx.fillRect(0,header,sidebar,height-header-footer);
 ctx.fillStyle='#263c3e';ctx.font='600 17px sans-serif';ctx.fillText('配置物サイズ一覧',padding,header+29);
 ctx.fillStyle='#617970';ctx.font='12px sans-serif';ctx.fillText('幅 × 奥行き × 高さ（mm）',padding,header+51);
 let y=header+70;
 if(!rows.length){ctx.fillStyle='#617970';ctx.font='13px sans-serif';ctx.fillText('配置物はありません',padding,y+20)}
 for(const row of rows){
  ctx.fillStyle='#263c3e';ctx.font='600 14px sans-serif';
  for(const nameLine of row.nameLines){ctx.fillText(nameLine,padding,y+17);y+=19}
  ctx.fillStyle='#14776c';ctx.font='13px sans-serif';ctx.fillText(row.size,padding,y+17);
  y+=34;ctx.strokeStyle='#dce6df';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padding,y-8);ctx.lineTo(sidebar-padding,y-8);ctx.stroke();
 }
 ctx.strokeStyle='#dce6df';ctx.beginPath();ctx.moveTo(sidebar,header);ctx.lineTo(sidebar,height-footer);ctx.stroke();
 ctx.drawImage(source,sidebar,header,sceneWidth,sceneHeight);
 if(state.dims){
  const base=viewport.getBoundingClientRect();
  document.querySelectorAll('.measure').forEach(el=>{
   const rect=el.getBoundingClientRect(),x=rect.left-base.left,y=rect.top-base.top;
   if(x<0||x+rect.width>sceneWidth||y<0||y+rect.height>sceneHeight)return;
   ctx.fillStyle='#fffffff0';ctx.fillRect(sidebar+x,header+y,rect.width,rect.height);
   ctx.fillStyle='#315d50';ctx.font='11px sans-serif';ctx.fillText(el.textContent,sidebar+x+5,header+y+14);
  });
 }
 ctx.fillStyle='#6c7f76';ctx.font='11px sans-serif';ctx.fillText('一覧は各配置物の寸法です。回転による設置範囲の変化は含みません。設営時は現物でご確認ください。',padding,height-14);
 return canvas;
}
function handleExport(format){try{
 if(format==='json'){const json=JSON.stringify(state,null,2);prepareExport(new Blob([json],{type:'application/json;charset=utf-8'}),'booth-layout.json',{json,description:'ブース設定・配置アイテムの形状・位置・角度を含みます。「読み込み」で再編集できます。'});return}
 const canvas=makeExportCanvas(),png=canvas.toDataURL('image/png');if(png==='data:,')throw Error('表示サイズが小さすぎます');
 if(format==='png'){prepareExport(dataUrlBlob(png),'booth-layout.png',{preview:png,description:'左側に配置物の名前と幅・奥行き・高さの一覧、右側に現在の視点のブース図をPNG画像に保存します。'});return}
 if(!window.jspdf?.jsPDF)throw Error('PDF機能を読み込めませんでした。再読み込みしてください');
 const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});pdf.setProperties({title:'Booth Studio - Booth Layout',creator:'Booth Studio'});const maxW=277,maxH=190,r=Math.min(maxW/canvas.width,maxH/canvas.height),w=canvas.width*r,h=canvas.height*r;pdf.addImage(png,'PNG',(297-w)/2,(210-h)/2,w,h,undefined,'FAST');prepareExport(pdf.output('blob'),'booth-layout.pdf',{preview:png,description:'配置物のサイズ一覧を左側、現在の視点のブース図を右側に配置し、A4横・1ページのPDFに保存します。'});
 }catch(e){toast('エクスポートできませんでした：'+e.message)}
}
$('exportJson').onclick=()=>handleExport('json');$('exportPng').onclick=()=>handleExport('png');$('exportPdf').onclick=()=>handleExport('pdf');
$('closeExport').onclick=()=>$('exportDialog').close();
$('exportDialog').addEventListener('close',()=>{$('exportMenuButton').focus()});
$('downloadExport').onclick=()=>{$('exportFeedback').textContent='ブラウザに保存を要求しました。保存されない場合は「別タブで開く」をお試しください。'};
$('copyJson').onclick=async()=>{try{await navigator.clipboard.writeText($('jsonPreview').value);$('exportFeedback').textContent='JSONをコピーしました。テキストエディタに貼り付け、.json形式で保存できます。'}catch{$('jsonPreview').focus();$('jsonPreview').select();$('exportFeedback').textContent='JSONを選択しました。コピーしてテキストエディタに保存してください。'}};
$('nativeSave').onclick=async()=>{if(!exportFile)return;const {blob,name}=exportFile;try{const ext=name.slice(name.lastIndexOf('.')),handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:ext.slice(1).toUpperCase(),accept:{[blob.type.split(';')[0]]:[ext]}}]}),writer=await handle.createWritable();await writer.write(blob);await writer.close();$('exportFeedback').textContent='ファイルを保存しました。'}catch(e){$('exportFeedback').textContent=e.name==='AbortError'?'保存をキャンセルしました。':'保存できませんでした。「ファイルを保存」または「別タブで開く」をお試しください。'}};
window.addEventListener('pagehide',()=>{if(exportUrl)URL.revokeObjectURL(exportUrl);if(downloadUrl)URL.revokeObjectURL(downloadUrl)});
$('save').onclick=()=>{persist();toast($('saveState').textContent==='保存済み'?'このブラウザに保存しました':'ブラウザ保存に失敗しました。JSONで保存してください')};
$('exportLib').onclick=()=>{try{const json=JSON.stringify({type:'booth-library',version:1,items:library},null,2);prepareExport(new Blob([json],{type:'application/json;charset=utf-8'}),'booth-my-items.json',{json,description:'マイアイテムのライブラリをJSONに保存します。ライブラリの「読み込み」で再利用できます。'})}catch(e){toast('エクスポート失敗：'+e.message)}};
let importMode='layout';$('import').onclick=()=>{importMode='layout';$('fileInput').value='';$('fileInput').click()};$('importLib').onclick=()=>{importMode='library';$('fileInput').value='';$('fileInput').click()};$('fileInput').onchange=async()=>{try{const f=$('fileInput').files[0];if(!f)return;if(f.size>10*1024*1024)throw Error('ファイルは10MB以下にしてください');const data=JSON.parse(await f.text());if(importMode==='library'){const incoming=validateLibrary(data.type==='booth-library'?data.items:data);library.push(...incoming.map(t=>({...t,id:uid()})));renderLibrary();persist();toast(incoming.length+'個のアイテムを読み込みました')}else{const next=validateLayout(data);if(!confirm('現在の配置を、読み込んだレイアウトに置き換えますか？'))return;state=next;selected=null;syncBooth();refresh();setView('iso');toast('レイアウトを読み込みました')}}catch(e){toast('読み込み失敗：'+e.message)}};
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||$('editor').open||$('exportDialog').open||$('drawingOptions').open)return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(selectedDimension){state.dimensions=state.dimensions.filter(d=>d.id!==selectedDimension);selectedDimension=null;refresh();}else removeSelected()}if(e.key==='Escape'){cancelPointer();pendingMeasure=null;select(null)}});
// Editing history is browser-session scoped; saved layouts remain independent snapshots.
function historyValue(){return {state:clone(state),library:clone(library)};}
function recordHistory(){if(history&&!historyHold&&!restoringHistory)history.record(historyValue());updateHistoryButtons();}
function updateHistoryButtons(){const pending=history&&JSON.stringify(historyValue())!==JSON.stringify(history.entries[history.index]);$('undo').disabled=!history?.canUndo&&!pending;$('redo').disabled=!history?.canRedo||pending;}
function beginHistory(){if(!historyHold)recordHistory();historyHold=true;}
function endHistory(){historyHold=false;recordHistory();}
function restoreHistory(delta){
 document.activeElement?.blur();endPointer();const next=history.move(delta);if(!next)return;
 restoringHistory=true;state=next.state;library=next.library;normalizeExtras(state);if(!state.items.some(i=>i.id===selected))selected=null;selectedDimension=null;pendingMeasure=null;
 syncBooth();renderLibrary();refresh();setView(view);persist();restoringHistory=false;updateHistoryButtons();toast(delta<0?'元に戻しました':'やり直しました');
}
let selectedDimension=null,pendingMeasure=null,dimensionDrag=null,resizeDrag=null;
const dimensionGroup=new T.Group(),lightGroup=new T.Group();scene.add(dimensionGroup,lightGroup);
let activeLights=[];
function initializeAdvanced(){
 history=new History(historyValue());updateHistoryButtons();
 $('undo').onclick=()=>restoreHistory(-1);$('redo').onclick=()=>restoreHistory(1);
 document.addEventListener('focusin',e=>{if(e.target.matches('input,select')&&!e.target.closest('dialog'))beginHistory();});
 document.addEventListener('focusout',e=>{if(e.target.matches('input,select')&&!e.target.closest('dialog'))endHistory();});
 document.addEventListener('keydown',e=>{if(e.target.closest('dialog')||e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();restoreHistory(e.shiftKey?1:-1);}else if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();restoreHistory(1);}});
 $('resizeMode').onclick=()=>setMode('resize');$('measureMode').onclick=()=>setMode('measure');
 $('resizeTarget').onchange=()=>{if($('resizeTarget').value==='booth'){selected=null;select(null);}drawHandles();};
 $('lightingEnabled').onchange=()=>{state.lighting.enabled=$('lightingEnabled').checked;refresh();};
 $('ambientLevel').oninput=()=>{state.lighting.ambient=+$('ambientLevel').value;buildLighting();persist();};
 $('lightingHelpers').onchange=()=>{state.lighting.helpers=$('lightingHelpers').checked;buildLighting();persist();};
 const lightTemplate={name:'スポットライト',category:'照明',icon:'monitor',parts:[part(180,220,160,0,0,0,'#d8c69b','cylinder')],light:{power:800,color:'#fff0d0',tilt:25,spread:50}};
 const tile=document.createElement('button');tile.className='tile';tile.id='addSpotlight';tile.innerHTML='<span style="font-size:26px">☀</span><span>スポットライト</span>';
 $('standard').append(tile);tile.onclick=e=>{e.stopPropagation();const i=instantiate(lightTemplate,state.booth.w/2-90,Math.min(300,state.booth.d-220));i.y=Math.max(0,state.booth.h-200);i.angle=0;state.items.push(i);state.lighting.enabled=true;selected=i.id;refresh();toast('照明を追加しました。右側で向き・明るさを調整できます');};
 $('exportDrawingPdf').onclick=()=>{closeExportMenu();$('drawingError').textContent='';$('drawingOptions').showModal();};
 $('closeDrawing').onclick=()=>$('drawingOptions').close();
 $('createDrawingPdf').onclick=()=>{try{const blob=makeDrawingPdf(state,{paper:$('drawingPaper').value,scale:$('drawingScale').value});$('drawingOptions').close();prepareExport(blob,'booth-three-views.pdf',{preview:makeDrawingPreview(state),description:'プレビューは図の内容の確認用です。PDFには選択した用紙・縮尺を反映します。平面図・正面図・右側面図と配置物の寸法一覧です。線はベクター形式で、全パーツの外形を表示します。印刷時は「実際のサイズ」を選んでください。'});}catch(e){$('drawingError').textContent=e.message;}};
 $('exportDxf').onclick=()=>{try{prepareExport(new Blob([makeDxf(state)],{type:'application/dxf'}),'booth-three-views.dxf',{preview:makeDrawingPreview(state),description:'平面・正面・右側面を横並びにしたmm単位のCADデータです。壁・配置物・寸法線・番号をレイヤーで分けています。寸法は線と文字です。日本語表示はCADのフォント設定に依存します。'});}catch(e){toast(e.message);}};
 $('dimensionList').onclick=e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.removeDim){state.dimensions=state.dimensions.filter(d=>d.id!==btn.dataset.removeDim);if(selectedDimension===btn.dataset.removeDim)selectedDimension=null;refresh();return;}selectedDimension=btn.dataset.dimension;renderAdvanced();};
 renderAdvanced();setMode('place');
}
function renderAdvanced(){
 if(!state.lighting)normalizeExtras(state);
 $('lightingEnabled').checked=state.lighting.enabled;$('ambientLevel').value=state.lighting.ambient;$('lightingHelpers').checked=state.lighting.helpers;
 $('lightingNote').textContent=(renderer instanceof SoftwareRenderer?'簡易照明表示：影は概算です。':'')+'見え方の参考です。真上表示は明暗を抑えます。実際の照度を保証するものではありません。';
 $('dimensionList').innerHTML=state.dimensions.length?state.dimensions.map((d,n)=>{const g=dimensionGeometry(d,state);return `<div class="dimension-row ${selectedDimension===d.id?'active':''}"><button data-dimension="${esc(d.id)}">${n+1}. ${d.axis==='x'?'左右':'前後'} ${g?Math.round(g.value)+' mm':'対象なし'}</button><button data-remove-dim="${esc(d.id)}" aria-label="寸法線${n+1}を削除">×</button></div>`;}).join(''):'<p class="note">「寸法追加」で2点を選びます。壁や配置物の端に吸着します。</p>';
 const d=state.dimensions.find(d=>d.id===selectedDimension);
 $('dimensionProperties').innerHTML=d?`<label>測定方向<select id="dimensionAxis"><option value="x" ${d.axis==='x'?'selected':''}>左右（X）</option><option value="z" ${d.axis==='z'?'selected':''}>前後（Z）</option></select></label><label>寸法線の離れ / mm<input id="dimensionOffset" type="number" min="-30000" max="30000" value="${Math.round(d.offset)}"></label><p class="note">画面の寸法ラベルをドラッグしても位置を変えられます。対象を削除すると関連する寸法線も削除します。</p>`:'';
 if(d){$('dimensionAxis').onchange=e=>{d.axis=e.target.value;refresh();};$('dimensionOffset').oninput=e=>{const v=+e.target.value;if(num(v,-30000,30000)){d.offset=v;persist();}};}
 drawHandles();buildLighting();
}
function renderLightProperties(i){
 if(!i.light)return;
 const panel=document.createElement('div');panel.className='light-properties';panel.innerHTML=`<h3>スポットライト</h3><div class="fields"><label>明るさ / lm<input data-light="power" type="number" min="0" max="5000" value="${i.light.power}"></label><label>光の色<input data-light="color" type="color" value="${i.light.color}"></label><label>傾き / °（0＝真下）<input data-light="tilt" type="number" min="0" max="90" value="${i.light.tilt}"></label><label>照射角 / °<input data-light="spread" type="number" min="5" max="120" value="${i.light.spread}"></label></div><p class="note">水平の向きはアイテムの回転角度で変更します。位置・高さは下の配置位置で指定します。</p>`;
 $('properties').prepend(panel);
 panel.querySelectorAll('[data-light]').forEach(input=>input.oninput=()=>{const k=input.dataset.light,v=k==='color'?input.value:+input.value;if(k!=='color'&&!num(v,+input.min,+input.max))return;i.light[k]=v;buildLighting();persist();});
}
function lightInfo(i){
 const b=bounds(i.parts),position=new T.Vector3((i.x+b.w/2)/1000,(i.y-15)/1000,(i.z+b.d/2)/1000),a=i.angle*Math.PI/180,t=i.light.tilt*Math.PI/180;
 return {id:i.id,position,direction:new T.Vector3(-Math.sin(a)*Math.sin(t),-Math.cos(t),Math.cos(a)*Math.sin(t)),...i.light};
}
function buildLighting(){
 if(!state.lighting)return;
 lightGroup.traverse(o=>{if(o.isLight)o.dispose?.();});clear(lightGroup);activeLights=[];
 const enabled=state.lighting.enabled&&view!=='top';
 const level=state.lighting.ambient/100;sun.intensity=enabled?level*.8:3;hemisphere.intensity=enabled?.03+level*.9:2.5;ambient.intensity=enabled?.015+level*.15:.3;
 if(!enabled)return;
 activeLights=state.items.filter(i=>i.light).map(lightInfo);
 for(const [n,info] of activeLights.entries()){
  const light=new T.SpotLight(info.color,1,0,info.spread*Math.PI/360,.3,2);light.power=info.power;light.position.copy(info.position);light.target.position.copy(info.position).add(info.direction);light.castShadow=n<4;light.shadow.mapSize.set(512,512);light.shadow.bias=-.0002;light.shadow.normalBias=.015;light.shadow.camera.near=.01;lightGroup.add(light,light.target);
  if(info.id===selected&&state.lighting.helpers){const helper=new T.SpotLightHelper(light,'#d4aa4b');lightGroup.add(helper);helper.update();}
 }
}
function softwareLight(base,center,normal,object){
 const color=base.clone().multiplyScalar(.04+state.lighting.ambient/100*.65),toLight=new T.Vector3();
 for(const l of activeLights){toLight.copy(center).sub(l.position);const distance=Math.max(.1,toLight.length()),cos=toLight.normalize().dot(l.direction),cut=Math.cos(l.spread*Math.PI/360);if(cos<=cut)continue;
  const ndot=Math.max(0,normal.dot(toLight.clone().negate()));if(ndot===0)continue;
  const shadowRay=new T.Raycaster(center.clone().addScaledVector(normal,.004),toLight.clone().negate(),.01,Math.max(.02,distance-.15));
  const blocked=shadowRay.intersectObjects([...furniture.children,...world.children],true).some(h=>h.object!==object&&h.object.material?.opacity>.6&&!h.object.material?.map);
  const fall=Math.min(1,(cos-cut)/Math.max(.001,1-cut)*4),intensity=Math.min(2,l.power/900/(distance*distance)*ndot*fall)*(blocked?.12:1);
  color.add(base.clone().multiply(new T.Color(l.color)).multiplyScalar(intensity));
 }
 return color;
}
function projectPx(point){const p=new T.Vector3(...point.map(v=>v/1000)).project(camera);return {x:(p.x+1)*viewport.clientWidth/2,y:(1-p.y)*viewport.clientHeight/2,z:p.z};}
function drawHandles(){
 const host=$('editHandles');if(!host)return;
 if(mode!=='resize'||resizeDrag){if(mode!=='resize')host.innerHTML='';return;}
 const isBooth=$('resizeTarget').value==='booth',i=state.items.find(i=>i.id===selected);if(!isBooth&&!i){host.innerHTML='';return;}
 const handles=[];
 if(isBooth){const b=state.booth;handles.push(['w',1,[b.w,0,b.d/2]],['d',1,[b.w/2,0,b.d]]);if(view!=='top')handles.push(['h',1,[b.w/2,b.h,b.d/2]]);}
 else{for(const [key,side,u,v,y] of [['w',-1,0,.5,.1],['w',1,1,.5,.1],['d',-1,.5,0,.1],['d',1,.5,1,.1],['h',1,.5,.5,1]]){if(key==='h'&&view==='top')continue;handles.push([key,side,localPoint(i,u,v,y)]);}}
 const sig=handles.map(h=>h.slice(0,2).join('')).join(',')+(isBooth?'booth':i.id);
 if(host.dataset.sig!==sig||!host.children.length){host.dataset.sig=sig;host.innerHTML=handles.map(([key,side])=>`<button class="resize-handle ${key==='h'?'height-handle':''}" data-axis="${key}" data-side="${side}" aria-label="${isBooth?'ブース':esc(i.name)}の${{w:'幅',d:'奥行き',h:'高さ'}[key]}を変更">${{w:'幅',d:'奥',h:'高'}[key]}</button>`).join('');host.querySelectorAll('button').forEach(b=>b.onpointerdown=startResize);}
 handles.forEach(([, ,pt],n)=>{const p=projectPx(pt),b=host.children[n];b.style.left=p.x+'px';b.style.top=p.y+'px';b.hidden=p.z>1||p.z< -1;});
}
function startResize(e){
 if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();document.activeElement?.blur();beginHistory();
 const key=e.currentTarget.dataset.axis,side=+e.currentTarget.dataset.side,isBooth=$('resizeTarget').value==='booth',original=isBooth?clone(state.booth):clone(state.items.find(i=>i.id===selected));
 if(!original){endHistory();return;}
 const a=isBooth?0:original.angle*Math.PI/180,axis=new T.Vector3(...(key==='w'?[Math.cos(a),0,Math.sin(a)]:key==='d'?[-Math.sin(a),0,Math.cos(a)]:[0,1,0]));
 const b=isBooth?original:bounds(original.parts),point=isBooth?new T.Vector3(b.w/2000,b.h/2000,b.d/2000):new T.Vector3(...localPoint(original,.5,.5,.5).map(v=>v/1000));
 const normal=camera.position.clone().sub(point);normal.addScaledVector(axis,-normal.dot(axis)).normalize();if(normal.lengthSq()<.1){endHistory();return;}
 const dragPlane=new T.Plane().setFromNormalAndCoplanarPoint(normal,point);cast(e);const start=ray.ray.intersectPlane(dragPlane,new T.Vector3());if(!start){endHistory();return;}
 resizeDrag={key,side,isBooth,original,axis,plane:dragPlane,start,element:e.currentTarget,pointer:e.pointerId};controls.enabled=false;e.currentTarget.setPointerCapture(e.pointerId);
 e.currentTarget.onpointermove=moveResize;e.currentTarget.onpointerup=endPointer;e.currentTarget.onpointercancel=cancelPointer;
}
function moveResize(e){
 if(!resizeDrag)return;const r=resizeDrag;cast(e);const p=ray.ray.intersectPlane(r.plane,new T.Vector3());if(!p)return;
 const b=r.isBooth?r.original:bounds(r.original.parts);let size=b[r.key]+p.sub(r.start).dot(r.axis)*1000*r.side;if(state.snap)size=Math.round(size/100)*100;else size=Math.round(size);
 if(r.isBooth){size=Math.max(500,Math.min(r.key==='h'?10000:30000,size));state.booth[r.key]=size;syncBooth();buildWorld();checkCollisions();}
 else{const next=resizeItem(r.original,r.key,size,r.side,$('uniformResize').checked);state.items[state.items.findIndex(i=>i.id===r.original.id)]=next;buildItems();size=bounds(next.parts)[r.key];}
 $('operationReadout').hidden=false;$('operationReadout').textContent=`${{w:'幅',d:'奥行き',h:'高さ'}[r.key]} ${Math.round(size).toLocaleString()} mm`;
}
function startPointer(e){
 if(mode==='orbit'||![0,2].includes(e.button))return;
 if(mode==='measure'){if(e.button===0){e.preventDefault();e.stopImmediatePropagation();pickDimension(e);}return;}
 cast(e);const hit=ray.intersectObjects(furniture.children,true)[0];
 if(e.button===2){if(!selected)return;e.preventDefault();e.stopImmediatePropagation();const i=state.items.find(i=>i.id===selected);document.activeElement?.blur();beginHistory();drag={type:'rotate',id:i.id,px:e.clientX,angle:i.angle};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);return;}
 if(!hit){if(mode==='place')select(null);return;}
 let g=hit.object;while(g.parent!==furniture)g=g.parent;select(g.userData.id);if(mode==='resize'){drawHandles();return;}
 const pos=ray.ray.intersectPlane(plane,new T.Vector3());if(!pos)return;
 e.stopImmediatePropagation();document.activeElement?.blur();beginHistory();const i=state.items.find(i=>i.id===selected);drag={type:'move',id:i.id,start:pos.clone(),x:i.x,z:i.z};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);
}
function movePointer(e){
 if(!drag)return;const i=state.items.find(i=>i.id===drag.id);if(!i)return;
 if(drag.type==='rotate'){i.angle=((Math.round((drag.angle+(e.clientX-drag.px)*.5)/10)*10)%360+360)%360;modelGroups.get(i.id).rotation.y=-i.angle*Math.PI/180;$('operationReadout').hidden=false;$('operationReadout').textContent=`回転 ${i.angle}°`;}
 else{cast(e);const p=ray.ray.intersectPlane(plane,new T.Vector3());if(!p)return;let x=drag.x+(p.x-drag.start.x)*1000,z=drag.z+(p.z-drag.start.z)*1000;i.x=state.snap?Math.round(x/100)*100:Math.round(x);i.z=state.snap?Math.round(z/100)*100:Math.round(z);const b=bounds(i.parts),g=modelGroups.get(i.id);g.position.x=(i.x+b.w/2)/1000;g.position.z=(i.z+b.d/2)/1000;}
 checkCollisions();buildLighting();
}
function endPointer(){
 if(!drag&&!resizeDrag&&!dimensionDrag)return;
 const resizedBooth=resizeDrag?.isBooth;if(resizeDrag){const e=resizeDrag.element;if(e.hasPointerCapture(resizeDrag.pointer))e.releasePointerCapture(resizeDrag.pointer);e.onpointermove=null;e.onpointerup=null;e.onpointercancel=null;}
 if(dimensionDrag){dimensionDrag.element.onpointermove=null;dimensionDrag.element.onpointerup=null;dimensionDrag.element.onpointercancel=null;}
 drag=null;resizeDrag=null;dimensionDrag=null;controls.enabled=true;$('operationReadout').hidden=true;buildItems();renderProperties();renderList();renderAdvanced();syncBooth();if(resizedBooth)setView(view);endHistory();persist();
}
function cancelPointer(){
 if(!drag&&!resizeDrag&&!dimensionDrag)return;
 const saved=history.entries[history.index];state=clone(saved.state);library=clone(saved.library);endPointer();syncBooth();buildWorld();buildItems();toast('操作をキャンセルしました');
}
function snapReference(e){
 cast(e);const hit=ray.ray.intersectPlane(plane,new T.Vector3());if(!hit)return null;const raw=[hit.x*1000,0,hit.z*1000],candidates=[];
 const offer=(ref,p)=>{const pixel=projectPx(p),r=renderer.domElement.getBoundingClientRect(),distance=Math.hypot(pixel.x-(e.clientX-r.left),pixel.y-(e.clientY-r.top));if(distance<18)candidates.push({ref,distance});};
 const b=state.booth;
 // Wall endpoints and the nearest point on each visible wall.
 for(const [u,v] of [[0,0],[1,0],[0,1],[1,1]])offer({type:'booth',u,v},[u*b.w,0,v*b.d]);
 for(const [visible,u,v] of [[b.left,0,Math.max(0,Math.min(1,raw[2]/b.d))],[b.right,1,Math.max(0,Math.min(1,raw[2]/b.d))],[b.back,Math.max(0,Math.min(1,raw[0]/b.w)),1]])if(visible)offer({type:'booth',u,v},[u*b.w,0,v*b.d]);
 for(const i of state.items){
  const bb=bounds(i.parts),a=i.angle*Math.PI/180,dx=raw[0]-i.x-bb.w/2,dz=raw[2]-i.z-bb.d/2,u=Math.max(0,Math.min(1,(dx*Math.cos(a)+dz*Math.sin(a))/bb.w+.5)),v=Math.max(0,Math.min(1,(-dx*Math.sin(a)+dz*Math.cos(a))/bb.d+.5));
  for(const [pu,pv] of [[0,0],[1,0],[0,1],[1,1],[.5,.5],[0,v],[1,v],[u,0],[u,1]]){const ref={type:'item',id:i.id,u:pu,v:pv,y:0};offer(ref,localPoint(i,pu,pv));}
 }
 candidates.sort((a,b)=>a.distance-b.distance);if(candidates.length)return candidates[0].ref;
 return {type:'point',x:state.snap?Math.round(raw[0]/100)*100:Math.round(raw[0]),z:state.snap?Math.round(raw[2]/100)*100:Math.round(raw[2]),y:0};
}
function pickDimension(e){
 const ref=snapReference(e);if(!ref)return;if(!pendingMeasure){pendingMeasure=ref;toast('始点を指定しました。次に終点をクリックしてください');return;}
 const a=resolvePoint(pendingMeasure,state),b=resolvePoint(ref,state);if(!a||!b)return;
 const axis=Math.abs(b[0]-a[0])>=Math.abs(b[2]-a[2])?'x':'z';if(Math.abs(b[axis==='x'?0:2]-a[axis==='x'?0:2])<1){toast('離れた2点を指定してください');return;}
 const d={id:uid(),a:pendingMeasure,b:ref,axis,offset:180};state.dimensions.push(d);selectedDimension=d.id;pendingMeasure=null;refresh();toast('寸法線を追加しました。ラベルをドラッグして位置を調整できます');
}
function startDimensionDrag(e){
 if(e.button!==0||mode==='orbit')return;e.preventDefault();e.stopPropagation();document.activeElement?.blur();beginHistory();
 const d=state.dimensions.find(d=>d.id===e.currentTarget.dataset.dim);if(!d){endHistory();return;}selectedDimension=d.id;cast(e);const p=ray.ray.intersectPlane(plane,new T.Vector3());if(!p){endHistory();return;}
 dimensionDrag={id:d.id,start:p,offset:d.offset,element:e.currentTarget};controls.enabled=false;e.currentTarget.setPointerCapture(e.pointerId);
 e.currentTarget.onpointermove=event=>{if(!dimensionDrag)return;cast(event);const p=ray.ray.intersectPlane(plane,new T.Vector3());if(!p)return;const k=d.axis==='x'?'z':'x';d.offset=Math.max(-30000,Math.min(30000,Math.round(dimensionDrag.offset+(p[k]-dimensionDrag.start[k])*1000)));};
 e.currentTarget.onpointerup=endPointer;e.currentTarget.onpointercancel=cancelPointer;
}
function drawAdvanced(){
 drawHandles();clear(dimensionGroup);if(!state.dims||view!=='top')return;
 const pts=[];for(const d of state.dimensions){const g=dimensionGeometry(d,state);if(!g)continue;for(const [a,b] of [[g.a,g.p],[g.b,g.q],[g.p,g.q]])pts.push(a[0]/1000,.012,a[2]/1000,b[0]/1000,.012,b[2]/1000);for(const p of [g.p,g.q])pts.push((p[0]-35)/1000,.012,(p[2]-35)/1000,(p[0]+35)/1000,.012,(p[2]+35)/1000);}
 if(pts.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));const lines=new T.LineSegments(geo,new T.LineBasicMaterial({color:'#14776c',depthTest:false}));lines.userData.wallOutline=true;lines.renderOrder=12;dimensionGroup.add(lines);}
}
function drawCustomLabels(){
 if(!state.dims||view!=='top')return;
 // Reuse a captured dimension label while dragging, otherwise drawDimensions rebuilds the DOM each frame.
 for(const d of state.dimensions){const g=dimensionGeometry(d,state);if(!g)continue;const p=projectPx([(g.p[0]+g.q[0])/2,20,(g.p[2]+g.q[2])/2]);
  let el=dimensionDrag?.id===d.id?dimensionDrag.element:null;
  if(!el){el=document.createElement('span');el.className='measure custom-measure'+(d.id===selectedDimension?' active':'');el.dataset.dim=d.id;el.onpointerdown=startDimensionDrag;}
  el.textContent=Math.round(g.value).toLocaleString()+' mm';el.style.left=p.x+'px';el.style.top=p.y+'px';if(!el.isConnected)$('measurements').append(el);
 }
 if(pendingMeasure){const a=resolvePoint(pendingMeasure,state);if(a)$('measurements').insertAdjacentHTML('beforeend',label('始点',a[0]/1000,.03,a[2]/1000,'measure-preview'));}
}

initializeAdvanced();renderLibrary();syncBooth();buildWorld();buildItems();renderProperties();renderList();setView('iso');resize();animate();$('count').textContent=state.items.length+'アイテム';
window.addEventListener('error',e=>{console.error(e.error);toast('表示エラーが発生しました。ページを再読み込みしてください')});
