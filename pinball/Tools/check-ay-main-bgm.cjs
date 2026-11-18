#!/usr/bin/env node
// Regression check for Pinball Action's real-time Z80 + 3 AY-3-8910 sound.
// Generates no MP3 and does not alter musical notes or ROM content.
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root,'audio','rom-psg-worklet.js'),'utf8');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(!html.includes('.mp3') && !html.includes('createBufferSource('),
  'Game must play only original AY sound chips');
assert(html.includes('rom-psg-worklet.js?v=820'), 'Safari must load V8.20 sound worklet');

const sampleRate = 22050;
let Processor;
class MockAudioWorkletProcessor {
  constructor() { this.port = {postMessage(){}, onmessage:null}; }
}
vm.runInNewContext(script, {
  sampleRate, AudioWorkletProcessor: MockAudioWorkletProcessor,
  registerProcessor(name, ctor) {
    assert.equal(name,'pb-original-psg');
    Processor=ctor;
  },
}, {timeout:5000});
assert(Processor, 'AudioWorklet registered');
const chip=new Processor();
function renderSeconds(seconds,collect=false){
  const block=128, output=collect?[]:null;
  let energy=0, count=0;
  for(let i=0;i<Math.ceil(sampleRate*seconds/block);i++){
    const out = new Float32Array(block);
    chip.process([],[[out]]);
    for(const v of out){energy+=v*v;count++;}
    if(collect)output.push(...out);
  }
  return {rms:Math.sqrt(energy/count),output};
}
renderSeconds(.4);
chip.port.onmessage({data:{type:'command',command:10}});
const active = Array(9).fill(0), pieces=[],audio=[];
for(let t=0;t<15;t++){
  let wave=renderSeconds(1,true);pieces.push(wave.rms);
  if(t>=3&&t<=9)audio.push(...wave.output);
  for(let n=0;n<9;n++){
    if(chip.ay[Math.floor(n/3)].reg[8+n%3] !== 0)active[n]++;
  }
}
assert(chip.readyForCommands, 'Sound Z80 did not initialise its CTC');
assert(pieces.some(x=>x>.08), 'Main table music is silent');
assert(active[2]||active[5]||active[8], 'First table lost the third channel of all AY chips');
assert(active[5]&&active[8], 'First table lost one of its main two voices');

function magnitude(samples, freq){
  // Frequency-component check; these are derived by the original sound ROM,
  // NOT created or injected by this test.
  const n = samples.length;
  let real=0,imag=0,c=1,s=0;
  const step=2*Math.PI*freq/sampleRate,cc=Math.cos(step),ss=Math.sin(step);
  for(let i=0;i<n;i++){
    const v=samples[i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
    real+=v*c;imag+=v*s;
    const nextC=c*cc-s*ss;
    s=c*ss+s*cc;c=nextC;
  }
  return Math.hypot(real,imag);
}
const spectral=[81.4,162.8,244.1].map(f=>({
  hz:f,relative:+(magnitude(audio,f)/audio.length).toFixed(6)
}));
assert(spectral[0].relative>0.001, 'Main background envelope ~81 Hz missing');
assert(spectral[1].relative>0.001, 'Main note/harmonic ~163 Hz missing');
assert(spectral[2].relative>0.0001, 'Main harmonic ~244 Hz missing');
console.log(JSON.stringify({
  status:'PASS',engine:'Z80 ROM + three AY-3-8910 chips, no MP3',
  firstTableVolumeBySecond:pieces.map(v=>+v.toFixed(3)),
  channelsActiveAtSecondMarkers:active,firstTableSpectrum:spectral
},null,2));
