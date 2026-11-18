// Pinball Action Tehkan sound: original 1985 Z80 ROM, 3 x AY8910 PSGs
// Based on original file a-e3.bin provided by the user; no prerecorded foley.
// Measured AY-3-8910 analogue DAC voltages (roughly 1k load), normalized
// to full-scale. These replace approximate logarithmic levels so the
// original ROM's quiet note steps and harmonics are not under/over-emphasized.
// Reference: MAME ay8910.cpp, Extech EX520 measurements (2014).
const AY_DAC_VOLTS=[0,.0106,.0150,.0222,.0320,.0466,.0665,.1039,
                     .1237,.1986,.2803,.3548,.4702,.6030,.7530,.9250];
const AY_AMP=AY_DAC_VOLTS.map(v=>v/.9250);
class PBAudioAY {
 constructor(sampleRate){
  this.sr=sampleRate;this.reg=new Uint8Array(16);
  this.addr=0;this.phase=new Float64Array(3);
  this.noisePhase=0;this.lfsr=0x1ffff;this.noiseBit=1;
  this.envPhase=0;this.envTick=0;this.envContinue=0;
  this.envAttack=0;this.envAlternate=0;this.envHold=0;this.envLevel=0;this.envDone=false;
 }
 write(addr,value){
  if((addr&1)===0){this.addr=value&15;return;}
  const k=this.addr;this.reg[k]=value&255;
  if(k===13){
   this.envPhase=0;this.envTick=0;this.envContinue=(value>>3)&1;
   this.envAttack=(value>>2)&1;this.envAlternate=(value>>1)&1;
   this.envHold=value&1;this.envDone=false;
  }
 }
 sample(){
  const r=this.reg;
  let noisePeriod=(r[6]&31)||1;
  this.noisePhase+=1500000/(16*noisePeriod*this.sr);
  while(this.noisePhase>=1){
   this.noisePhase-=1;
   const feedback=((this.lfsr^ (this.lfsr>>3))&1);
   this.lfsr=(this.lfsr>>1)|(feedback<<16);
   this.noiseBit=this.lfsr&1;
  }
  const envPeriod=((r[12]<<8)|r[11])||1;
  // AY envelope advances one of its 16 shape steps every clock/(16*period).
  // The former /256 factor stretched envelopes 16x: distorted melody, echo.
  this.envPhase+=1500000/(16*envPeriod*this.sr);
  while(this.envPhase>=1){
   this.envPhase-=1;
   if(!this.envDone){
    this.envTick++;
    if(this.envTick>=16){
     this.envTick=0;
     if(!this.envContinue){this.envDone=true;this.envLevel=0;}
     else if(this.envHold){this.envDone=true;this.envLevel=this.envAttack ? 15 : 0;}
     else if(this.envAlternate)this.envAttack^=1;
    }
   }
  }
  if(!this.envDone)this.envLevel=this.envAttack?this.envTick:15-this.envTick;
  let sum=0;
  for(let ch=0;ch<3;ch++){
   const period=(((r[ch*2+1]&15)<<8)|r[ch*2])||1;
   this.phase[ch]+=1500000/(16*period*this.sr);
   if(this.phase[ch]>=1)this.phase[ch]-=Math.floor(this.phase[ch]);
   const toneOK=(r[7]&(1<<ch))!==0 || this.phase[ch]<.5;
   const noiseOK=(r[7]&(1<<(ch+3)))!==0 || this.noiseBit!==0;
   if(!toneOK||!noiseOK)continue;
   const v=r[ch+8];
   sum+=AY_AMP[(v&16)?this.envLevel:(v&15)];
  }
  return sum;
 }
}

