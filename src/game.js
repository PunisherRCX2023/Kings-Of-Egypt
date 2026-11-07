

  // Áudio sintetizado localmente: começa ligado em cada nova sessão.
  let soundEnabled = true;
  let audioContext = null;
  let bonusBookCount = 0;
  let bonusClosePending = false;
  let rouletteTimer = null;

  function getAudioContext() {
    if (!soundEnabled) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function tone(freq, duration, type='sine', volume=0.045, delay=0) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + duration + 0.03);
  }

  function playReelRoll() {
    tone(92, .16, 'triangle', .018);
    tone(68, .22, 'sawtooth', .009, .05);
  }
  function playReelStop(index) {
    tone(150 + index * 18, .09, 'triangle', .035);
    tone(78, .07, 'sine', .025, .025);
  }
  function playBookCue(count) {
    if (count === 1) {
      tone(660,.16,'sine',.045); tone(880,.22,'sine',.035,.13);
    } else if (count === 2) {
      tone(740,.18,'triangle',.05); tone(990,.22,'triangle',.05,.12);
      tone(1180,.28,'sine',.04,.27);
    } else if (count >= 3) {
      tone(880,.28,'sine',.07); tone(1175,.34,'sine',.065,.12);
      tone(1568,.55,'sine',.07,.28);
    }
  }
  // ===== Áudio do jogo (ficheiros em assets/sounds) =====
  const SND = { music: 'assets/sounds/backgroundmusic.mp3', click: 'assets/sounds/click.mp3', start: 'assets/sounds/bonus_start.mp3', end: 'assets/sounds/bonus_end.mp3' };
  const MUSIC_VOL = 0.32;
  const music = new Audio(SND.music);
  music.loop = true; music.preload = 'auto'; music.volume = MUSIC_VOL;
  let musicWanted = false, duckTimer = null;
  const clickPool = [0, 1, 2, 3].map(() => { const a = new Audio(SND.click); a.preload = 'auto'; a.volume = 0.5; return a; });
  let clickIdx = 0;
  function syncMusic() {
    if (soundEnabled && musicWanted && !document.hidden) { const p = music.play(); if (p && p.catch) p.catch(() => {}); }
    else music.pause();
  }
  function playClick() {
    if (!soundEnabled) return;
    const a = clickPool[clickIdx++ % clickPool.length];
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  function playFile(src, vol) {
    if (!soundEnabled) return null;
    const a = new Audio(src); a.volume = vol; const p = a.play(); if (p && p.catch) p.catch(() => {});
    return a;
  }
  // baixa a música enquanto toca o som do bónus e volta ao normal no fim
  function duckMusic(ms) {
    music.volume = MUSIC_VOL * 0.25;
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = setTimeout(() => { music.volume = MUSIC_VOL; }, ms);
  }
  // Elementos próprios para os sons do bónus, "desbloqueados" no primeiro toque (o iOS só deixa tocar áudio já autorizado por um toque)
  const startEl = new Audio(SND.start), endEl = new Audio(SND.end);
  [startEl, endEl].forEach(a => { a.preload = 'auto'; a.volume = 0.9; });
  const bufCache = {};
  function playBuf(src, vol) {   // alternativa via Web Audio
    const ctx = getAudioContext(); if (!ctx) return;
    const go = buf => { const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(ctx.destination); s.start(0); };
    if (bufCache[src]) return go(bufCache[src]);
    fetch(src).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { bufCache[src] = buf; go(buf); }).catch(() => {});
  }
  function playEl(a) {
    if (!soundEnabled) return false;
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => playBuf(a.src, 0.9)); } catch (e) { playBuf(a.src, 0.9); }
    return true;
  }
  function unlockAudio() {
    [startEl, endEl].concat(clickPool).forEach(a => {
      a.muted = true; const p = a.play();
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
    });
  }
  function playBonusStart() { if (playEl(startEl)) duckMusic(2500); }
  function playBonusEnd() { if (playEl(endEl)) duckMusic(4500); }
  function showWinPopup(amount) {
    const el = document.getElementById('winPopup');
    el.textContent = '+' + amount.toFixed(2).replace('.', ',') + ' €';
    el.style.fontSize = el.textContent.length > 9 ? 'calc(var(--u) * 84)' : '';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  document.addEventListener('visibilitychange', syncMusic);
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('button, [onclick], .tab-btn, .admin-sub-btn, .close-btn')) playClick();
  }, true);

  const SVG_SND_ON = '<svg viewBox="0 0 64 64"><path d="M8 24h11l14-11v38L19 40H8z" fill="#fff"/><path d="M42 22q8 10 0 20M48 15q14 17 0 34" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>';
  const SVG_SND_OFF = '<svg viewBox="0 0 64 64"><path d="M8 24h11l14-11v38L19 40H8z" fill="#fff"/><path d="M42 24l16 16M58 24 42 40" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>';
  function soundFace() {
    const b = document.getElementById('soundToggle');
    b.innerHTML = (soundEnabled ? SVG_SND_ON : SVG_SND_OFF) + '<span>Som</span>';
    b.classList.toggle('muted', !soundEnabled);
    b.setAttribute('aria-label', soundEnabled ? 'Desligar som' : 'Ligar som');
  }
  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundFace(); syncMusic();
    if (soundEnabled) getAudioContext();
  }

  // ===== Caixas Valor da Moeda / Valor por Linha (botões − e +) =====
  function stepInput(id, d) {
    if (isSpinning || inFreeSpins) return;
    const el = document.getElementById(id);
    el.value = Math.max(+el.min, Math.min(+el.max, +el.value + d));
    updateBetControls();
  }
  function stepCoinValue(d) { stepInput('inputCoinValueIndex', d); }
  function stepCoinsPerLine(d) { stepInput('inputCoinsPerLine', d); }
  function syncBetBoxes() {
    document.getElementById('valCoinBox').innerText = getCoinValue().toFixed(2).replace('.', ',') + ' €';
    document.getElementById('valLineBox').innerText = getCoinsPerLine();
    const bet = getTotalBetCash();
    document.getElementById('bonusBuyPill').innerText = (bet * 10).toFixed(2) + ' €';
    document.getElementById('bonusBuyContainer').classList.toggle('unavailable', bet < 1);
  }
  function setSpinFace(mode) {
    const el = document.getElementById('spinBtn');
    el.innerHTML = mode === 'stop'
      ? '<svg viewBox="0 0 64 64"><rect x="16" y="16" width="32" height="32" rx="5" fill="#fff"/></svg><span>PARAR</span>'
      : SPIN_FACE_PLAY;
  }
  // ===== Areia a passar pelo cenário (canvas leve; pára quando o separador não está visível) =====
  function startSand(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d'); let w = 0, h = 0, raf = 0, last = 0, P = [], W = [];
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth || 300; h = canvas.clientHeight || 300;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(45, Math.min(120, Math.round(w * h / 7500)));
      P = []; for (let i = 0; i < count; i++) P.push({ x: Math.random() * w, y: Math.random() * h, r: .6 + Math.random() * 1.9, vx: 35 + Math.random() * 90, vy: -4 + Math.random() * 12, a: .18 + Math.random() * .5, ph: Math.random() * 6.28 });
      W = []; for (let i = 0; i < 6; i++) W.push({ y: Math.random() * h, l: w * (.5 + Math.random() * .6), th: 26 + Math.random() * 60, v: 25 + Math.random() * 45, x: Math.random() * (w + 400) - 200, a: .09 + Math.random() * .09 });
    }
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = t; return; }
      const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
      ctx.clearRect(0, 0, w, h);
      W.forEach(b => {   // faixas de poeira / vento
        b.x += b.v * dt; if (b.x > w + 50) { b.x = -b.l; b.y = Math.random() * h; }
        const g = ctx.createLinearGradient(b.x, 0, b.x + b.l, 0);
        g.addColorStop(0, 'rgba(240,205,140,0)'); g.addColorStop(.5, 'rgba(240,205,140,' + b.a + ')'); g.addColorStop(1, 'rgba(240,205,140,0)');
        ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.l, b.th);
      });
      ctx.fillStyle = '#f3d79a';
      P.forEach(p => {   // grãos de areia
        p.x += p.vx * dt; p.y += p.vy * dt + Math.sin(t / 700 + p.ph) * .18;
        if (p.x > w + 12) { p.x = -12; p.y = Math.random() * h; }
        if (p.y < -12) p.y = h + 12; if (p.y > h + 12) p.y = -12;
        ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = p.a * .3; ctx.fillRect(p.x - p.vx * .07, p.y - p.r * .35, p.vx * .07, p.r * .7);
      });
      ctx.globalAlpha = 1;
    }
    resize(); window.addEventListener('resize', resize); raf = requestAnimationFrame(frame);
    return function stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }

  // ===== Guardar e restaurar o jogo (fica guardado no navegador, mesmo que o jogo seja desligado) =====
  const SAVE_KEY = 'kingsOfEgypt.save';
  const SAVE_INPUTS = ['inputRtp', 'inputVolatility', 'inputBonusProb', 'inputRetriggerProb', 'inputSmallWin', 'inputReserve', 'inputTease', 'inputTeaseBonus', 'inputCoinValueIndex', 'inputCoinsPerLine'];
  let saveBlocked = true;          // só passa a false depois de restaurar (evita gravar o estado inicial por cima do guardado)
  let pendingSpin = null;          // giro em curso: a grelha já decidida fica guardada, para o resultado nunca se perder
  let pendingExpandChoice = null;  // símbolo expansivo já sorteado
  let restoredState = null;
  const logOut = a => a.map(x => ({ t: x.t.getTime(), v: x.v }));
  const logIn = a => (a || []).map(x => ({ t: new Date(x.t), v: Number(x.v) || 0 }));
  function gameSnapshot() {
    const inputs = {}; SAVE_INPUTS.forEach(id => { const el = document.getElementById(id); if (el) inputs[id] = el.value; });
    return {
      v: 1, savedAt: Date.now(), version: (typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : ''),
      balance, totalBetStat, totalPayoutsStat, totalDepStat, totalWithStat, vaultTopUps, dryStreak,
      depositsHistory, withdrawalsHistory, depositsLog: logOut(depositsLog), withdrawalsLog: logOut(withdrawalsLog), vaultTopUpLog: logOut(vaultTopUpLog),
      adminPassword, depositPassword, withdrawPassword, collabPercentage, isTurbo, soundEnabled, selectedAutoSpinsOption,
      inputs, grid: gridState,
      bonus: { inFreeSpins, freeSpinsLeft, bonusTotalWinAccumulated, expandingSymbol, pendingFreeSpins, pendingExpandChoice,
        roulette: document.getElementById('bonus-roulette-modal').classList.contains('active'), celebration: bonusClosePending },
      pendingSpin
    };
  }
  function saveGame() {
    if (saveBlocked) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(gameSnapshot())); } catch (e) {}
  }
  function renderGrid(grid) {
    for (let r = 0; r < 5; r++) {
      const strip = document.getElementById('strip-' + r); strip.innerHTML = '';
      grid[r].forEach(sym => {
        const div = document.createElement('div'); div.className = 'symbol';
        if (sym === '📖') div.classList.add('book-glow');
        div.innerHTML = symHTML(sym); div.dataset.sym = sym; strip.appendChild(div);
      });
    }
  }
  const validGrid = g => Array.isArray(g) && g.length === 5 && g.every(r => Array.isArray(r) && r.length === 3 && r.every(s => IMG[s]));
  function restoreGame() {
    let raw = null; try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) return false;
    let s; try { s = JSON.parse(raw); } catch (e) { return false; }
    if (!s || s.v !== 1) return false;
    const num = (x, d) => (typeof x === 'number' && isFinite(x)) ? x : d;
    balance = num(s.balance, 0); totalBetStat = num(s.totalBetStat, 0); totalPayoutsStat = num(s.totalPayoutsStat, 0);
    totalDepStat = num(s.totalDepStat, 0); totalWithStat = num(s.totalWithStat, 0); vaultTopUps = num(s.vaultTopUps, 0); dryStreak = num(s.dryStreak, 0);
    depositsHistory = Array.isArray(s.depositsHistory) ? s.depositsHistory : []; withdrawalsHistory = Array.isArray(s.withdrawalsHistory) ? s.withdrawalsHistory : [];
    [[depositsLog, s.depositsLog], [withdrawalsLog, s.withdrawalsLog], [vaultTopUpLog, s.vaultTopUpLog]].forEach(p => { p[0].length = 0; logIn(p[1]).forEach(x => p[0].push(x)); });
    if (typeof s.adminPassword === 'string') adminPassword = s.adminPassword;
    if (typeof s.depositPassword === 'string') depositPassword = s.depositPassword;
    if (typeof s.withdrawPassword === 'string') withdrawPassword = s.withdrawPassword;
    selectedAutoSpinsOption = num(s.selectedAutoSpinsOption, 10);
    // definições (sliders) -> dispara o evento "input" para atualizar também os textos de cada slider
    Object.keys(s.inputs || {}).forEach(id => { const el = document.getElementById(id); if (el) { el.value = s.inputs[id]; el.dispatchEvent(new Event('input')); } });
    updateCollabCommission(num(s.collabPercentage, 20));
    if (s.isTurbo && !isTurbo) toggleTurbo();
    if (s.soundEnabled === false && soundEnabled) toggleSound();
    if (validGrid(s.grid)) { gridState = s.grid; renderGrid(gridState); }
    const b = s.bonus || {};
    pendingFreeSpins = num(b.pendingFreeSpins, 8); pendingExpandChoice = b.pendingExpandChoice || null;
    if (b.inFreeSpins) {
      inFreeSpins = true; freeSpinsLeft = num(b.freeSpinsLeft, 0); bonusTotalWinAccumulated = num(b.bonusTotalWinAccumulated, 0); expandingSymbol = b.expandingSymbol || '';
      if (expandingSymbol) { document.getElementById('expSymbolIcon').innerHTML = symHTML(expandingSymbol); document.getElementById('expandingSymbolBanner').style.display = 'block'; }
      disableBetControls(true); document.getElementById('spinBtn').classList.add('disabled');
      document.getElementById('statusBanner').innerText = 'FREE SPINS: ' + freeSpinsLeft + ' RESTANTES';
      document.getElementById('winDisplay').innerText = bonusTotalWinAccumulated.toFixed(2) + ' €';
    }
    restoredState = { pendingSpin: validGrid(s.pendingSpin && s.pendingSpin.grid) ? s.pendingSpin : null, roulette: !!b.roulette, celebration: !!b.celebration };
    updateBetControls(); updateUI();
    return true;
  }
  // Depois do "Tocar para jogar": continua exatamente onde o jogo ficou (giro, roleta, bónus ou fim de bónus)
  function resumeGame() {
    const st = restoredState; restoredState = null; if (!st) return;
    if (st.pendingSpin) {
      gridState = st.pendingSpin.grid; renderGrid(gridState);
      isSpinning = true; disableBetControls(true); document.getElementById('spinBtn').classList.add('disabled');
      const sc = gridState.filter(r => r.includes('📖')).length;
      setTimeout(() => finishSpinSaved(sc), 400); return;
    }
    if (st.celebration) {
      document.getElementById('celebrationTotalWin').innerText = bonusTotalWinAccumulated.toFixed(2) + ' €';
      document.getElementById('bonus-celebration-modal').classList.add('active'); bonusClosePending = true; return;
    }
    if (st.roulette) { openBonusRoulette(); return; }
    if (inFreeSpins && freeSpinsLeft > 0) setTimeout(() => triggerSpin(true), 800);
  }
  function finishSpinSaved(scatters) {   // o resultado é aplicado de uma só vez e só depois o jogo é guardado
    saveBlocked = true;
    try { finishSpin(scatters); } finally { saveBlocked = false; }
    pendingSpin = null; saveGame();
  }
  // Backup em ficheiro (técnico): exportar, importar e apagar os dados guardados
  function exportBackup() {
    downloadText('kings_of_egypt_backup_' + stamp() + '.json', JSON.stringify(gameSnapshot(), null, 1));
  }
  function importBackup(input) {
    const f = input.files && input.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = function () {
      let s; try { s = JSON.parse(String(rd.result).replace(/^\ufeff/, '')); } catch (e) { alert('Ficheiro de backup inválido!'); return; }
      if (!s || s.v !== 1 || typeof s.balance !== 'number') { alert('Ficheiro de backup inválido!'); return; }
      if (!confirm('Restaurar este backup? Os dados atuais serão substituídos.')) return;
      saveBlocked = true; try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { alert('Não foi possível guardar o backup.'); return; }
      location.reload();
    };
    rd.readAsText(f); input.value = '';
  }
  function clearSavedData() {
    if (!confirm('Apagar TODOS os dados guardados (saldo, histórico, cofre e definições)? Esta ação não pode ser desfeita.')) return;
    saveBlocked = true; try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    location.reload();
  }


  const COIN_VALUES = [0.01, 0.02, 0.03, 0.04, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.50, 2.00, 2.50];

  const PAYLINES = [
    [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
    [1,0,0,0,1], [1,2,2,2,1], [0,0,1,2,2], [2,2,1,0,0], [1,0,1,2,1]
  ];

  const PAY_DATA = [
    { icon: '📖', name: 'Pirâmide', high: true, pays: { 5: 5000, 4: 1000, 3: 100, 2: 10 } },
    { icon: '👑', name: 'Rá', high: true, pays: { 5: 5000, 4: 1000, 3: 100, 2: 10 } },
    { icon: '🐺', name: 'Anúbis', high: true, pays: { 5: 1600, 4: 300, 3: 30, 2: 5 } },
    { icon: '🦅', name: 'Hórus', high: true, pays: { 5: 600, 4: 80, 3: 20, 2: 5 } },
    { icon: '🪲', name: 'Osiris', high: true, pays: { 5: 600, 4: 80, 3: 20, 2: 5 } },
    { icon: 'A', name: 'Ás', high: false, pays: { 5: 120, 4: 30, 3: 5 } },
    { icon: '🤴', name: 'Rei', high: false, pays: { 5: 120, 4: 30, 3: 5 } },
    { icon: 'Q', name: 'Dama', high: false, pays: { 5: 80, 4: 20, 3: 5 } },
    { icon: 'J', name: 'Valete', high: false, pays: { 5: 80, 4: 20, 3: 5 } },
    { icon: '10', name: 'Dez', high: false, pays: { 5: 80, 4: 20, 3: 5 } }
  ];

  const SYMBOLS = PAY_DATA.map(p => p.icon);
  const HIGH_SYMBOLS = PAY_DATA.filter(p => p.high).map(p => p.icon);

  // Imagens do jogo (pasta assets/img). A chave lógica de cada símbolo mantém-se.
  const IMG = {
    '📖': 'assets/img/scatter.png', '👑': 'assets/img/ra.png', '🐺': 'assets/img/anubis.png', '🦅': 'assets/img/horus.png', '🪲': 'assets/img/osiris.png',
    'A': 'assets/img/A.png', '🤴': 'assets/img/K.png', 'Q': 'assets/img/Q.png', 'J': 'assets/img/J.png', '10': 'assets/img/10.png'
  };
  const IMG_UI = ['assets/img/background.jpg', 'assets/img/title.png', 'assets/img/slot.png', 'assets/img/button_play.png', 'assets/img/box_value.png', 'assets/img/loading_title.png',
    'assets/img/eye-of-horus.svg', 'assets/img/scarab.svg', 'assets/img/ankh.svg', 'assets/img/djed-pillar.svg', 'assets/img/feather-maat.svg'];
  function symHTML(sym) { return '<img class="si" src="' + IMG[sym] + '" alt="" draggable="false">'; }
  function initSymbolSlots() {
    document.getElementById('expSymbolIcon').innerHTML = symHTML('📖');
    document.getElementById('rouletteDisplaySymbol').innerHTML = symHTML('📖');
    document.querySelector('.bb-icon').innerHTML = symHTML('📖');
  }


  let balance = 0.00;
  let totalBetStat = 0.00;
  let totalPayoutsStat = 0.00;
  let totalDepStat = 0.00;
  let totalWithStat = 0.00;
  
  let depositsHistory = [];
  let withdrawalsHistory = [];

  let adminPassword = "admin123";
  let depositPassword = "dep123";
  let withdrawPassword = "lev123";
  let collabPercentage = 20;

  let isSpinning = false;
  let isTurbo = false;
  let inFreeSpins = false;
  let freeSpinsLeft = 0;
  let bonusTotalWinAccumulated = 0;
  let expandingSymbol = '';
  let gridState = [[],[],[],[],[]];

  let autoSpinCount = 0;
  let autoSpinActive = false;
  let selectedAutoSpinsOption = 10;

  function toggleTurbo() {
    isTurbo = !isTurbo;
    const btn = document.getElementById('turboBtn');
    if(isTurbo) {
      btn.classList.add('active');
      document.documentElement.style.setProperty('--cascade-speed', '0.18s');
    } else {
      btn.classList.remove('active');
      document.documentElement.style.setProperty('--cascade-speed', '0.35s');
    }
  }


  // Regra original do cofre mantida: só surgem Pirâmides com pelo menos 100€ retidos.
  const VAULT_MIN_FOR_BOOKS = 100;

  // Probabilidade REAL (por tambor) de aparecer 1 Pirâmide. É o valor configurado no painel de administração.
  function getScatterReelProb() {
    const vault = getVault();
    if (vault < VAULT_MIN_FOR_BOOKS) return 0;
    const id = inFreeSpins ? 'inputRetriggerProb' : 'inputBonusProb';
    return Number(document.getElementById(id).value) / 100;
  }
  // P(3 ou mais tambores com Pirâmide) em 5 tambores independentes (binomial) = probabilidade de bónus/retrigger por spin.
  function probAtLeast3(p) {
    const q = 1 - p;
    return 10*p*p*p*q*q + 5*p*p*p*p*q + p*p*p*p*p;
  }

  // ===== Volatilidade (Muito Baixo … Muito Alto) =====
  // hi = peso de cada símbolo alto (os baixos pesam ~10); cons = multiplicador dos prémios de consolação;
  // rr = probabilidade de refazer uma jogada com prémio pequeno (menos prémios pequenos = mais secas e cofre maior).
  const VOL_LEVELS = [
    { n: 'Muito Baixo', hi: 2.8, cons: 1.5,  rr: 0 },
    { n: 'Baixo',       hi: 3.5, cons: 1.2,  rr: 0 },
    { n: 'Médio',       hi: 4.2, cons: 1.0,  rr: 0.10 },
    { n: 'Alto',        hi: 5.2, cons: 0.75, rr: 0.25 },
    { n: 'Muito Alto',  hi: 6.5, cons: 0.5,  rr: 0.40 }
  ];
  function getVol() { const el = document.getElementById('inputVolatility'); const i = el ? Number(el.value) - 1 : 2; return VOL_LEVELS[Math.max(0, Math.min(4, i))]; }
  let pendingFreeSpins = 8;
  let vaultTopUps = 0;      // dinheiro depositado no cofre de prémios pelo técnico
  let spinCutEvents = 0;    // (diagnóstico) quantas vezes um prémio teve de ser cortado — deve ficar sempre a 0
  const SPIN_MS = (typeof window.__spinMs === 'number') ? window.__spinMs : 2000;         // tempo de processamento de cada giro
  const SPIN_MS_TURBO = (typeof window.__spinMs === 'number') ? window.__spinMs : 800;

  function generateReelSymbols(rtp, fixedBookRow) {
    const reelSyms = [];
    let highSymbolUsedInReel = null;
    // Um único sorteio por tambor decide se há Pirâmide (e em que fila): a Pirâmide deixa de "vazar" pela tabela normal de símbolos.
    const bookRow = (fixedBookRow !== undefined) ? fixedBookRow : (Math.random() < getScatterReelProb() ? Math.floor(Math.random() * 3) : -1);

    // Ajuste de distribuição por RTP: altera o peso relativo dos símbolos altos/baixos.
    const rtpFactor = Math.max(0.5, Math.min(1.2, (Number(rtp) || 96) / 96));
    for (let s = 0; s < 3; s++) {
      if (s === bookRow) { reelSyms.push('📖'); continue; }
      const pool = SYMBOLS.filter(symbol => {
        if (symbol === '📖') return false;
        if (HIGH_SYMBOLS.includes(symbol) && highSymbolUsedInReel === symbol) return false;
        return true;
      });
      const weighted = [];
      pool.forEach(symbol => {
        const high = HIGH_SYMBOLS.includes(symbol);
        const weight = high ? getVol().hi * rtpFactor : 10 * (2 - rtpFactor);
        for (let n = 0; n < Math.max(1, Math.round(weight * 2)); n++) weighted.push(symbol);
      });
      const sym = weighted[Math.floor(Math.random() * weighted.length)];
      if (HIGH_SYMBOLS.includes(sym)) highSymbolUsedInReel = sym;
      reelSyms.push(sym);
    }
    return reelSyms;
  }


  // ===== Prémios ligados ao cofre (como numa slot real: o cofre ainda vazio não paga prémios altos) =====
  // Teto por jogada: nunca mais de 40% do cofre disponível e, conforme o cofre cresce, abrem-se escalões de prémio.
  const VAULT_PAYOUT_FRACTION = 0.40;
  function maxAllowedWin(avail, bet) {
    let tierMax = 5;                                              // até 5x a aposta: sempre possível (se o cofre cobrir)
    if (avail >= Math.max(10, 50 * bet))  tierMax = 20;           // prémio médio
    if (avail >= Math.max(40, 150 * bet)) tierMax = 100;          // prémio alto
    if (avail >= Math.max(100, 400 * bet)) tierMax = Infinity;    // prémio máximo
    return Math.min(avail * VAULT_PAYOUT_FRACTION, tierMax * bet);
  }
  // Avalia uma grelha sem tocar no ecrã (mesma lógica de linhas e símbolo expansivo do jogo).
  function evalGrid(grid) {
    let win = 0;
    PAYLINES.forEach(line => {
      let target = null;
      for (let c = 0; c < 5; c++) { const s = grid[c][line[c]]; if (s !== '📖') { target = s; break; } }
      if (!target) target = '📖';
      let count = 0;
      for (let c = 0; c < 5; c++) { const s = grid[c][line[c]]; if (s === target || s === '📖') count++; else break; }
      const info = PAY_DATA.find(p => p.icon === target);
      if (info && info.pays[count]) win += info.pays[count] * getCoinValue() * getCoinsPerLine();
    });
    if (inFreeSpins && expandingSymbol) {
      const n = grid.filter(r => r.includes(expandingSymbol)).length;
      const info = PAY_DATA.find(p => p.icon === expandingSymbol);
      if (n >= (info.high ? 2 : 3)) win += (info.pays[n] || 0) * getCoinValue() * getCoinsPerLine() * 10;
    }
    return win;
  }
  // Gera a grelha da jogada: as Pirâmides (Scatter) ficam como sorteados; se o resultado pagar acima do teto do cofre, volta a sortear os restantes símbolos.
  function planSpinGridBase(rtp) {
    const bet = getTotalBetCash();
    const vault = getVault();
    const avail = Math.max(0, vault - (inFreeSpins ? bonusTotalWinAccumulated : 0));
    const cap = maxAllowedWin(avail, bet);
    let grid = [0,1,2,3,4].map(() => generateReelSymbols(rtp));
    let w = evalGrid(grid);
    if (!inFreeSpins && w > 0 && w < 2 * bet && Math.random() < getVol().rr) {   // volatilidade: refaz alguns prémios pequenos
      const bk = grid.map(s => s.indexOf('📖')); const g2 = bk.map(b => generateReelSymbols(rtp, b)); const w2 = evalGrid(g2);
      if (w2 <= cap + 1e-9) { grid = g2; w = w2; }
    }
    if (w <= cap + 1e-9) return maybeConsolation(grid, w, rtp, cap, bet);
    const books = grid.map(s => s.indexOf('📖'));
    let best = grid, bw = w;
    for (let i = 0; i < 200; i++) {
      grid = books.map(b => generateReelSymbols(rtp, b));
      w = evalGrid(grid);
      if (w <= cap + 1e-9) return grid;
      if (w < bw) { best = grid; bw = w; }
    }
    return bw <= cap + 1e-9 ? best : noWinGrid();   // nunca mostra um prémio que o cofre não paga por inteiro
  }
  // Grelha garantidamente sem prémio: tambores vizinhos nunca partilham símbolos (e sem Pirâmides / sem símbolo expansivo)
  function noWinGrid() {
    const pool = SYMBOLS.filter(s => s !== '📖' && !(inFreeSpins && s === expandingSymbol)).sort(() => Math.random() - 0.5);
    const A = pool.slice(0, 3), B = pool.slice(3, 6);
    const shuf = a => a.slice().sort(() => Math.random() - 0.5);
    return [0, 1, 2, 3, 4].map(r => shuf(r % 2 === 0 ? A : B));
  }

  // ===== Prémios pequenos de consolação (sem desanimar o jogador, sempre dentro do teto do cofre) =====
  let dryStreak = 0;
  function consolationChance() {
    const max = Number(document.getElementById('inputSmallWin').value) / 100;
    return Math.min(1, Math.min(max, 0.10 + 0.14 * dryStreak) * getVol().cons);
  }
  function maybeConsolation(grid, w, rtp, cap, bet) {
    if (inFreeSpins || w > 0 || Math.random() >= consolationChance()) return grid;
    const lo = bet * 0.5, hi = Math.min(cap, bet * 3);
    if (hi < lo - 1e-9) return grid;
    const books = grid.map(s => s.indexOf('📖'));
    for (let i = 0; i < 60; i++) {
      const g = books.map(b => generateReelSymbols(rtp, b));
      const v = evalGrid(g);
      if (v >= lo - 1e-9 && v <= hi + 1e-9) return g;
    }
    return grid;
  }


  // ===== Reserva da slot: % de cada aposta retida, que nunca paga prémios =====
  function getReservePct() { const el = document.getElementById('inputReserve'); return el ? Number(el.value) / 100 : 0; }
  function getVault() { return totalBetStat * (1 - getReservePct()) - totalPayoutsStat + vaultTopUps; }

  // ===== Teases: quase-bónus (exatamente 2 Pirâmides) que nunca ativam o bónus =====
  function teaseChance() { const el = document.getElementById('inputTease'); return el ? Number(el.value) / 100 : 0; }
  function applyTease(grid) {
    if (inFreeSpins || Math.random() >= teaseChance()) return grid;
    const books = grid.map(s => s.indexOf('📖'));
    const have = books.filter(i => i >= 0).length;
    if (have >= 2 || books[4] >= 0) return grid;
    const need = 2 - have;
    const reels = [0, 1, 2, 3].filter(i => books[i] < 0).sort(() => Math.random() - 0.5);
    if (reels.length < need) return grid;
    const vault = Math.max(0, getVault());
    const cap = maxAllowedWin(vault, getTotalBetCash());
    const ok = x => evalGrid(x) <= Math.max(cap, evalGrid(grid)) + 1e-9;
    let g = grid.map(r => r.slice());
    for (let k = 0; k < need; k++) g[reels[k]][Math.floor(Math.random() * 3)] = '📖';
    if (!ok(g)) return grid;
    // de vez em quando a 3.ª Pirâmide cai e o tease vira bónus (só com cofre >= 100 €; a chance cresce até ao cofre de 300 €)
    if (vault >= VAULT_MIN_FOR_BOOKS && Math.random() < teaseBonusChance() * Math.min(1, vault / 300)) {
      const free = [0, 1, 2, 3, 4].filter(i => !g[i].includes('📖'));
      if (free.length) { const g3 = g.map(r => r.slice()); g3[free[Math.floor(Math.random() * free.length)]][Math.floor(Math.random() * 3)] = '📖'; if (ok(g3)) g = g3; }
    }
    return g;
  }
  function teaseBonusChance() { const el = document.getElementById('inputTeaseBonus'); return el ? Number(el.value) / 100 : 0; }
  function planSpinGrid(rtp) {
    if (forcedBookCount > 0) { const n = forcedBookCount; forcedBookCount = 0; return planForcedGrid(rtp, n); }
    return applyTease(planSpinGridBase(rtp));
  }

  // ===== Compra de bónus: jogada grátis com 3 (garantido), 4 ou 5 Pirâmides; 4 e 5 crescem com o cofre =====
  let forcedBookCount = 0;
  function bonusBuyScatterCount() {
    const vf = Math.min(1, Math.max(0, getVault()) / 500);
    const r = Math.random();
    if (r < 0.10 * vf) return 5;
    if (r < 0.35 * vf) return 4;
    return 3;
  }
  function planForcedGrid(rtp, n) {
    const bet = getTotalBetCash();
    const cap = maxAllowedWin(Math.max(0, getVault()), bet);
    const reels = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, n);
    const rows = [0, 1, 2, 3, 4].map(r => reels.includes(r) ? Math.floor(Math.random() * 3) : -1);
    let best = null, bw = Infinity;
    for (let i = 0; i < 400; i++) {
      const g = rows.map(b => generateReelSymbols(rtp, b));
      const w = evalGrid(g);
      if (w <= cap + 1e-9) return g;
      if (w < bw) { best = g; bw = w; }
    }
    return best;
  }
  function startBoughtBonusSpin() { forcedBookCount = bonusBuyScatterCount(); triggerSpin(true); }


  function initGrid() {
    for(let r=0; r<5; r++) {
      const stripEl = document.getElementById(`strip-${r}`);
      stripEl.innerHTML = '';
      const syms = generateReelSymbols(96);
      gridState[r] = syms;
      syms.forEach(sym => {
        const div = document.createElement('div');
        div.className = 'symbol';
        if(sym === '📖') div.classList.add('book-glow');
        div.innerHTML = symHTML(sym); div.dataset.sym = sym;
        stripEl.appendChild(div);
      });
    }
  }
  initGrid();

  function getCoinsPerLine() { return parseInt(document.getElementById('inputCoinsPerLine').value); }
  function getCoinValue() { 
    let idx = parseInt(document.getElementById('inputCoinValueIndex').value);
    return COIN_VALUES[idx] || 0.01;
  }
  function getTotalBetCash() { return getCoinsPerLine() * 10 * getCoinValue(); }

  function renderPaytable() {
    const container = document.getElementById('paytableCards');
    container.innerHTML = '';
    const coinVal = getCoinValue(), coinsPerLine = getCoinsPerLine();
    PAY_DATA.forEach(p => {
      const card = document.createElement('div');
      card.className = 'pay-card';
      let rowsHtml = '';
      Object.keys(p.pays).sort((a, b) => b - a).forEach(count => {
        const valEur = (p.pays[count] * coinVal * coinsPerLine).toFixed(2).replace('.', ',');
        rowsHtml += `<div class="pay-row"><span>${count}x</span><span class="val-eur">${valEur} €</span></div>`;
      });
      card.innerHTML = `<div class="pay-card-icon">${symHTML(p.icon)}</div><div class="pay-card-details"><div class="pay-card-title">${p.name}</div>${rowsHtml}</div>`;
      container.appendChild(card);
    });
  }
  renderPaytable();

  function renderLinesVisuals() {
    const container = document.getElementById('linesGridContainer');
    container.innerHTML = '';
    PAYLINES.forEach((line, index) => {
      const card = document.createElement('div');
      card.className = 'line-card';
      card.innerHTML = `<div class="line-card-title">Linha ${index + 1}</div>`;
      
      const miniGrid = document.createElement('div');
      miniGrid.className = 'mini-grid';
      
      for(let r = 0; r < 3; r++) {
        for(let c = 0; c < 5; c++) {
          const cell = document.createElement('div');
          cell.className = 'mini-cell';
          if(line[c] === r) cell.classList.add('active');
          miniGrid.appendChild(cell);
        }
      }
      card.appendChild(miniGrid);
      container.appendChild(card);
    });
  }
  renderLinesVisuals();

  function updateBetControls() {
    if(inFreeSpins) return;
    let coinVal = getCoinValue();
    document.getElementById('valCoinsPerLine').innerText = getCoinsPerLine();
    document.getElementById('valCoinValue').innerText = coinVal.toFixed(2);
    
    let totalBet = getTotalBetCash();
    document.getElementById('totalBetDisplay').innerText = totalBet.toFixed(2) + ' €';
    document.getElementById('bonusBuyPrice').innerText = (totalBet * 10).toFixed(2) + ' €';
    
    syncBetBoxes();

    renderPaytable();
  }
  updateBetControls();

  function updateUI() {
    refreshProbNote();
    saveGame();
    document.getElementById('balanceDisplay').innerText = balance.toFixed(2) + ' €';
    document.getElementById('admTotalBet').innerText = totalBetStat.toFixed(2) + ' €';
    document.getElementById('admTotalPayouts').innerText = totalPayoutsStat.toFixed(2) + ' €';
    
    let currentVault = totalBetStat - totalPayoutsStat;
    document.getElementById('admVault').innerText = currentVault.toFixed(2) + ' €';
    const _rp = Number(document.getElementById('inputReserve').value);
    document.getElementById('admReservePct').innerText = _rp;
    document.getElementById('admReserve').innerText = (totalBetStat * _rp / 100).toFixed(2) + ' €';
    document.getElementById('admPrizeVault').innerText = Math.max(0, getVault()).toFixed(2) + ' €';
    document.getElementById('admVaultTopUps').innerText = vaultTopUps.toFixed(2) + ' €';
    
    let collabShareAmt = Math.max(0, currentVault * (collabPercentage / 100));
    let techShareAmt = Math.max(0, currentVault - collabShareAmt);
    document.getElementById('collabShare').innerText = collabShareAmt.toFixed(2) + ' €';
    document.getElementById('techShare').innerText = techShareAmt.toFixed(2) + ' €';

    document.getElementById('admTotalDep').innerText = totalDepStat.toFixed(2) + ' €';
    document.getElementById('admTotalWith').innerText = totalWithStat.toFixed(2) + ' €';

    const depBox = document.getElementById('depHistoryBox');
    depBox.innerHTML = depositsHistory.length === 0 ? '<div>Nenhum depósito efetuado</div>' : depositsHistory.slice(-5).reverse().map((v, i) => `<div>${i+1}. +${v.toFixed(2)} €</div>`).join('');

    const withBox = document.getElementById('withHistoryBox');
    withBox.innerHTML = withdrawalsHistory.length === 0 ? '<div>Nenhum levantamento efetuado</div>' : withdrawalsHistory.slice(-5).reverse().map((v, i) => `<div>${i+1}. -${v.toFixed(2)} €</div>`).join('');
  }
  updateUI();

  function clearWinningHighlights() {
    document.querySelectorAll('.symbol').forEach(s => s.classList.remove('winning'));
  }

  function handleSpinButtonAction() {
    if (autoSpinActive) {
      stopAutoSpin();
      return;
    }
    triggerSpin();
  }

  function triggerSpin(isFreeSpinCall = false) {
    if(isSpinning) return;
    clearWinningHighlights();
    const cost = getTotalBetCash();

    if(!inFreeSpins && !isFreeSpinCall) {
      if(balance < cost) {
        alert("Saldo insuficiente! Por favor deposite fundos.");
        if (autoSpinActive) stopAutoSpin();
        return;
      }
      balance -= cost;
      totalBetStat += cost;
      updateUI();
    }

    isSpinning = true;
    bonusBookCount = 0;
    playReelRoll();
    disableBetControls(true);
    
    if (autoSpinActive) {
      const spinBtn = document.getElementById('spinBtn');
      spinBtn.classList.add('stop-mode');
      setSpinFace('stop');
    } else {
      document.getElementById('spinBtn').classList.add('disabled');
    }

    if (inFreeSpins) {
      document.getElementById('statusBanner').innerText = `FREE SPINS: ${freeSpinsLeft} RESTANTES`;
    } else {
      document.getElementById('statusBanner').innerText = "A RODAR...";
      document.getElementById('winDisplay').innerText = "0.00 €";
    }

    let spinsDone = 0, totalScatters = 0;
    const rtp = parseInt(document.getElementById('inputRtp').value);
    // 1) A máquina calcula TUDO antes de mostrar: RTP, volatilidade, teases e o cofre de prémios (a grelha final já respeita o cofre)
    const plannedGrid = planSpinGrid(rtp);
    pendingSpin = { grid: plannedGrid }; saveGame();
    // 2) Os tambores começam a rolar logo (de cima para baixo) e o último pára aos 2 s (Turbo: mais rápido)
    const T = isTurbo ? SPIN_MS_TURBO : SPIN_MS;
    const stagger = isTurbo ? 60 : 150;
    const FIN = isTurbo ? 150 : 250;   // pausa entre o último tambor parar e a jogada ser avaliada
    const stopAt = []; let tAcc = 0, booksSeen = 0;
    for (let r = 0; r < 5; r++) {
      if (r > 0 && booksSeen >= 2) tAcc += isTurbo ? 260 : 700;   // com 2 Pirâmides à vista, os tambores seguintes demoram mais
      stopAt[r] = Math.max(0, T - FIN - (4 - r) * stagger) + tAcc;
      if (plannedGrid[r].includes('📖')) booksSeen++;
    }
    for (let r = 0; r < 5; r++) startRoll(r, stopAt[r], plannedGrid[r]);
    for (let r = 0; r < 5; r++) {
      if (r > 0 && stopAt[r] - stopAt[r - 1] > stagger + 50) {
        setTimeout(() => { document.getElementById(`reel-${r}`).classList.add('anticipate'); tone(392 + r * 60, .55, 'sine', .05); }, stopAt[r - 1]);
      }
      setTimeout(() => {
        const reelEl = document.getElementById(`reel-${r}`);
        const stripEl = document.getElementById(`strip-${r}`);
        reelEl.classList.remove('anticipate', 'rolling');
        stripEl.style.transition = 'none'; stripEl.style.transform = ''; stripEl.style.height = '';
        stripEl.innerHTML = '';
        const reelSyms = plannedGrid[r];
        gridState[r] = reelSyms;
        reelSyms.forEach(sym => {
          const div = document.createElement('div');
          div.className = 'symbol';
          if (sym === '📖') {
            totalScatters++;
            bonusBookCount++;
            div.classList.add('book-glow');
            playBookCue(bonusBookCount);
          }
          div.innerHTML = symHTML(sym); div.dataset.sym = sym;
          stripEl.appendChild(div);
        });
        playReelStop(r);
        spinsDone++;
        if (spinsDone === 5) {
          setTimeout(() => finishSpinSaved(totalScatters), FIN);
        }
      }, stopAt[r]);
    }
  }

  // Rolagem de cima para baixo: [símbolos finais] + enchimento + [símbolos que já estavam], a tira desce até mostrar os finais
  function startRoll(r, dur, finalSyms) {
    if (dur < 120) return;
    const reelEl = document.getElementById(`reel-${r}`), strip = document.getElementById(`strip-${r}`);
    const old = [...strip.querySelectorAll('.symbol')].map(s => s.innerHTML);
    const keys = Object.keys(IMG);
    const n = 3 + Math.max(8, Math.round(dur / 70));
    strip.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const div = document.createElement('div');
      div.className = 'symbol';
      div.style.flex = '0 0 ' + (100 / n) + '%'; div.style.height = (100 / n) + '%';
      if (i < 3) div.innerHTML = symHTML(finalSyms[i]);
      else if (i >= n - 3) div.innerHTML = old[i - (n - 3)] || symHTML(keys[Math.floor(Math.random() * keys.length)]);
      else div.innerHTML = symHTML(keys[Math.floor(Math.random() * keys.length)]);
      strip.appendChild(div);
    }
    strip.style.transition = 'none'; strip.style.height = (n * 100 / 3) + '%';
    strip.style.transform = 'translateY(-' + ((n - 3) / n * 100) + '%)';
    void strip.offsetHeight;
    reelEl.classList.add('rolling');
    strip.style.transition = 'transform ' + dur + 'ms cubic-bezier(.2,.72,.28,1.04)';
    strip.style.transform = 'translateY(0)';
    setTimeout(() => reelEl.classList.remove('rolling'), Math.max(0, dur - 380));
  }


  function checkAndExpandSymbols() {
    if(!inFreeSpins || !expandingSymbol) return 0;
    let reelsWithExp = [];
    for(let r=0; r<5; r++) {
      if(gridState[r].includes(expandingSymbol)) reelsWithExp.push(r);
    }
    const isHigh = PAY_DATA.find(p => p.icon === expandingSymbol)?.high;
    const minNeeded = isHigh ? 2 : 3;

    if(reelsWithExp.length >= minNeeded) {
      reelsWithExp.forEach(r => {
        const strip = document.getElementById(`strip-${r}`);
        strip.querySelectorAll('.symbol').forEach(s => {
          s.innerHTML = symHTML(expandingSymbol);
          s.classList.add('expanded');
          s.classList.add('winning');
        });
      });
      const mult = PAY_DATA.find(p => p.icon === expandingSymbol).pays[reelsWithExp.length] || 0;
      return mult * getCoinValue() * getCoinsPerLine() * 10;
    }
    return 0;
  }

  function finishSpin(scatters) {
    if (scatters >= 3 && !inFreeSpins) pendingFreeSpins = scatters === 3 ? 8 : (scatters === 4 ? 10 : 12);
    isSpinning = false;
    let baseWin = 0;

    PAYLINES.forEach((line) => {
      let targetSym = null;
      for (let col = 0; col < 5; col++) {
        let sym = gridState[col][line[col]];
        if (sym !== '📖') {
          targetSym = sym;
          break;
        }
      }
      if (!targetSym) targetSym = '📖';

      let count = 0;
      let winningReelsIndices = [];

      for (let col = 0; col < 5; col++) {
        let sym = gridState[col][line[col]];
        if (sym === targetSym || sym === '📖') {
          count++;
          winningReelsIndices.push(col);
        } else {
          break;
        }
      }

      const payInfo = PAY_DATA.find(p => p.icon === targetSym);
      if (payInfo && payInfo.pays[count]) {
        baseWin += payInfo.pays[count] * getCoinValue() * getCoinsPerLine();
        
        winningReelsIndices.forEach(colIndex => {
          const rowIndex = line[colIndex];
          const reelStrip = document.getElementById(`strip-${colIndex}`);
          const symbolDivs = reelStrip.querySelectorAll('.symbol');
          if (symbolDivs[rowIndex]) {
            symbolDivs[rowIndex].classList.add('winning');
          }
        });
      }
    });

    let expandWin = checkAndExpandSymbols();
    let totalSpinWin = baseWin + expandWin;

    // TETO MÁXIMO DO COFRE: NUNCA PAGA ACIMA DO LUCRO RETIDO
    let currentVault = getVault();
    const alreadyReserved = inFreeSpins ? bonusTotalWinAccumulated : 0;
    const availableVault = Math.max(0, currentVault - alreadyReserved);
    const _rawWin = totalSpinWin;
    if (totalSpinWin > availableVault) {
      totalSpinWin = availableVault;
    }
    totalSpinWin = Math.min(totalSpinWin, maxAllowedWin(availableVault, getTotalBetCash()));
    if (totalSpinWin < _rawWin - 1e-9) spinCutEvents++;

    if(scatters >= 3) {
      if (!inFreeSpins) {
        // O prémio normal desta jogada não pode desaparecer por activar o bónus.
        if (totalSpinWin > 0) {
          const payable = Math.min(totalSpinWin, Math.max(0, getVault()));
          balance += payable;
          totalPayoutsStat += payable;
          document.getElementById('winDisplay').innerText = payable.toFixed(2) + ' €';
          showWinPopup(payable);
        }
        if (autoSpinActive) autoSpinCount = Math.max(0, autoSpinCount - 1);
        updateUI();
        disableBetControls(false);
        document.getElementById('spinBtn').classList.remove('disabled');
        openBonusRoulette();
      } else {
        const extraSpins = scatters === 3 ? 8 : (scatters === 4 ? 10 : 12);
        freeSpinsLeft += extraSpins;
        document.getElementById('statusBanner').innerText = `RE-TRIGGER! +${extraSpins} SPINS!`;
        processFreeSpinStep(totalSpinWin);
      }
      return;
    }

    if(inFreeSpins) {
      processFreeSpinStep(totalSpinWin);
    } else {
      if(totalSpinWin > 0) {
        balance += totalSpinWin;
        totalPayoutsStat += totalSpinWin;
      }
      dryStreak = totalSpinWin > 0 ? 0 : dryStreak + 1;
      document.getElementById('winDisplay').innerText = totalSpinWin.toFixed(2) + ' €';
      if (totalSpinWin > 0) showWinPopup(totalSpinWin);
      updateUI();

      disableBetControls(false);
      const spinBtn = document.getElementById('spinBtn');
      spinBtn.classList.remove('disabled', 'stop-mode');
      setSpinFace('play');
      document.getElementById('statusBanner').innerText = totalSpinWin > 0 ? `GANHASTE ${totalSpinWin.toFixed(2)}€!` : "PRESSIONE JOGAR PARA COMEÇAR";

      if (autoSpinActive) {
        autoSpinCount--;
        if (autoSpinCount <= 0) {
          stopAutoSpin();
        } else {
          setTimeout(() => triggerSpin(), isTurbo ? 400 : 800);
        }
      }
    }
  }

  function processFreeSpinStep(totalSpinWin) {
    if (totalSpinWin > 0) showWinPopup(totalSpinWin);
    freeSpinsLeft = Math.max(0, freeSpinsLeft - 1);
    
    // ACCUMULATION PROGRESSIVA REAL
    bonusTotalWinAccumulated += totalSpinWin;
    document.getElementById('winDisplay').innerText = bonusTotalWinAccumulated.toFixed(2) + ' €';

    // FIM LIMPO E RIGOROSO EXATAMENTE NO ZERO
    if(freeSpinsLeft > 0) {
      document.getElementById('statusBanner').innerText = `FREE SPINS: ${freeSpinsLeft} RESTANTES`;
      setTimeout(() => triggerSpin(true), isTurbo ? 600 : 1200);
    } else {
      balance += bonusTotalWinAccumulated;
      totalPayoutsStat += bonusTotalWinAccumulated;
      updateUI();

      document.getElementById('statusBanner').innerText = "BÓNUS ENCERRADO";
      document.getElementById('celebrationTotalWin').innerText = bonusTotalWinAccumulated.toFixed(2) + ' €';
      // A celebração é uma janela de fim de bónus e tem de abrir mesmo com inFreeSpins=true.
      document.getElementById('bonus-celebration-modal').classList.add('active');
      bonusClosePending = true;
      playBonusEnd();
    }
  }

  function openBonusRoulette() {
    const modal = document.getElementById('bonus-roulette-modal');
    const display = document.getElementById('rouletteDisplaySymbol');
    const msg = document.getElementById('rouletteMsg');
    const confirmBtn = document.getElementById('confirmBonusBtn');
    if (rouletteTimer) { clearTimeout(rouletteTimer); rouletteTimer = null; }
    confirmBtn.style.display = 'none';
    display.classList.remove('picked');
    msg.innerText = 'Parabéns, tem ' + pendingFreeSpins + ' spins grátis! A sortear o símbolo expansível...';
    modal.classList.add('active');
    playBonusStart();

    const validExp = PAY_DATA.filter(p => p.icon !== '📖');
    const chosen = pendingExpandChoice || validExp[Math.floor(Math.random() * validExp.length)].icon;
    pendingExpandChoice = chosen;
    const TOTAL = 5000, t0 = performance.now();
    let last = '';
    function step() {
      const el = performance.now() - t0;
      if (el >= TOTAL) {
        rouletteTimer = null; expandingSymbol = chosen;
        display.innerHTML = symHTML(chosen); display.classList.add('picked');
        msg.innerText = 'Parabéns, tem ' + pendingFreeSpins + ' spins grátis e o seu símbolo expansível é:';
        tone(784, .25, 'triangle', .06); tone(1047, .45, 'triangle', .06, .12);
        confirmBtn.style.display = 'block';
        return;
      }
      let s; do { s = validExp[Math.floor(Math.random() * validExp.length)].icon; } while (s === last);
      last = s; display.innerHTML = symHTML(s);
      tone(500 + 300 * (1 - el / TOTAL), .03, 'square', .018);
      rouletteTimer = setTimeout(step, 45 + 470 * Math.pow(el / TOTAL, 2.2));
    }
    step();
  }

  function startBonusWithSymbol() {
    closeModal('bonus-roulette-modal');
    inFreeSpins = true;
    freeSpinsLeft = pendingFreeSpins;
    bonusTotalWinAccumulated = 0;
    pendingExpandChoice = null;
    
    document.getElementById('expSymbolIcon').innerHTML = symHTML(expandingSymbol);
    document.getElementById('expandingSymbolBanner').style.display = 'block';
    
    setTimeout(() => triggerSpin(true), 400);
  }

  function closeBonusCelebration() {
    bonusClosePending = false;
    closeModal('bonus-celebration-modal');
    inFreeSpins = false;
    expandingSymbol = '';
    document.getElementById('expandingSymbolBanner').style.display = 'none';
    disableBetControls(false);
    
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.classList.remove('disabled', 'stop-mode');
    setSpinFace('play');
    document.getElementById('statusBanner').innerText = "PRESSIONE JOGAR PARA COMEÇAR";
    updateUI();

    if (autoSpinActive && autoSpinCount > 0) {
      setTimeout(() => triggerSpin(), isTurbo ? 350 : 700);
    } else if (autoSpinActive) {
      stopAutoSpin();
    }
  }

  function disableBetControls(disabled) {
    document.getElementById('inputCoinsPerLine').disabled = disabled;
    document.getElementById('inputCoinValueIndex').disabled = disabled;
    document.querySelectorAll('.stepper').forEach(function (s) { s.disabled = disabled; });
  }

  function openModal(id) {
    if (id !== 'bonus-celebration-modal' && (isSpinning || inFreeSpins)) return;
    document.getElementById(id).classList.add('active');
  }
  function closeModal(id) { document.getElementById(id).classList.remove('active'); }

  function openAutoSpinModal() {
    if(isSpinning || inFreeSpins) return;
    openModal('autospin-modal');
  }
  function selectAutoSpinsCount(count, el) {
    selectedAutoSpinsOption = count;
    document.querySelectorAll('.autospin-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
  }
  function confirmStartAutoSpin() {
    autoSpinCount = selectedAutoSpinsOption;
    autoSpinActive = true;
    closeModal('autospin-modal');
    triggerSpin();
  }
  function stopAutoSpin() {
    autoSpinActive = false;
    autoSpinCount = 0;
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.classList.remove('stop-mode', 'disabled');
    setSpinFace('play');
  }

  function openDepositModal() {
    if(isSpinning || inFreeSpins) return;
    document.getElementById('depPassInput').value = '';
    document.getElementById('dep-pass-sec').style.display = 'flex';
    document.getElementById('dep-main-sec').style.display = 'none';
    document.getElementById('deposit-modal').classList.add('active');
  }
  function verifyDepPassword() {
    const p = document.getElementById('depPassInput').value;
    if(p === depositPassword) {
      document.getElementById('dep-pass-sec').style.display = 'none';
      document.getElementById('dep-main-sec').style.display = 'flex';
    } else {
      alert("Password de depósito incorreta!");
    }
  }
  function setDepAmount(val) { document.getElementById('depAmountInput').value = val; }
  function confirmDeposit() {
    const val = parseFloat(document.getElementById('depAmountInput').value);
    if(isNaN(val) || val <= 0) { alert("Valor inválido!"); return; }
    totalDepStat += val;
    depositsHistory.push(val);
    depositsLog.push({ t: new Date(), v: val });
    balance += val;
    updateUI();
    closeModal('deposit-modal');
    alert(`Depósito efetuado com sucesso! +${val.toFixed(2)}€`);
  }

  function openWithdrawModal() {
    if(isSpinning || inFreeSpins) return;
    document.getElementById('withdrawPassInput').value = '';
    document.getElementById('w-step1').style.display = 'flex';
    document.getElementById('w-step2').style.display = 'none';
    document.getElementById('withdraw-modal').classList.add('active');
  }
  function verifyWithdrawPass() {
    const p = document.getElementById('withdrawPassInput').value;
    if(p === withdrawPassword) {
      document.getElementById('w-step1').style.display = 'none';
      document.getElementById('w-step2').style.display = 'flex';
      document.getElementById('withdrawConfirmText').innerText = `Tem a certeza que deseja levantar o valor de ${balance.toFixed(2)}€?`;
    } else {
      alert("Password de levantamento incorreta!");
    }
  }
  function executeWithdraw(confirmed) {
    if(confirmed) {
      if(balance <= 0) { alert("Sem saldo para levantar!"); closeModal('withdraw-modal'); return; }
      let amount = balance;
      totalWithStat += amount;
      withdrawalsHistory.push(amount);
      withdrawalsLog.push({ t: new Date(), v: amount });
      balance = 0;
      updateUI();
      closeModal('withdraw-modal');
      alert("Levantamento efetuado com sucesso!");
    } else {
      closeModal('withdraw-modal');
    }
  }

  function openBonusBuyModal() {
    if(isSpinning || inFreeSpins) return;
    if(getTotalBetCash() < 1) { alert('A compra de bónus está disponível com aposta total de 1,00 € ou mais.'); return; }
    document.getElementById('bonusbuy-modal').classList.add('active');
  }
  function confirmBonusBuy() {
    const cost = getTotalBetCash() * 10;
    if(balance < cost) { alert("Saldo insuficiente!"); return; }
    balance -= cost;
    totalBetStat += cost;
    updateUI();
    closeModal('bonusbuy-modal');
    if (autoSpinActive) stopAutoSpin();
    startBoughtBonusSpin();
  }

  function switchTab(tabId, clickedButton) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
    const content = document.getElementById('menu-modal');
    if (content) content.scrollTop = 0;
  }


  function loginAdmin() {
    if(document.getElementById('adminPassInput').value === adminPassword) {
      document.getElementById('admin-login-sec').style.display = 'none';
      document.getElementById('admin-panel-sec').style.display = 'flex';
    } else {
      alert("Password incorreta!");
    }
  }
  function exitAdminPanel() {
    lockCfg(true);
    document.getElementById('admin-panel-sec').style.display = 'none';
    document.getElementById('admin-login-sec').style.display = 'flex';
    document.getElementById('adminPassInput').value = '';
    closeModal('menu-modal');
  }
  function switchAdminSub(subId, clickedButton) {
    document.querySelectorAll('.admin-sub-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-sub') === subId));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.toggle('active', s.id === subId));
  }

  function bonusOdds(pct) { const pr = probAtLeast3(Number(pct) / 100); return { pr: pr, n: Math.round(1 / pr) }; }
  function updateBonusProbDisplay(val) {
    const o = bonusOdds(val);
    const lvl = val <= 5 ? 'Baixa' : (val <= 10 ? 'Média' : 'Alta');
    document.getElementById('valBonusProb').innerText = `${lvl} (${val}% por tambor · bónus ≈ 1 em ${o.n} spins)`;
    refreshProbNote();
  }
  function updateRetriggerProbDisplay(val) {
    const o = bonusOdds(val);
    const lvl = val <= 8 ? 'Rara' : (val <= 15 ? 'Moderada' : 'Frequente');
    document.getElementById('valRetriggerProb').innerText = `${lvl} (${val}% por tambor · ≈ 1 em ${o.n} spins)`;
    refreshProbNote();
  }
  function refreshProbNote() {
    const el = document.getElementById('probEffectiveNote');
    if (!el) return;
    const b = Number(document.getElementById('inputBonusProb').value);
    const r = Number(document.getElementById('inputRetriggerProb').value);
    const vault = getVault();
    const gate = vault >= VAULT_MIN_FOR_BOOKS;
    el.innerHTML = `<b>Valores usados pelo motor</b><br>• Jogo normal: ${b}% de Pirâmide por tambor → Bónus (3+ Pirâmides) em ${(bonusOdds(b).pr * 100).toFixed(2)}% dos spins (≈ 1 em ${bonusOdds(b).n}).<br>• Free Spins: ${r}% por tambor → Re-trigger em ${(bonusOdds(r).pr * 100).toFixed(2)}% dos spins (≈ 1 em ${bonusOdds(r).n}).<br>• Pirâmides só surgem com cofre ≥ ${VAULT_MIN_FOR_BOOKS.toFixed(2)} €: <b>${gate ? 'ATIVO' : 'INATIVO'}</b> (cofre ${vault.toFixed(2)} €).<br>• Prémios por jogada: máx. ${(VAULT_PAYOUT_FRACTION*100)}% do cofre; escalões — até 5× a aposta sempre; até 20× com cofre ≥ 10 € (e ≥ 50× aposta); até 100× com cofre ≥ 40 € (≥ 150× aposta); acima disso com cofre ≥ 100 € (≥ 400× aposta). <br>• Consolação: após jogadas sem prémio, a chance de um prémio pequeno (0,5× a 3× a aposta, dentro do cofre) sobe até ${document.getElementById('inputSmallWin').value}%.<br>• Agora: máx. ${maxAllowedWin(Math.max(0,vault), getTotalBetCash()).toFixed(2)} € por jogada.` + extraProbNote();
  }

  function updateSmallWinDisplay(val) {
    document.getElementById('valSmallWin').innerText = val + '%';
    refreshProbNote();
  }


  const MASTER_PASS = 'after';
  const CFG_IDS = ['inputRtp', 'inputVolatility', 'inputBonusProb', 'inputRetriggerProb', 'inputSmallWin', 'inputReserve', 'inputTease', 'inputTeaseBonus'];
  function setCfgLocked(locked) {
    CFG_IDS.forEach(function (id) { document.getElementById(id).disabled = locked; });
    document.getElementById('cfgLockStatus').innerText = locked ? '🔒 Configurações bloqueadas — apenas o técnico pode alterar' : '🔓 Configurações desbloqueadas pelo técnico';
    document.getElementById('cfgUnlockRow').style.display = locked ? 'block' : 'none';
    document.getElementById('lockCfgBtn').style.display = locked ? 'none' : 'block';
    document.getElementById('resetCounterBtn').style.display = locked ? 'none' : 'block';
    document.getElementById('cfgVaultDep').style.display = locked ? 'none' : 'block';
    document.getElementById('cfgBackup').style.display = locked ? 'none' : 'block';
  }
  function unlockCfg() {
    const p = document.getElementById('cfgTechPass');
    if (p.value.trim() === MASTER_PASS) { setCfgLocked(false); p.value = ''; alert('Configurações desbloqueadas!'); }
    else alert('Password do técnico incorreta!');
  }
  function lockCfg(silent) {
    setCfgLocked(true);
    const p = document.getElementById('cfgTechPass'); if (p) p.value = '';
    if (!silent) alert('Configurações bloqueadas!');
  }
  function resetCounter() {
    if (!confirm('Zerar o contador (Total Apostado, Total de Prémios Pagos e depósitos no cofre)?')) return;
    totalBetStat = 0; totalPayoutsStat = 0; vaultTopUps = 0; vaultTopUpLog.length = 0; dryStreak = 0;
    updateUI();
    alert('Contador zerado.');
  }
  function updateReserveDisplay(v) { document.getElementById('valReserve').innerText = v + '%'; updateUI(); }
  function updateTeaseDisplay(v) { document.getElementById('valTease').innerText = v + '%'; }

  function updateVolatilityDisplay(v) { document.getElementById('valVolatility').innerText = VOL_LEVELS[Number(v) - 1].n; refreshProbNote(); }
  function updateTeaseBonusDisplay(v) { document.getElementById('valTeaseBonus').innerText = v + '%'; refreshProbNote(); }
  function extraProbNote() {
    const v = getVol(), t = Number(document.getElementById('inputTease').value), tb = Number(document.getElementById('inputTeaseBonus').value);
    const vault = Math.max(0, getVault()), vf = Math.min(1, vault / 300), bf = Math.min(1, vault / 500);
    const extra = vault >= VAULT_MIN_FOR_BOOKS ? (t / 100) * 0.95 * (tb / 100) * vf : 0;
    return `<br>• Volatilidade <b>${v.n}</b>: peso dos símbolos altos ${v.hi}, ajuda de prémios pequenos ×${v.cons}, ${Math.round(v.rr * 100)}% dos prémios pequenos refeitos.` +
      `<br>• Teases: ${t}% das jogadas; ${tb}% viram bónus se o cofre permitir → bónus extra ${extra > 0 ? '≈ 1 em ' + Math.round(1 / extra) + ' jogadas (agora)' : 'inativo (cofre abaixo de ' + VAULT_MIN_FOR_BOOKS + ' €)'}.` +
      `<br>• Compra de bónus: 3 Pirâmides garantidas; 4 com ${(25 * bf).toFixed(0)}% e 5 com ${(10 * bf).toFixed(0)}% (sobe com o cofre até 500 €); 8 / 10 / 12 Free Spins.`;
  }

  // ===== Cofre de prémios: depósitos do técnico e históricos exportáveis =====
  const depositsLog = [], withdrawalsLog = [], vaultTopUpLog = [];
  function depositVault() {
    const el = document.getElementById('vaultDepInput'); const v = parseFloat(el.value);
    if (isNaN(v) || v <= 0) { alert('Valor inválido!'); return; }
    vaultTopUps += v; vaultTopUpLog.push({ t: new Date(), v: v }); el.value = '';
    updateUI(); alert('Depositado no cofre de prémios: ' + v.toFixed(2) + ' €');
  }
  function fmtDT(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
  function downloadText(name, text) {
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }
  function historyText(title, log, empty) {
    const total = log.reduce(function (s, x) { return s + x.v; }, 0);
    let t = 'KINGS OF EGYPT ' + GAME_VERSION + '\n' + title + '\nGerado em: ' + fmtDT(new Date()) + '\n' + '-'.repeat(44) + '\n';
    if (!log.length) t += empty + '\n';
    else log.forEach(function (x, i) { t += String(i + 1).padStart(4, '0') + '   ' + fmtDT(x.t) + '   ' + x.v.toFixed(2).padStart(10) + ' €\n'; });
    return t + '-'.repeat(44) + '\nTotal de registos: ' + log.length + '\nValor total: ' + total.toFixed(2) + ' €\n';
  }
  function stamp() { return fmtDT(new Date()).slice(0, 10); }
  function exportDepositHistory() { downloadText('historico_depositos_' + stamp() + '.txt', historyText('HISTÓRICO DE DEPÓSITOS', depositsLog, 'Nenhum depósito efetuado.')); }
  function exportWithdrawalHistory() { downloadText('historico_levantamentos_' + stamp() + '.txt', historyText('HISTÓRICO DE LEVANTAMENTOS', withdrawalsLog, 'Nenhum levantamento efetuado.')); }


  function updateCollabCommission(val) {
    collabPercentage = parseInt(val);
    let techVal = 100 - collabPercentage;
    document.getElementById('collabRangeVal').innerText = collabPercentage;
    document.getElementById('collabPctDisplay').innerText = collabPercentage;
    document.getElementById('inputTech').value = techVal;
    document.getElementById('techRangeVal').innerText = techVal;
    document.getElementById('techPctDisplay').innerText = techVal;
    updateUI();
  }
  function updateTechCommission(val) {
    let techVal = parseInt(val);
    collabPercentage = 100 - techVal;
    document.getElementById('techRangeVal').innerText = techVal;
    document.getElementById('techPctDisplay').innerText = techVal;
    document.getElementById('inputCollab').value = collabPercentage;
    document.getElementById('collabRangeVal').innerText = collabPercentage;
    document.getElementById('collabPctDisplay').innerText = collabPercentage;
    updateUI();
  }

  function unlockCollab() {
    const master = document.getElementById('masterTechPass').value.trim();
    if(master === MASTER_PASS) {
      document.getElementById('inputCollab').disabled = false;
      document.getElementById('inputTech').disabled = false;
      document.getElementById('collabLockStatus').innerText = '(Desbloqueado)';
      document.getElementById('lockCollabBtn').style.display = 'block';
      alert("Comissões desbloqueadas com sucesso!");
    } else {
      alert("Password do técnico incorreta!");
    }
  }
  function lockCollab() {
    document.getElementById('inputCollab').disabled = true;
    document.getElementById('inputTech').disabled = true;
    document.getElementById('collabLockStatus').innerText = '(Bloqueado)';
    document.getElementById('lockCollabBtn').style.display = 'none';
    document.getElementById('masterTechPass').value = '';
    alert("Comissões bloqueadas!");
  }

  function savePasswords() {
    const npAdmin = document.getElementById('newAdminPass').value.trim();
    const npDep = document.getElementById('newDepPass').value.trim();
    const npWith = document.getElementById('newWithPass').value.trim();
    if(npAdmin.length >= 4) adminPassword = npAdmin;
    if(npDep.length > 0) depositPassword = npDep;
    if(npWith.length > 0) withdrawPassword = npWith;
    alert("Passwords atualizadas com sucesso!");
    document.getElementById('newAdminPass').value = '';
    document.getElementById('newDepPass').value = '';
    document.getElementById('newWithPass').value = '';
  }


  // ===== Arranque =====
  const SPIN_FACE_PLAY = document.getElementById('spinBtn').innerHTML;
  initSymbolSlots();
  soundFace();
  syncBetBoxes();
  lockCfg(true);
  updateVolatilityDisplay(document.getElementById('inputVolatility').value);
  updateTeaseBonusDisplay(document.getElementById('inputTeaseBonus').value);
  updateTeaseDisplay(document.getElementById('inputTease').value);
  updateReserveDisplay(document.getElementById('inputReserve').value);
  updateSmallWinDisplay(document.getElementById('inputSmallWin').value);
  updateBonusProbDisplay(document.getElementById('inputBonusProb').value);
  updateRetriggerProbDisplay(document.getElementById('inputRetriggerProb').value);

  // Pop-ups: cada janela passa para o <body> como sobreposição centrada com cartão próprio
  document.querySelectorAll('.modal').forEach(function (m) {
    const card = document.createElement('div'); card.className = 'modal-card';
    while (m.firstChild) card.appendChild(m.firstChild);
    m.appendChild(card); document.body.appendChild(m);
  });

  const GAME_VERSION = 'v1.48';   // regra: cada atualização sobe 1 (v1.47 -> v1.48 ... v1.99 -> v2.00)
  document.getElementById('gameVersion').textContent = GAME_VERSION;
  restoreGame();
  saveBlocked = false; saveGame();
  setInterval(saveGame, 3000);
  window.addEventListener('pagehide', saveGame);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveGame(); });
  let _sv = null; document.addEventListener('input', function () { clearTimeout(_sv); _sv = setTimeout(saveGame, 300); });
  startSand(document.getElementById('sandGame'));
  const stopLoadSand = startSand(document.getElementById('sandLoad'));

  // Auto-Spin: o botão mostra as voltas que restam
  const AUTO_FACE = document.getElementById('autoBtn').innerHTML;
  function syncAutoBtn() {
    const b = document.getElementById('autoBtn'); const key = autoSpinActive ? String(autoSpinCount) : 'off';
    if (b.dataset.s === key) return; b.dataset.s = key;
    b.innerHTML = autoSpinActive ? '<b class="auto-num">' + autoSpinCount + '</b>' : AUTO_FACE; b.classList.toggle('counting', autoSpinActive);
  }
  setInterval(syncAutoBtn, 150);

  // Relógio (canto superior direito)
  (function () { const c = document.getElementById('clock');
    function t() { const d = new Date(); c.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    t(); setInterval(t, 20000); })();

  (function () {
    function setH() {
      if (!(window.CSS && CSS.supports && CSS.supports('height', '100dvh'))) document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    }
    setH();
    window.addEventListener('resize', setH);
    window.addEventListener('orientationchange', function () { setTimeout(setH, 250); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  })();

  // Loading: pré-carrega imagens, depois "Tocar para jogar" (o toque liberta o áudio no telemóvel)
  (function () {
    const ld = document.getElementById('loading'), fill = document.getElementById('ldFill'), btn = document.getElementById('ldBtn');
    const urls = Object.keys(IMG).map(function (k) { return IMG[k]; }).concat(IMG_UI);
    let done = 0, shown = false;
    function ready() { if (shown) return; shown = true; fill.style.width = '100%'; document.getElementById('ldTxt').style.display = 'none'; btn.style.display = 'block'; }
    function tick() { done++; fill.style.width = Math.round(done / urls.length * 100) + '%'; if (done >= urls.length) setTimeout(ready, 250); }
    urls.forEach(function (u) { const i = new Image(); i.onload = i.onerror = tick; i.src = u; });
    setTimeout(ready, 8000);
    btn.addEventListener('click', function () {
      musicWanted = true; syncMusic(); getAudioContext(); unlockAudio();
      ld.style.opacity = '0'; setTimeout(function () { stopLoadSand(); ld.remove(); resumeGame(); }, 650);
    });
  })();
