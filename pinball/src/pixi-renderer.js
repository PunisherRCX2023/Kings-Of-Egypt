/* Pinball Action — PixiJS 8.14.3 WebGL display adapter.
 * Original board coordinates, draw order and rotation are unchanged. */
(function(){
 'use strict';
 const sources=['./vendor/pixi.min.js','https://cdn.jsdelivr.net/npm/pixi.js@8.14.3/dist/pixi.min.js'];
 // V9.08: tries the local copy first (offline play), then the CDN.
 const loadOne=src=>new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=src;script.async=true;
  const timeout=setTimeout(()=>{script.remove();reject(new Error('PixiJS timeout '+src));},8000);
  script.onload=()=>{clearTimeout(timeout);window.PIXI?resolve(window.PIXI):reject(new Error('PixiJS missing'));};
  script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('PixiJS failed '+src));};
  document.head.appendChild(script);
 });
 const load=async()=>{
  if(window.PIXI)return window.PIXI;
  let last;for(const src of sources){try{return await loadOne(src);}catch(e){last=e;}}
  throw last;
 };
 class PinballPixi {
  constructor(original){
   this.original=original;this.ready=false;this.enabled=false;
   this.images=new Map();this.pending=[];this.pool=[];
   this.scale=4;this.status='loading';this.lastScene=null;this.stats={drawn:0,reused:0,uploads:0};
  }
  async init(onReady,onFailure){
   try{
    const P=this.P=await load();
    const app=this.app=new P.Application();
    await app.init({width:224*this.scale,height:256*this.scale,preference:'webgl',antialias:true,autoStart:false,sharedTicker:false,backgroundColor:0,backgroundAlpha:1,preserveDrawingBuffer:true});
    app.stop();
    const root=this.root=new P.Container();
    root.position.set(240*this.scale,0);root.rotation=Math.PI/2;root.scale.set(this.scale);
    app.stage.addChild(root);
    this.back=new P.Container();this.motion=new P.Container();this.front=new P.Container();
    root.addChild(this.back,this.motion,this.front);
    for(const layer of [this.back,this.front]){
     layer.addChild(new P.Sprite(P.Texture.WHITE),new P.Sprite(P.Texture.WHITE));
    }
    const view=app.canvas;view.id='game-pixi';view.setAttribute('aria-hidden','true');
    view.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;visibility:hidden;pointer-events:none;image-rendering:auto';
    this.original.parentElement.style.position='relative';
    this.original.parentElement.appendChild(view);
    view.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;this.status='context-lost';this.show(false);onFailure?.();});
    view.addEventListener('webglcontextrestored',()=>{this.lastScene=null;this.ready=true;this.status='webgl';onReady?.();});
    this.ready=true;this.status='webgl';onReady?.();
   }catch(e){this.status='canvas-fallback';this.ready=false;this.show(false);console.warn('Pinball Pixi fallback',e);onFailure?.();}
  }
  show(on){
   if(!on)this.lastScene=null;
   this.enabled=!!on&&this.ready;
   if(this.app?.canvas)this.app.canvas.style.visibility=this.enabled?'visible':'hidden';
   this.original.style.visibility=this.enabled?'hidden':'visible';
   this.original.parentElement.dataset.renderer=this.enabled?'pixi-webgl':'canvas2d';
  }
  texture(image){
   let t=this.images.get(image);
   if(!t){t=this.P.Texture.from(image);t.source.scaleMode='linear';this.images.set(image,t);}
   return t;
  }
  invalidateSprites(only=null){
   for(const [canvas,t] of this.images){
    if(canvas===this.boardImage||canvas===this.frontImage||(only&&!only.has(canvas)))continue;
    this.pending.push(t);this.images.delete(canvas);
   }
  }
  layers(board,front,bgChanged,fgChanged){
   this.boardImage=board;this.frontImage=front;
   const b=this.texture(board),f=this.texture(front);
   if(bgChanged){b.source.update();this.stats.uploads++;}if(fgChanged){f.source.update();this.stats.uploads++;}
   for(const [layer,t] of [[this.back,b],[this.front,f]])for(const s of layer.children){
    s.texture=t;s.scale.set(256/t.width,256/t.height);
   }
  }
  draw(board,front,bgChanged,fgChanged,scroll,commands,getArt){
   // Resolve art before testing for equality: palette and resized ball
   // variants can change even when hardware sprite coordinates do not.
   const next=commands.map(o=>({o,image:getArt(o)}));
   const prev=this.lastScene;
   const same=this.enabled&&!bgChanged&&!fgChanged&&prev&&prev.board===board&&prev.front===front&&prev.scroll===scroll&&prev.items.length===next.length&&next.every((q,i)=>{
    const a=q.o,b=prev.items[i];
    return q.image===b.image&&a.xx===b.xx&&a.yy===b.yy&&a.size===b.size&&a.flipX===b.flipX&&a.flipY===b.flipY;
   });
   if(same){this.stats.reused++;this.flushPending();return;}
   this.layers(board,front,bgChanged,fgChanged);
   for(const layer of [this.back,this.front]){
    layer.children[0].position.set(-scroll,0);
    layer.children[1].position.set(256-scroll,0);layer.children[1].visible=scroll!==0;
   }
   for(let i=0;i<commands.length;i++){
    const o=commands[i];let s=this.pool[i];
    if(!s){s=new this.P.Sprite(this.P.Texture.WHITE);this.pool.push(s);this.motion.addChild(s);}
    const t=this.texture(next[i].image);s.texture=t;s.visible=true;
    s.position.set(o.xx+(o.flipX?o.size:0),o.yy+(o.flipY?o.size:0));
    s.scale.set((o.flipX?-1:1)*o.size/t.width,(o.flipY?-1:1)*o.size/t.height);
   }
   for(let i=commands.length;i<this.pool.length;i++){this.pool[i].visible=false;this.pool[i].texture=this.P.Texture.WHITE;}
   this.app.render();this.stats.drawn++;
   this.lastScene={board,front,scroll,items:next.map(({o,image})=>({image,xx:o.xx,yy:o.yy,size:o.size,flipX:o.flipX,flipY:o.flipY}))};
   this.flushPending();this.show(true);
  }
  flushPending(){
   // A texture evicted from CPU cache during this frame may still be
   // attached to a visible sprite. Retire only when no sprite uses it.
   const live=new Set(this.pool.filter(s=>s.visible).map(s=>s.texture)),keep=[];
   for(const t of this.pending){if(live.has(t))keep.push(t);else t.destroy(true);}
   this.pending=keep;
  }
  image(){return this.enabled?this.app.canvas.toDataURL():this.original.toDataURL();}
 }
 window.PinballPixi=PinballPixi;
})();