const FS = 0x80, FZ = 0x40, FH = 0x10, FP = 0x04, FN = 0x02, FC = 0x01, F3=0x08, F5=0x20;
const PAR = Uint8Array.from({length:256},(_,v)=>{let n=0;while(v){n^=v&1;v>>=1;}return !n?1:0});
class AudioZ80 {
 constructor(memory,state={},callbacks={}){
  this.mem=memory; this.r=state.r?[...state.r]:Array(8).fill(0);
  this.f=state.f||0;this.fa=state.fa||0;this.aa=state.aa||0;
  this.alt=state.r_alt?[...state.r_alt]:Array(8).fill(0);
  this.sp=state.sp??65535;this.pc=state.pc||0;this.ix=state.ix||0;this.iy=state.iy||0;
  this.i=state.i||0;this.rreg=state.rreg||0;
  this.halt=false;this.iff=!!state.iff;this.iff2=!!state.iff2;
  this.nmiEnable=state.nmi_enabled??0;this.scroll=state.scroll||0;this.flipped=state.flipped||0;
  this.io={p1:0,p2:0,system:0,dsw1:0x40,dsw2:0};this.cb=callbacks;
  this.videoChanged=true;this.paletteChanged=true;
  this.bgDirty=true;this.fgDirty=true;
  this.steps=0;
 }
 get(a){a&=65535;
  if(a===0x8000)return this.cb.readLatch();
  if(a>=0x2000&&a<0x4000)return 0xff;
  if(a>=0x4800&&a<0x8000)return 0xff;
  if(a>0x8000)return 0xff;
  if(a===0xe600)return this.io.p1;
  if(a===0xe601)return this.io.p2;
  if(a===0xe602)return this.io.system;
  if(a===0xe604)return this.io.dsw1;
  if(a===0xe605)return this.io.dsw2;
  if(a===0xe606)return 0xff; // MAME documents this address as an unmapped read
  return this.mem[a];
 }
 wr(a,v){a&=65535;v&=255;
  if(a===0xffff){this.cb.irqAck?.();return;}
  if(a>=0x4000&&a<0x4800){this.mem[a]=v;return;}
  if(a<0x4000||a>=0x4800)return;
  if(a===0xe600){this.nmiEnable=v&1;return;}
  if(a===0xe604){if(this.flipped!==v){this.flipped=v;this.videoChanged=true;this.bgDirty=this.fgDirty=true;}return;}
  if(a===0xe606){if(this.scroll!==v){this.scroll=v;this.videoChanged=true;}return;}
  if(a===0xe800){if(this.cb.sound)this.cb.sound(v);return;}
  if(a<0xc000)return;
  if(this.mem[a]!==v){
   if(a>=0xd000&&a<0xe080){this.videoChanged=true;if(a<0xd800)this.fgDirty=true;else if(a<0xe000)this.bgDirty=true;}
   if(a>=0xe400&&a<0xe600){this.videoChanged=true;this.paletteChanged=true;}
   this.mem[a]=v;
  }
 }
 fetch(){let v=this.get(this.pc);this.pc=(this.pc+1)&65535;return v;}
 f16(){let lo=this.fetch();return lo|(this.fetch()<<8)}
 push(v){this.sp=(this.sp-1)&65535;this.wr(this.sp,v>>8);this.sp=(this.sp-1)&65535;this.wr(this.sp,v);}
 pop(){let v=this.get(this.sp);this.sp=(this.sp+1)&65535;v|=this.get(this.sp)<<8;this.sp=(this.sp+1)&65535;return v;}
 r16(p,idx=null){switch(p){case 0:return this.r[0]<<8|this.r[1];case 1:return this.r[2]<<8|this.r[3];case 2:return idx==='IX'?this.ix:idx==='IY'?this.iy:(this.r[4]<<8|this.r[5]);default:return this.sp;}}
 s16(p,v,idx=null){v&=65535;if(p===0){this.r[0]=v>>8;this.r[1]=v&255}else if(p===1){this.r[2]=v>>8;this.r[3]=v&255}else if(p===2){if(idx==='IX')this.ix=v;else if(idx==='IY')this.iy=v;else{this.r[4]=v>>8;this.r[5]=v&255;}}else this.sp=v;}
 rr(k,idx=null,disp=null){if(k===6)return this.get((this.r16(2,idx)+(disp||0))&65535);if(idx&&(k===4||k===5)){let v=this.r16(2,idx);return k===4?(v>>8)&255:v&255;}return this.r[k];}
 ww(k,v,idx=null,disp=null){v&=255;if(k===6)this.wr((this.r16(2,idx)+(disp||0))&65535,v);else if(idx&&(k===4||k===5)){let n=this.r16(2,idx);this.s16(2,k===4?((v<<8)|(n&255)):((n&0xff00)|v),idx);}else this.r[k]=v;}
 aflags(x,y,res,kind){let z=res&255;let f=(z&(FS|F3|F5))|(z===0?FZ:0);
  if(kind==='add'){f|=(((x&15)+(y&15)>15)?FH:0);f|=(((~(x^y)&(x^z)&128)!==0)?FP:0);f|=(res>255?FC:0)}
  else{f|=FN|((x&15)<(y&15)?FH:0)|(((x^y)&(x^z)&128)!==0?FP:0)|(res<0?FC:0)}
  this.f=f;return z;
 }
 logic(v,op){let a=this.r[7],h=0,res;
  if(op===4){res=a&v;h=FH;}else if(op===5)res=a^v;else res=a|v;
  this.r[7]=res;this.f=(res&(FS|F3|F5))|(res===0?FZ:0)|(PAR[res]?FP:0)|h;
 }
 alu(op,v){let a=this.r[7];
  if(op===0||op===1){let carry=op===1&&(this.f&FC)?1:0;this.r[7]=this.aflags(a,v+carry,a+v+carry,'add');if((a&15)+(v&15)+carry>15)this.f|=FH;if((~(a^v)&(a^this.r[7])&128)!==0)this.f|=FP;}
  else if(op===2||op===3||op===7){let carry=op===3&&(this.f&FC)?1:0;let res=a-v-carry;let z=this.aflags(a,(v+carry)&255,res,'sub');if(op!==7)this.r[7]=z;if((a&15)<(v&15)+carry)this.f|=FH;if(((a^v)&(a^z)&128)!==0)this.f|=FP;}
  else this.logic(v,op);
 }
 incdec(v,down=false){let z=(v+(down?-1:1))&255;let f=(this.f&FC)|(z&(FS|F3|F5))|(z===0?FZ:0);
  if(down)f|=FN|((v&15)===0?FH:0)|(v===128?FP:0);else f|=((v&15)===15?FH:0)|(v===127?FP:0);
  this.f=f;return z;
 }
 cond(y){let f=this.f;return [!(f&FZ),!!(f&FZ),!(f&FC),!!(f&FC),!(f&FP),!!(f&FP),!(f&FS),!!(f&FS)][y];}
 jr(d){this.pc=(this.pc+(d<128?d:d-256))&65535;}
 cbop(op,idx=null,disp=null){let x=op>>6,y=(op>>3)&7,z=op&7,k=idx?6:z,v=this.rr(k,idx,disp),res,carry;
  if(x===0){let c=(this.f&FC)?1:0;
   if(y===0){res=((v<<1)|(v>>7))&255;carry=v>>7;}
   else if(y===1){res=(v>>1)|((v&1)<<7);carry=v&1;}
   else if(y===2){res=((v<<1)|c)&255;carry=v>>7;}
   else if(y===3){res=(v>>1)|(c<<7);carry=v&1;}
   else if(y===4){res=(v<<1)&255;carry=v>>7;}
   else if(y===5){res=(v>>1)|(v&128);carry=v&1;}
   else if(y===6){res=((v<<1)|1)&255;carry=v>>7;}
   else{res=v>>1;carry=v&1;}
   this.f=(res&(FS|F3|F5))|(res===0?FZ:0)|(PAR[res]?FP:0)|carry;
   this.ww(k,res,idx,disp);if(idx&&z!==6)this.ww(z,res);
  }else if(x===1){this.f=(this.f&FC)|FH|((v&(1<<y))?0:(FZ|FP))|((y===7&&(v&128))?FS:0)|(v&(F3|F5));}
  else {res=x===2?(v&~(1<<y)):(v|(1<<y));this.ww(k,res,idx,disp);if(idx&&z!==6)this.ww(z,res);}
 }
 edop(){let op=this.fetch(),x=op>>6,y=(op>>3)&7,z=op&7,p=y>>1,q=y&1;
  if(x===1){
   if(z===0){let v=this.cb.ioIn(this.r[1]);if(y!==6)this.ww(y,v);this.f=(this.f&FC)|(v&(FS|F3|F5))|(v===0?FZ:0)|(PAR[v]?FP:0);}
   else if(z===1){this.cb.ioOut(this.r[1],y===6?0:this.r[y]);}
   else if(z===2){let v=this.r16(p),a=this.r16(2),carry=this.f&FC?1:0;let res=q?(a+v+carry):(a-v-carry),zres=res&65535;this.s16(2,zres);
    let f=(zres>>8)&(FS|F3|F5);if(zres===0)f|=FZ;if(!q)f|=FN;
    if(q?res>65535:res<0)f|=FC;
    if(q?(a&4095)+(v&4095)+carry>4095:(a&4095)<(v&4095)+carry)f|=FH;
    if(q?((~(a^v)&(a^zres)&32768)!==0):(((a^v)&(a^zres)&32768)!==0))f|=FP;this.f=f;
   }else if(z===3){let addr=this.f16();if(q)this.s16(p,this.get(addr)|(this.get(addr+1)<<8));else{let v=this.r16(p);this.wr(addr,v);this.wr(addr+1,v>>8);}}
   else if(z===4){this.r[7]=this.aflags(0,this.r[7],-this.r[7],'sub');}
   else if(z===5){this.pc=this.pop();this.iff=this.iff2;}
   else if(z===6){}
   else if(z===7){if(y===0)this.i=this.r[7];else if(y===1)this.rreg=this.r[7];else if(y===2||y===3){this.r[7]=y===2?this.i:this.rreg;let v=this.r[7];this.f=(this.f&FC)|(v&(FS|F3|F5))|(v===0?FZ:0)|(this.iff2?FP:0);}}
  }else if(x===2&&y>=4&&z<=3){let backwards=(y===5||y===7),repeat=y>=6,d=backwards?-1:1;
   if(z===0){let v=this.get(this.r16(2));this.wr(this.r16(1),v);this.s16(2,this.r16(2)+d);this.s16(1,this.r16(1)+d);this.s16(0,this.r16(0)-1);this.f=(this.f&(FS|FZ|FC))|(this.r16(0)?FP:0)|((this.r[7]+v)&(F3|F5));if(repeat&&this.r16(0))this.pc=(this.pc-2)&65535;}
   else if(z===1){let v=this.get(this.r16(2));this.s16(2,this.r16(2)+d);this.s16(0,this.r16(0)-1);let cf=this.f&FC;this.aflags(this.r[7],v,this.r[7]-v,'sub');this.f=(this.f&~FC)|cf;if(this.r16(0))this.f|=FP;else this.f&=~FP;if(repeat&&this.r16(0)&&!(this.f&FZ))this.pc=(this.pc-2)&65535;}
   else{let addr=this.r16(2);if(z===2)this.wr(addr,255);this.s16(2,addr+d);this.r[0]=(this.r[0]-1)&255;this.f=(this.r[0]===0?FZ:0)|(z===3?FN:0);if(repeat&&this.r[0])this.pc=(this.pc-2)&65535;}
  }
 }
 step(){let op=this.fetch(),idx=null;
  if(op===0xdd||op===0xfd){idx=op===0xdd?'IX':'IY';op=this.fetch();while(op===0xdd||op===0xfd){idx=op===0xdd?'IX':'IY';op=this.fetch();}}
  this.steps++;
  if(op===0xcb){let disp=null;if(idx){disp=this.fetch();if(disp>127)disp-=256;}this.cbop(this.fetch(),idx,disp);return;}
  if(op===0xed){this.edop();return;}
  let x=op>>6,y=(op>>3)&7,z=op&7,p=y>>1,q=y&1,disp=null;
  if(idx&&((x===1&&op!==0x76&&(y===6||z===6))||(x===2&&z===6)||(x===0&&(z===4||z===5||z===6)&&y===6))){disp=this.fetch();if(disp>127)disp-=256;}
  if(x===0){
   if(z===0){if(y===0){}else if(y===1){let a=this.r[7];this.r[7]=this.aa;this.aa=a;let f=this.f;this.f=this.fa;this.fa=f;}
    else if(y===2){let v=this.fetch();this.r[0]=(this.r[0]-1)&255;if(this.r[0])this.jr(v);}
    else if(y===3)this.jr(this.fetch());else {let v=this.fetch();if(this.cond(y-4))this.jr(v);}}
   else if(z===1){if(!q)this.s16(p,this.f16(),idx);else{let a=this.r16(2,idx),v=this.r16(p,idx),res=a+v;this.s16(2,res,idx);this.f=(this.f&(FS|FZ|FP))|((res>>8)&(F3|F5))|((a&4095)+(v&4095)>4095?FH:0)|(res>65535?FC:0);}}
   else if(z===2){if(p===0){if(q)this.r[7]=this.get(this.r16(0));else this.wr(this.r16(0),this.r[7]);}
    else if(p===1){if(q)this.r[7]=this.get(this.r16(1));else this.wr(this.r16(1),this.r[7]);}
    else if(p===2){let addr=this.f16();if(q)this.s16(2,this.get(addr)|(this.get(addr+1)<<8),idx);else{let v=this.r16(2,idx);this.wr(addr,v);this.wr(addr+1,v>>8);}}
    else{let addr=this.f16();if(q)this.r[7]=this.get(addr);else this.wr(addr,this.r[7]);}}
   else if(z===3)this.s16(p,this.r16(p,idx)+(q?-1:1),idx);
   else if(z===4)this.ww(y,this.incdec(this.rr(y,idx,disp)),idx,disp);
   else if(z===5)this.ww(y,this.incdec(this.rr(y,idx,disp),true),idx,disp);
   else if(z===6)this.ww(y,this.fetch(),idx,disp);
   else if(z===7){let a=this.r[7],oldc=!!(this.f&FC),v,c;
    if(y===0){v=((a<<1)|(a>>7))&255;c=a>>7;}
    else if(y===1){v=(a>>1)|((a&1)<<7);c=a&1;}
    else if(y===2){v=((a<<1)|(oldc?1:0))&255;c=a>>7;}
    else if(y===3){v=(a>>1)|((oldc?1:0)<<7);c=a&1;}
    else if(y===4){let dif=((a&15)>9||(this.f&FH)?6:0)+(a>153||oldc?0x60:0);v=(this.f&FN?a-dif:a+dif)&255;this.f=(this.f&FN)|(v&FS)|(v===0?FZ:0)|(PAR[v]?FP:0)|(v&(F3|F5))|(oldc||(dif&0x60)?FC:0)|(((a^v)&16)?FH:0);this.r[7]=v;return;}
    else if(y===5){this.r[7]=a^255;this.f=(this.f&(FS|FZ|FP|FC))|FH|FN|(this.r[7]&(F3|F5));return;}
    else if(y===6){this.f=(this.f&(FS|FZ|FP))|(a&(F3|F5))|FC;return;}
    else{this.f=(this.f&(FS|FZ|FP))|(a&(F3|F5))|(oldc?FH:0)|(oldc?0:FC);return;}
    this.r[7]=v;this.f=(this.f&(FS|FZ|FP))|(v&(F3|F5))|c;}
  }else if(x===1){if(op===0x76){this.halt=true;return;}if(idx&&(y===6||z===6)){let v=this.rr(z,(z===4||z===5)?null:idx,disp);this.ww(y,v,(y===4||y===5)?null:idx,disp);}else this.ww(y,this.rr(z,idx),idx);}
  else if(x===2)this.alu(y,this.rr(z,idx,disp));
  else{
   if(z===0){if(this.cond(y))this.pc=this.pop();}
   else if(z===1){if(!q){let v=this.pop();if(p===3){this.r[7]=v>>8;this.f=v&255;}else this.s16(p,v,idx);}
    else{if(p===0)this.pc=this.pop();else if(p===1){for(let j=0;j<6;j++){let v=this.r[j];this.r[j]=this.alt[j];this.alt[j]=v;}}else if(p===2)this.pc=this.r16(2,idx);else this.sp=this.r16(2,idx);}}
   else if(z===2){let addr=this.f16();if(this.cond(y))this.pc=addr;}
   else if(z===3){if(y===0)this.pc=this.f16();else if(y===1){}else if(y===2){this.cb.ioOut(this.fetch(),this.r[7]);}
    else if(y===3){this.r[7]=this.cb.ioIn(this.fetch());}
    else if(y===4){let v=this.pop(),old=this.r16(2,idx);this.s16(2,v,idx);this.push(old);}
    else if(y===5){let v=this.r16(2,idx);this.s16(2,this.r16(1),idx);this.s16(1,v);}
    else if(y===6){this.iff=false;this.iff2=false;}else{this.iff=true;this.iff2=true;}}
   else if(z===4){let addr=this.f16();if(this.cond(y)){this.push(this.pc);this.pc=addr;}}
   else if(z===5){if(!q){let v=p===3?((this.r[7]<<8)|this.f):this.r16(p,idx);this.push(v);}
    else if(p===0){let addr=this.f16();this.push(this.pc);this.pc=addr;}}
   else if(z===6)this.alu(y,this.fetch());
   else if(z===7){this.push(this.pc);this.pc=y*8;}
  }
 }
 nmi(){if(this.nmiEnable){this.halt=false;this.iff2=this.iff;this.iff=false;this.push(this.pc);this.pc=0x66;}}
}

