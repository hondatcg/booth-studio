import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {History} from '../dist/model.mjs';
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const extract=name=>{const start=source.indexOf('function '+name+'(');let depth=0,end=source.indexOf('{',start);const begin=end;do{if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}while(depth);return source.slice(start,end);};
test('right drag rotates in 10 degree steps and makes a single undo entry',()=>{
 const item={id:'a',angle:350};const model={rotation:{y:0}},readout={},state={items:[item]},history=new History({items:[{...item}]});let hold=false,builds=0;
 const env={mode:'place',selected:'a',drag:null,state,controls:{enabled:true},document:{activeElement:{blur(){}}},T:{Vector3:class {}},ray:{intersectObjects:()=>[]},furniture:{children:[]},renderer:{domElement:{setPointerCapture(){}}},cast(){},beginHistory(){hold=true;},modelGroups:new Map([['a',model]]),$:()=>readout,checkCollisions(){},buildLighting(){builds++;}};
 const context=vm.createContext(env);vm.runInContext(extract('startPointer')+'\n'+extract('movePointer'),context);
 const event={button:2,clientX:100,pointerId:1,preventDefault(){},stopImmediatePropagation(){}};context.startPointer(event);assert.equal(hold,true);assert.equal(env.controls.enabled,false);
 for(const x of [110,120,140,160])context.movePointer({...event,clientX:x});assert.equal(item.angle,20);assert.ok(Math.abs(model.rotation.y+20*Math.PI/180)<1e-8);assert.equal(history.canUndo,false);history.record(state);assert.equal(history.move(-1).items[0].angle,350);assert.equal(history.move(1).items[0].angle,20);assert.ok(builds>0);
});
test('lighting produces aimed spotlights; top view removes lighting effects',async()=>{
 const T=await import('../dist/vendor/three.module.js');
 const {bounds}=await import('../dist/model.mjs');
 const fixture={id:'lamp',x:1000,z:1000,y:2500,angle:90,parts:[{x:0,y:0,z:0,w:180,d:220,h:160}],light:{power:800,color:'#fff0d0',tilt:30,spread:50}};
 const scene=new T.Scene(),group=new T.Group();scene.add(group);
 const ctx=vm.createContext({T,bounds,state:{lighting:{enabled:true,ambient:25,helpers:true},items:[fixture]},view:'iso',selected:'lamp',lightGroup:group,activeLights:[],sun:{},hemisphere:{},ambient:{},clear:g=>g.clear()});
 vm.runInContext(extract('lightInfo')+'\n'+extract('buildLighting'),ctx);ctx.buildLighting();
 const light=group.children.find(c=>c.isSpotLight);assert.ok(light);assert.ok(Math.abs(light.power-800)<1e-7);assert.equal(light.castShadow,true);assert.ok(light.target.position.x<light.position.x);assert.ok(light.target.position.y<light.position.y);assert.equal(light.position.y,2.485);
 ctx.view='top';ctx.buildLighting();assert.equal(group.children.length,0);assert.equal(ctx.sun.intensity,3);
});
