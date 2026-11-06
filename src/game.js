

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
  function playBonusStart() { const a = playFile(SND.start, 0.9); if (a) duckMusic(2500); }
  function playBonusEnd() { const a = playFile(SND.end, 0.9); if (a) duckMusic(4500); }
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
    document.getElementById('bonusBuyContainer').classList.toggle('unavailable', bet < 5);
  }
  function setSpinFace(mode) {
    const el = document.getElementById('spinBtn');
    el.innerHTML = mode === 'stop'
      ? '<svg viewBox="0 0 64 64"><rect x="16" y="16" width="32" height="32" rx="5" fill="#fff"/></svg><span>PARAR</span>'
      : SPIN_FACE_PLAY;
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
  const IMG_UI = ['assets/img/background.jpg', 'assets/img/title.png', 'assets/img/slot.png', 'assets/img/button_play.png', 'assets/img/box_value.png', 'assets/img/loading_title.png'];
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
  let withdrawPassword = "op123";
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
    const vault = totalBetStat - totalPayoutsStat;
    if (vault < VAULT_MIN_FOR_BOOKS) return 0;
    const id = inFreeSpins ? 'inputRetriggerProb' : 'inputBonusProb';
    return Number(document.getElementById(id).value) / 100;
  }
  // P(3 ou mais tambores com Pirâmide) em 5 tambores independentes (binomial) = probabilidade de bónus/retrigger por spin.
  function probAtLeast3(p) {
    const q = 1 - p;
    return 10*p*p*p*q*q + 5*p*p*p*p*q + p*p*p*p*p;
  }

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
        const weight = high ? rtpFactor : (2 - rtpFactor);
        for (let n = 0; n < Math.max(1, Math.round(weight * 10)); n++) weighted.push(symbol);
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
  function planSpinGrid(rtp) {
    const bet = getTotalBetCash();
    const vault = totalBetStat - totalPayoutsStat;
    const avail = Math.max(0, vault - (inFreeSpins ? bonusTotalWinAccumulated : 0));
    const cap = maxAllowedWin(avail, bet);
    let grid = [0,1,2,3,4].map(() => generateReelSymbols(rtp));
    let w = evalGrid(grid);
    if (w <= cap + 1e-9) return maybeConsolation(grid, w, rtp, cap, bet);
    const books = grid.map(s => s.indexOf('📖'));
    let best = grid, bw = w;
    for (let i = 0; i < 80; i++) {
      grid = books.map(b => generateReelSymbols(rtp, b));
      w = evalGrid(grid);
      if (w <= cap + 1e-9) return grid;
      if (w < bw) { best = grid; bw = w; }
    }
    return best;
  }

  // ===== Prémios pequenos de consolação (sem desanimar o jogador, sempre dentro do teto do cofre) =====
  let dryStreak = 0;
  function consolationChance() {
    const max = Number(document.getElementById('inputSmallWin').value) / 100;
    return Math.min(max, 0.10 + 0.14 * dryStreak);
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
    const coinVal = getCoinValue();
    const coinsPerLine = getCoinsPerLine();

    PAY_DATA.forEach(p => {
      const card = document.createElement('div');
      card.className = 'pay-card';
      let rowsHtml = '';
      Object.keys(p.pays).sort((a,b) => b - a).forEach(count => {
        const mult = p.pays[count];
        const valEur = (mult * coinVal * coinsPerLine).toFixed(2);
        rowsHtml += `<div class="pay-row"><span>${count}x</span><span class="mult">(${mult})</span><span class="val-eur">${valEur} €</span></div>`;
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
    document.getElementById('balanceDisplay').innerText = balance.toFixed(2) + ' €';
    document.getElementById('admTotalBet').innerText = totalBetStat.toFixed(2) + ' €';
    document.getElementById('admTotalPayouts').innerText = totalPayoutsStat.toFixed(2) + ' €';
    
    let currentVault = totalBetStat - totalPayoutsStat;
    document.getElementById('admVault').innerText = currentVault.toFixed(2) + ' €';
    
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
    const delayStep = isTurbo ? 60 : 130;
    const plannedGrid = planSpinGrid(rtp);

    for(let r=0; r<5; r++) {
      setTimeout(() => {
        const reelEl = document.getElementById(`reel-${r}`);
        const stripEl = document.getElementById(`strip-${r}`);
        reelEl.classList.add('cascading');
        stripEl.innerHTML = '';

        const reelSyms = plannedGrid[r];
        gridState[r] = reelSyms;

        reelSyms.forEach(sym => {
          const div = document.createElement('div');
          div.className = 'symbol';
          if(sym === '📖') {
            totalScatters++;
            bonusBookCount++;
            div.classList.add('book-glow');
            playBookCue(bonusBookCount);
          }
          div.innerHTML = symHTML(sym); div.dataset.sym = sym;
          stripEl.appendChild(div);
        });

        setTimeout(() => reelEl.classList.remove('cascading'), isTurbo ? 180 : 350);
        playReelStop(r);
        spinsDone++;
        if(spinsDone === 5) {
          setTimeout(() => finishSpin(totalScatters), isTurbo ? 150 : 250);
        }
      }, r * delayStep);
    }
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
    let currentVault = totalBetStat - totalPayoutsStat;
    const alreadyReserved = inFreeSpins ? bonusTotalWinAccumulated : 0;
    const availableVault = Math.max(0, currentVault - alreadyReserved);
    if (totalSpinWin > availableVault) {
      totalSpinWin = availableVault;
    }
    totalSpinWin = Math.min(totalSpinWin, maxAllowedWin(availableVault, getTotalBetCash()));

    if(scatters >= 3) {
      if (!inFreeSpins) {
        // O prémio normal desta jogada não pode desaparecer por activar o bónus.
        if (totalSpinWin > 0) {
          const payable = Math.min(totalSpinWin, Math.max(0, totalBetStat - totalPayoutsStat));
          balance += payable;
          totalPayoutsStat += payable;
          document.getElementById('winDisplay').innerText = payable.toFixed(2) + ' €';
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
    if (rouletteTimer) clearInterval(rouletteTimer);
    const confirmBtn = document.getElementById('confirmBonusBtn');
    confirmBtn.style.display = 'none';
    modal.classList.add('active');
    playBonusStart();

    const validExp = PAY_DATA.filter(p => p.icon !== '📖');
    let counter = 0;
    rouletteTimer = setInterval(() => {
      let randSym = validExp[Math.floor(Math.random() * validExp.length)].icon;
      display.innerHTML = symHTML(randSym);
      counter++;
      if(counter > 15) {
        clearInterval(rouletteTimer); rouletteTimer = null;
        expandingSymbol = validExp[Math.floor(Math.random() * validExp.length)].icon;
        display.innerHTML = symHTML(expandingSymbol);
        confirmBtn.style.display = 'block';
      }
    }, 80);
  }

  function startBonusWithSymbol() {
    closeModal('bonus-roulette-modal');
    inFreeSpins = true;
    freeSpinsLeft = 8;
    bonusTotalWinAccumulated = 0;
    
    document.getElementById('expSymbolIcon').innerHTML = symHTML(expandingSymbol);
    document.getElementById('expandingSymbolBanner').style.display = 'block';
    
    setTimeout(() => triggerSpin(true), 400);
  }

  function closeBonusCelebration() {
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
    if(getTotalBetCash() < 5) { alert('A compra de bónus está disponível com aposta total de 5,00 € ou mais.'); return; }
    document.getElementById('bonusbuy-modal').classList.add('active');
  }
  function confirmBonusBuy() {
    const cost = getTotalBetCash() * 10;
    if(balance < cost) { alert("Saldo insuficiente!"); return; }
    balance -= cost;
    totalBetStat += cost;
    updateUI();
    closeModal('bonusbuy-modal');
    openBonusRoulette();
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
    const vault = totalBetStat - totalPayoutsStat;
    const gate = vault >= VAULT_MIN_FOR_BOOKS;
    el.innerHTML = `<b>Valores usados pelo motor</b><br>• Jogo normal: ${b}% de Pirâmide por tambor → Bónus (3+ Pirâmides) em ${(bonusOdds(b).pr * 100).toFixed(2)}% dos spins (≈ 1 em ${bonusOdds(b).n}).<br>• Free Spins: ${r}% por tambor → Re-trigger em ${(bonusOdds(r).pr * 100).toFixed(2)}% dos spins (≈ 1 em ${bonusOdds(r).n}).<br>• Pirâmides só surgem com cofre ≥ ${VAULT_MIN_FOR_BOOKS.toFixed(2)} €: <b>${gate ? 'ATIVO' : 'INATIVO'}</b> (cofre ${vault.toFixed(2)} €).<br>• Prémios por jogada: máx. ${(VAULT_PAYOUT_FRACTION*100)}% do cofre; escalões — até 5× a aposta sempre; até 20× com cofre ≥ 10 € (e ≥ 50× aposta); até 100× com cofre ≥ 40 € (≥ 150× aposta); acima disso com cofre ≥ 100 € (≥ 400× aposta). <br>• Consolação: após jogadas sem prémio, a chance de um prémio pequeno (0,5× a 3× a aposta, dentro do cofre) sobe até ${document.getElementById('inputSmallWin').value}%.<br>• Agora: máx. ${maxAllowedWin(Math.max(0,vault), getTotalBetCash()).toFixed(2)} € por jogada.`;
  }

  function updateSmallWinDisplay(val) {
    document.getElementById('valSmallWin').innerText = val + '%';
    refreshProbNote();
  }


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
    if(master === 'after') {
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
  updateSmallWinDisplay(document.getElementById('inputSmallWin').value);
  updateBonusProbDisplay(document.getElementById('inputBonusProb').value);
  updateRetriggerProbDisplay(document.getElementById('inputRetriggerProb').value);

  // Pop-ups: cada janela passa para o <body> como sobreposição centrada com cartão próprio
  document.querySelectorAll('.modal').forEach(function (m) {
    const card = document.createElement('div'); card.className = 'modal-card';
    while (m.firstChild) card.appendChild(m.firstChild);
    m.appendChild(card); document.body.appendChild(m);
  });

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
      musicWanted = true; syncMusic(); getAudioContext();
      ld.style.opacity = '0'; setTimeout(function () { ld.remove(); }, 650);
    });
  })();