AudioZ80.prototype.irq=function(vector){
 if(!this.iff)return false;
 this.halt=false;this.iff=false;this.iff2=false;
 this.push(this.pc);
 const addr=((this.i<<8)|(vector&255))&65535;
 this.pc=this.get(addr)|(this.get(addr+1)<<8);
 return true;
};

const PB_SOUND_ROM="8zL//8MnAP+HXxYAGcn//14jVsn/////3W4B3WYCI911Ad10An7JMQBIPgHtR+1ePhAy//8IAf8HIQBAEQFANgDtsDL//80rATL//wg9IOU+ANMAPtfTAD4B0wA+p9MBPl3TATL///vNdwPDaAD//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wgBEwEAAAAA9ToAgDJDQvH77U31xdXl3eX7Mv//zSACzZsB3eHh0cHx7U0hQEI+/3cjdyN3ARADHgftWQzteQ0cPO1ZDO15DRztWQzteQ0c7VkM7Xk+D4E+/xDcyT4BMkRCya8yRELJPgIyRELJIQBAESAAAQMSeP4JKBX+BigR/gMoDf4MKA3+DygJ/hIoBXEZEOPJfrF3w5EBOkNCt8hPrzJDQnkNKMX+Aigg/v8orP7+KK7+/Siv/jzQOkRC/gLIPSAIWRYAIVAIGU55IVQJz9d7ssgaPMg9byYAKSkpKSkBAEAJ/gna9QEB4P4Jy9YBIAEJfuYE9gF36yNOI0Yj6yMLcSNwBgAjNgEjcD4EhW9wI3AjcA4MCXAjcMPWASEAQH4P0oUCDzhaCE8+A4VvftYBd9JCAiOvtsrBAjXDQwIjCE8Iy1HCiwIjCOYYwnUCNcJ1AiPXIxMa/v/CbAIBDQAJViteAfT/CRp3KxNyK3MrGncRGwAZEUBC67ftUuvCIwLJESAAw3gCPgqFb0YrTitWK17rCetzI3IIy2cgBwH5/wnDTQIIe8s6H8s6H8s6HwEEAAl3I3IB9P8Jw0wCPvyFb+Xd4d/+8NLnAv6A2vAC5n/dhhYhkAfP1xvdcxLdchPDyALmDyGnBM/X6+lP5g9H/gzSWAPdfgDm5913AHnm8A9PD4GA3YYX/jDSGQMhAAfP18MjAyFgB9YwXxYAGV7dcwvdcgzdbhLdZhPddQPddATdfgDmYMJfA91uFN1mFX7ddwgjft13Bd11Bt10B93l4cOFAt3LAN7DKQPLd8pSA3vLOh/LOh/LOh/ddxDdchHDUgMhAEDZDhAGAxFAQtl+D9q2AxEgABnZEPDZff5AyqMD2T4Qgf5AynsDT8N9AwEQAx4HPg/tWQxW7VEjgU8Q88kP0tYDPgSmd9kuCc1EBBq1Eng99gjteQyv7XkN2cOIAw/aiAMP2r4DD+YDwloEy91+I5b+ENrvA6/ZaC3L3e1pDO15Ddkjftm3wgcELgHDCQQuCM1EBH0vbxq0pRLZfrfKJAQ92S4G7WkM7XkN2SN+2W/ZI34RFAAZ2WAlyyTtYQztaQ0k7WEM7XkNw40DeebwDw8PDz2DXyYJeD3IyyXLJMNRBE8REQAZViteK35Ht8prBDYAPvuFb9V42WAly9ztYQwmEO1hDSYNt8qKBO1hDO15DXw94e15DO1hDT3teQztaQ3Zy0HC/AM+9oVvw74DxwRJBVAFVwVeBXIFfwWUBa4FvQXFBcwFUQZqBnEGfwbdbgHdZgIjfjzK9QQ8yhcFPT3ddQHddAIhkAjP191zFN1yFT6f3aYA3XcAw8gCI34jXiNW3XUB3XQC3XcP3XMQ3XIR3X4A5p/2IN13AMPIAiN+3XcPI348yjYFK911Ad10At1+AOaf9mDddwDDyALddQHddALdfgDmn/ZA3XcAw8gC3913CcPIAt/ddxfDyALf3XcWw8gC3W4B3WYCI14jVhvdcwHdcgLDyALf3Xca3XUY3XQZw8gC3TUaysgC3V4Y3VYZ3XMB3XICw8gC3W4B3WYCI14jVhvdcwHdcgLddRvddBzDyALdXhvdVhzdcwHdcgLDyALfPN13CsPIAt02CgDDyAI+592mAN13AN1uAd1mAiNOI0bdcQvdcAzFI14jVuu37ULS/AXdywDmTUQhAAC37ULressjF8sjF8sjF8sjF1cjTiNG3XUB3XQC3XES3XATIQAAPgzLI8sSyxXLFLftQhPSMQYbCT3CIAbdywBmykMGIQAAt+1S691zDd1yDt3LAObRwykDPufdpgDddwDdbgHdZgIj1911Ad10AsMjA98yQ0LDyALdfgk8/g8wBt13CcPIAt3l4X7mBPYDdxEAQevtUuvShQIR4P4Zy5YRIAEZw4UC/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////zMLkgr6CWsJ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G4YMgPEG994bhgyA8Qj33huGDIDxCvfeG4YMgPEM994bhgyA8Q733hv/8gz08RsJWRwMcBwPhxz/8AL7kAAQAAgA+xAAkAAIAIQM/v70WxzwAvtAAkAACAD7QABAAggAhAz+/vRyHPAC+2ADYAAIAPtgAGADCACEDP7+9IkcAqgcBSQdCKcd//AA8QD7IAAgARAA+x8AHwEQAPseAB4BEAD7HQAdARAA+xwAHAEQAPsbABsBEAD7GgAaARAA+xkAGQEQAPsYABgBEAD7FwAXARAA+xYAFgEQAPsVABUBEAD7FAAUARAA+xMAEwEQAPsSABIBEAD7EQARARAA+xAAEAiAAP/wAPEA+0AAQAEQAPtAAEABEAD7PgA+ARAA+zwAPAEQAPs6ADoBEAD7OAA4ARAA+zYANgEQAPs0ADQBEAD7MgAyARAA+zAAMAEQAPsuAC4BEAD7LAAsARAA+yoAKgEQAPsoACgBEAD7JgAmARAA+yQAJAEQAPsiACIBEAD7IAAgCIAA/4QM8ADxAfSsHAXSDQjsDf8Fvh0IxR3/8APxAvQHD/AD8QL0Gw8B0x0E2h3/8ADxBPQEGPAA8QT0FxgC6B0F7x3/8QHxBPTLGfAB8QT01xn///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8=";
// AudioWorkletGlobalScope does not guarantee Window/Worker atob().
function decodeRomBase64(s){
 const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 let bits=0,nbits=0,n=0;
 const result=new Uint8Array(Math.floor(s.length*3/4));
 for(let i=0;i<s.length;i++){
  const c=s.charAt(i);
  if(c==='=')break;
  const v=chars.indexOf(c);
  if(v<0)continue;
  bits=(bits<<6)|v;nbits+=6;
  if(nbits>=8){nbits-=8;result[n++]=(bits>>>nbits)&255;}
 }
 return result.subarray(0,n);
}
// Z80 instruction T-state timing. The earlier average (7 per opcode)
// slowed down 4-T-state instructions, stretching music and creating echoes.
const Z80_LOW_T=[
 4,10,7,6,4,4,7,4, 4,11,7,6,4,4,7,4,
 8,10,7,6,4,4,7,4, 12,11,7,6,4,4,7,4,
 7,10,16,6,4,4,7,4, 7,11,16,6,4,4,7,4,
 7,10,13,6,11,11,10,4, 7,11,13,6,4,4,7,4
];
const Z80_HIGH_T=[
 5,10,10,10,10,11,7,11, 5,10,10,8,10,17,7,11,
 5,10,10,11,10,11,7,11, 5,4,10,11,10,4,7,11,
 5,10,10,19,10,11,7,11, 5,4,10,4,10,8,7,11,
 5,10,10,4,10,11,7,11, 5,6,10,4,10,4,7,11
];
function z80InstructionCycles(mem,pc,nextPc,flags){
 const op=mem[pc&65535],a=pc&65535;
 let cycles;
 if(op<0x40)cycles=Z80_LOW_T[op];
 else if(op<0x80)cycles=(op===0x76)?4:((op&7)===6||((op>>3)&7)===6?7:4);
 else if(op<0xc0)cycles=(op&7)===6?7:4;
 else cycles=Z80_HIGH_T[op-0xc0];
 if(op===0x10)return nextPc===((a+2)&65535)?8:13; // DJNZ
 if(op===0x20||op===0x28||op===0x30||op===0x38)
  return nextPc===((a+2)&65535)?7:12; // JR cc
 if(op>=0xc0&&(op&0xc7)===0xc0){
  const cond=(op>>3)&7;
  const f=flags;
  const valid=[!(f&0x40),!!(f&0x40),!(f&1),!!(f&1),!(f&4),!!(f&4),!(f&0x80),!!(f&0x80)][cond];
  return valid?11:5; // RET cc
 }
 if(op>=0xc4&&(op&0xc7)===0xc4){
  const cond=(op>>3)&7;
  const f=flags;
  const valid=[!(f&0x40),!!(f&0x40),!(f&1),!!(f&1),!(f&4),!!(f&4),!(f&0x80),!!(f&0x80)][cond];
  return valid?17:10; // CALL cc
 }
 if(op===0xcb){
  const cb=mem[(a+1)&65535],r=cb&7;
  return r!==6?8:((cb&0xc0)===0x40?12:15);
 }
 if(op===0xed){
  const ed=mem[(a+1)&65535],x=ed>>6,z=ed&7,y=(ed>>3)&7;
  if(x===1)return [12,12,15,20,8,14,8,9][z];
  if(x===2&&y>=4&&z<=3)return nextPc===a?21:16;
  return 8;
 }
 if(op===0xdd||op===0xfd){
  const indexed=mem[(a+1)&65535];
  if(indexed===0xcb)return 23; // DD/FD CB d op
  let t;
  if(indexed<0x40)t=Z80_LOW_T[indexed];
  else if(indexed<0x80)t=indexed===0x76?4:((indexed&7)===6||((indexed>>3)&7)===6?7:4);
  else if(indexed<0xc0)t=(indexed&7)===6?7:4;
  else t=Z80_HIGH_T[indexed-0xc0];
  if(indexed===0x34||indexed===0x35)return 23;
  if(indexed===0x36)return 19;
  if(indexed===0x22||indexed===0x2a)return 20;
  if(indexed===0xe3)return 23;
  if(indexed===0xe9)return 8;
  if(indexed===0xf9)return 10;
  if((indexed>=0x40&&indexed<0xc0)&&
   ((indexed&7)===6||((indexed>>3)&7)===6))return 19;
  return t+4;
 }
 return cycles;
}
class PinballSoundProcessor extends AudioWorkletProcessor{
 constructor(){
  super();
  this.mem=new Uint8Array(65536);
  const binary=decodeRomBase64(PB_SOUND_ROM);
  this.mem.set(binary);
  this.soundLatch=0;this.commands=0;
  this.ay=[new PBAudioAY(sampleRate),new PBAudioAY(sampleRate),new PBAudioAY(sampleRate)];
  this.ctc=[{control:0,constant:0,pendingConst:false,counter:false,prescale:16,enabled:false,cycles:0},{control:0,constant:0,pendingConst:false,counter:false,prescale:16,enabled:false,cycles:0},{},{}];
  this.ctcBase=0;
  this.pending=[0,0,0,0];this.inService=-1;
  this.waitingCommand=null;this.readyForCommands=false;
  this.cpu=new AudioZ80(this.mem,{sp:0xffff},{
    readLatch:()=>this.soundLatch,
    ioOut:(port,val)=>this.out(port,val),
    ioIn:(port)=>this.input(port),
    irqAck:()=>{}
  });
  this.cyclesPerSample=3000000/sampleRate;
  this.debt=0;this.frames=0;this.lastRMS=0;this.dc=0;
  this.port.onmessage=(e)=>{
    const m=e.data;if(m?.type==='command'){
      this.soundLatch=m.command&255;this.commands++;
      // Cold boot: the real sound Z80 spends ~0.27s initialising its CTC.
      // An immediately triggered command before this point is LOST.
      if(!this.readyForCommands)this.waitingCommand=this.soundLatch;
      else this.trigger0();
    }
    else if(m?.type==='volume')this.volume=+m.value;
    else if(m?.type==='debug')this.port.postMessage({type:'debug',frames:this.frames,pc:this.cpu.pc,sp:this.cpu.sp,iff:this.cpu.iff,commands:this.commands,ports:this.ctc.map(c=>({control:c.control,constant:c.constant})),pending:this.pending,readyForCommands:this.readyForCommands,waitingCommand:this.waitingCommand,ay:this.ay.map(a=>[...a.reg]),rms:this.lastRMS});
  };
  this.volume=.78;
 }
 out(port,val){
  port&=255;val&=255;
  if(port<4){
   const c=this.ctc[port];if(!c)return;
   if(c.pendingConst){
    c.constant=val||256;c.pendingConst=false;
    c.cycles=0;c.enabled=true;
   }else if((val&1)===0){
    // CTC vector base is written to channel 0, low 3 bits are ignored.
    if(port===0)this.ctcBase=val&0xf8;
   }else{
    c.control=val;c.counter=!!(val&64);c.prescale=(val&32)?256:16;
    c.pendingConst=!!(val&4);c.enabled=false;c.cycles=0;
   }
   return;
  }
  if(port===0x10||port===0x11)this.ay[0].write(port,val);
  else if(port===0x20||port===0x21)this.ay[1].write(port,val);
  else if(port===0x30||port===0x31)this.ay[2].write(port,val);
 }
 input(port){port&=255;return port<4?0xff:0xff;}
 trigger0(){
  const c=this.ctc[0];
  if(c?.enabled&&c.counter){
   c.cycles++;
   if(c.cycles>=c.constant){c.cycles=0;if(c.control&128)this.pending[0]=1;}
  }
 }
 timer(cycles){
  for(let ch=0;ch<2;ch++){
   const c=this.ctc[ch];if(!c.enabled||c.counter)continue;
   c.cycles+=cycles;
   const period=c.prescale*c.constant;
   if(c.cycles>=period){
    const n=Math.floor(c.cycles/period);c.cycles-=n*period;
    if(c.control&128)this.pending[ch]=1; // Z80 CTC latches an IRQ; it does not queue echoing repeats
   }
  }
 }
 runCPU(){
  this.debt+=this.cyclesPerSample;
  let maxSteps=80;
  while(this.debt>0&&maxSteps-->0){
   if(!this.readyForCommands && this.ctc[0].enabled && this.ctc[1].enabled && this.cpu.iff){
    this.readyForCommands=true;
    if(this.waitingCommand!==null){
      this.soundLatch=this.waitingCommand;
      this.waitingCommand=null;
      this.trigger0();
    }
   }
   if(this.cpu.iff){
    for(let ch=0;ch<2;ch++){
     if(this.pending[ch]>0&&(this.inService<0||ch<this.inService)){
      if(this.cpu.irq((this.ctcBase+2*ch)&255)){
       this.pending[ch]--;
       this.inService=ch;
      }
      break;
     }
    }
   }
   const pc=this.cpu.pc,op=this.mem[pc],flags=this.cpu.f;
   if(!this.cpu.halt)this.cpu.step();
   const cycles=this.cpu.halt&&pc===this.cpu.pc?4:
    z80InstructionCycles(this.mem,pc,this.cpu.pc,flags);
   if(op===0xed&&this.mem[(pc+1)&65535]===0x4d)this.inService=-1;
   this.timer(cycles);
   this.debt-=cycles;
  }
 }
 process(inputs,outputs){
  const out=outputs[0],left=out[0],right=out[1];
  let peak=0;
  for(let i=0;i<left.length;i++){
   this.runCPU();
   const v=this.ay[0].sample()+this.ay[1].sample()+this.ay[2].sample();
   // AC-coupled mono output, similar to arcade cabinet speaker.
   const x=v/9;this.dc+=.0005*(x-this.dc);
   const outSample=Math.max(-1,Math.min(1,(x-this.dc)*this.volume*3.2));
   left[i]=outSample;if(right)right[i]=outSample;
   peak+=outSample*outSample;
  }
  this.frames+=left.length;
  this.lastRMS=Math.sqrt(peak/left.length);
  return true;
 }
}
registerProcessor('pb-original-psg',PinballSoundProcessor);

