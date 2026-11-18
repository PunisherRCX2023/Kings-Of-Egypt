#!/usr/bin/env node
// Render MP3 sound effects from the supplied, original Pinball Action sound ROM.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const hit=html.match(/const workletSource=("(?:\\.|[^"\\])*");/s);
if(!hit)throw Error('Original audio ROM interpreter not embedded');
const source=JSON.parse(hit[1]);
if(!source.includes('PB_SOUND_ROM')||!source.includes("registerProcessor('pb-original-psg'"))throw Error('Original ROM emulation missing');
const sampleRate=22050;let SoundCPU;
vm.runInNewContext(source,{sampleRate,atob,AudioWorkletProcessor:class{constructor(){this.port={onmessage:null,postMessage:()=>{}}}},registerProcessor:(n,c)=>{if(n==='pb-original-psg')SoundCPU=c;}},{timeout:5000});
if(!SoundCPU)throw Error('Could not initialize original sound chip emulation');
const out=path.join(root,'audio');fs.mkdirSync(out,{recursive:true});
const manifest={source:'original a-e3.bin Z80 + three AY8910 (1985)',sampleRate,commands:{}};
function render(cpu,secs){
 const frames=Math.round(sampleRate*secs),pcm=new Float32Array(frames);
 for(let i=0;i<frames;){let n=Math.min(1024,frames-i),a=new Float32Array(n),b=new Float32Array(n);cpu.process([],[[a,b]]);pcm.set(a,i);i+=n;}
 return pcm;
}
for(let cmd=1;cmd<=30;cmd++){
 const cpu=new SoundCPU();render(cpu,.45);cpu.port.onmessage({data:{type:'command',command:cmd}});
 const duration=[3,4,9,10,16,17,18,19,20,25,26,27,28].includes(cmd)?5.2:3.1;
 const pcm=render(cpu,duration),window=Math.round(sampleRate*.05),th=.003;
 let last=0,peak=0;
 for(let i=0;i<pcm.length;i+=window){let energy=0;for(let j=i;j<Math.min(i+window,pcm.length);j++){let v=pcm[j];energy+=v*v;peak=Math.max(peak,Math.abs(v));}
  if(Math.sqrt(energy/Math.min(window,pcm.length-i))>th)last=i+window;
 }
 if(peak<.012)continue;
 let n=Math.max(Math.round(sampleRate*.18),Math.min(pcm.length,last+Math.round(sampleRate*.08)));
 if(cmd===22)n=Math.min(n,Math.round(sampleRate*.24));
 let wave=pcm.subarray(0,n),fade=Math.min(Math.round(sampleRate*.014),Math.floor(n/10));
 for(let i=0;i<fade;i++)wave[n-i-1]*=i/fade;
 const name='cmd-'+String(cmd).padStart(2,'0')+'.mp3';
 const args=['-hide_banner','-loglevel','error','-f','f32le','-ar',String(sampleRate),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','96k','-y',path.join(out,name)];
 const r=cp.spawnSync('ffmpeg',args,{input:Buffer.from(wave.buffer,wave.byteOffset,wave.byteLength),maxBuffer:1000000});
 if(r.status!==0)throw Error('ffmpeg cmd '+cmd+': '+r.stderr?.toString());
 manifest.commands[cmd]={file:name,duration:+(n/sampleRate).toFixed(3),peak:+peak.toFixed(3),bytes:fs.statSync(path.join(out,name)).size};
 console.log('original ROM command',cmd,'->',name);
}
if(Object.keys(manifest.commands).length<25||![2,10,22,28].every(c=>manifest.commands[c]))throw Error('Essential original ROM sounds are missing');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// Music must NOT be cut to the first five seconds like an effect.
// These are the sustained audio commands detected by running the original
// sound ROM for 14 seconds and measuring both AY register activity and output.
// Command 10 is also confirmed as the real playfield tune: main Z80 emits it
// immediately after launching the ball (original-ROM frame trace).
const musicCommands=[9,10,17,18,20,26,27,29];
manifest.music={};
for(const cmd of musicCommands){
 const cpu=new SoundCPU();
 render(cpu,.45);
 cpu.port.onmessage({data:{type:'command',command:cmd}});
 const seconds=52, pcm=render(cpu,seconds);
 // Keep the complete running song, never silence-trim an active track.
 const name='bgm-'+String(cmd).padStart(2,'0')+'.mp3';
 const args=['-hide_banner','-loglevel','error','-f','f32le','-ar',String(sampleRate),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','96k','-y',path.join(out,name)];
 const result=cp.spawnSync('ffmpeg',args,{input:Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength),maxBuffer:1000000});
 if(result.status!==0)throw Error('ffmpeg background '+cmd+': '+(result.error?.message||result.stderr?.toString()));
 manifest.music[cmd]={file:name,duration:seconds,origin:'ROM a-e3.bin via Z80 + AY8910',bytes:fs.statSync(path.join(out,name)).size};
 console.log('Original long-running music command',cmd,'->',name,seconds,'seconds');
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Created',Object.keys(manifest.commands).length,'original effects and',musicCommands.length,'long original music MP3 files.');
