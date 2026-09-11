(() => {
  "use strict";

  const SIZE = 10;
  const SHIPS = [
    { name: "Carrier", size: 5 },
    { name: "Battleship", size: 4 },
    { name: "Cruiser", size: 3 },
    { name: "Submarine", size: 3 },
    { name: "Destroyer", size: 2 },
  ];
  const COLS = "ABCDEFGHIJ";

  // ---------- Board model ----------
  class Board {
    constructor() {
      this.ships = []; // { name, size, cells: [{r,c}], hits: Set }
      this.shipAt = new Map(); // key -> ship
      this.shots = new Map(); // key -> "hit" | "miss"
    }
    static key(r, c) { return r * SIZE + c; }
    static inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

    cellsFor(r, c, size, horizontal) {
      const cells = [];
      for (let i = 0; i < size; i++) {
        const rr = horizontal ? r : r + i;
        const cc = horizontal ? c + i : c;
        cells.push({ r: rr, c: cc });
      }
      return cells;
    }
    canPlace(cells) {
      return cells.every(({ r, c }) => Board.inBounds(r, c) && !this.shipAt.has(Board.key(r, c)));
    }
    place(def, cells) {
      const ship = { name: def.name, size: def.size, cells, hits: new Set() };
      cells.forEach(({ r, c }) => this.shipAt.set(Board.key(r, c), ship));
      this.ships.push(ship);
      return ship;
    }
    removeLast() {
      const ship = this.ships.pop();
      if (ship) ship.cells.forEach(({ r, c }) => this.shipAt.delete(Board.key(r, c)));
      return ship;
    }
    reset() {
      this.ships = [];
      this.shipAt.clear();
      this.shots.clear();
    }
    randomize() {
      this.reset();
      for (const def of SHIPS) {
        for (let tries = 0; tries < 1000; tries++) {
          const horizontal = Math.random() < 0.5;
          const r = Math.floor(Math.random() * SIZE);
          const c = Math.floor(Math.random() * SIZE);
          const cells = this.cellsFor(r, c, def.size, horizontal);
          if (this.canPlace(cells)) { this.place(def, cells); break; }
        }
      }
    }
    fire(r, c) {
      const k = Board.key(r, c);
      if (this.shots.has(k)) return null;
      const ship = this.shipAt.get(k);
      if (ship) {
        ship.hits.add(k);
        this.shots.set(k, "hit");
        const sunk = ship.hits.size === ship.size;
        return { result: "hit", ship, sunk };
      }
      this.shots.set(k, "miss");
      return { result: "miss", ship: null, sunk: false };
    }
    allSunk() { return this.ships.length === SHIPS.length && this.ships.every((s) => s.hits.size === s.size); }
    remainingSizes() { return this.ships.filter((s) => s.hits.size < s.size).map((s) => s.size); }
  }

  // ---------- AI ----------
  class AI {
    constructor(difficulty) {
      this.difficulty = difficulty;
      this.targets = []; // stack of candidate cells after a hit
      this.hitsOnCurrent = []; // unsunk hits, used to infer direction
    }
    chooseShot(board) {
      if (this.difficulty === "easy") return this.randomShot(board);
      // target mode
      this.targets = this.targets.filter(({ r, c }) => !board.shots.has(Board.key(r, c)));
      if (this.targets.length) return this.targets.pop();
      if (this.difficulty === "hard") return this.parityShot(board);
      return this.randomShot(board);
    }
    randomShot(board, filter = () => true) {
      const open = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if (!board.shots.has(Board.key(r, c)) && filter(r, c)) open.push({ r, c });
      }
      return open[Math.floor(Math.random() * open.length)];
    }
    parityShot(board) {
      // Smallest unsunk ship determines the search stride; parity search guarantees coverage.
      const minSize = Math.min(...board.remainingSizes());
      const stride = Math.max(2, Math.min(minSize, 3));
      // Prefer cells that could actually fit the smallest remaining ship.
      const fits = (r, c) => {
        const free = (rr, cc) => Board.inBounds(rr, cc) && board.shots.get(Board.key(rr, cc)) !== "miss";
        let h = 0, v = 0;
        for (let d = -minSize + 1; d <= 0; d++) {
          let ok = true;
          for (let i = 0; i < minSize; i++) if (!free(r, c + d + i)) { ok = false; break; }
          if (ok) h++;
          ok = true;
          for (let i = 0; i < minSize; i++) if (!free(r + d + i, c)) { ok = false; break; }
          if (ok) v++;
        }
        return h + v > 0;
      };
      return (
        this.randomShot(board, (r, c) => (r + c) % stride === 0 && fits(r, c)) ||
        this.randomShot(board, fits) ||
        this.randomShot(board)
      );
    }
    notify(shot, outcome, board) {
      if (outcome.result !== "hit") return;
      if (outcome.sunk) {
        const sunkKeys = new Set(outcome.ship.cells.map(({ r, c }) => Board.key(r, c)));
        this.hitsOnCurrent = this.hitsOnCurrent.filter((h) => !sunkKeys.has(Board.key(h.r, h.c)));
        this.targets = [];
        // If other unsunk hits remain, re-target around them.
        for (const h of this.hitsOnCurrent) this.pushNeighbours(h, board);
        return;
      }
      this.hitsOnCurrent.push(shot);
      // Infer orientation from two aligned hits and prioritise line extension.
      const aligned = this.hitsOnCurrent.filter((h) => h.r === shot.r || h.c === shot.c);
      if (aligned.length >= 2 && this.difficulty === "hard") {
        const horizontal = aligned.every((h) => h.r === shot.r);
        const line = aligned.filter((h) => (horizontal ? h.r === shot.r : h.c === shot.c));
        const coords = line.map((h) => (horizontal ? h.c : h.r));
        const lo = Math.min(...coords) - 1;
        const hi = Math.max(...coords) + 1;
        this.targets = [];
        const ends = horizontal ? [{ r: shot.r, c: lo }, { r: shot.r, c: hi }] : [{ r: lo, c: shot.c }, { r: hi, c: shot.c }];
        for (const e of ends) if (Board.inBounds(e.r, e.c) && !board.shots.has(Board.key(e.r, e.c))) this.targets.push(e);
        // Fallback neighbours in case the line guess is wrong (ships touching).
        this.pushNeighbours(shot, board, true);
        return;
      }
      this.pushNeighbours(shot, board);
    }
    pushNeighbours({ r, c }, board, atBottom = false) {
      const ns = [
        { r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 },
      ].filter((n) => Board.inBounds(n.r, n.c) && !board.shots.has(Board.key(n.r, n.c)));
      ns.sort(() => Math.random() - 0.5);
      if (atBottom) this.targets.unshift(...ns); else this.targets.push(...ns);
    }
  }

  // ---------- Game state ----------
  const state = {
    phase: "placement", // placement | battle | over
    player: new Board(),
    enemy: new Board(),
    ai: null,
    placeIndex: 0,
    horizontal: true,
    playerShots: 0, playerHits: 0, aiShots: 0, aiHits: 0,
    busy: false,
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    status: $("status"),
    placementPanel: $("placementPanel"),
    currentShipName: $("currentShipName"),
    currentShipSize: $("currentShipSize"),
    orientationLabel: $("orientationLabel"),
    rotateBtn: $("rotateBtn"),
    randomBtn: $("randomBtn"),
    undoBtn: $("undoBtn"),
    startBtn: $("startBtn"),
    newGameBtn: $("newGameBtn"),
    rulesBtn: $("rulesBtn"),
    rulesModal: $("rulesModal"),
    closeRules: $("closeRules"),
    gotItBtn: $("gotItBtn"),
    playerBoard: $("playerBoard"),
    enemyBoard: $("enemyBoard"),
    playerFleet: $("playerFleet"),
    enemyFleet: $("enemyFleet"),
    difficulty: $("difficulty"),
    playerShots: $("playerShots"), playerHits: $("playerHits"),
    aiShots: $("aiShots"), aiHits: $("aiHits"),
  };

  function buildLabels() {
    for (const id of ["playerColLabels", "enemyColLabels"]) {
      $(id).innerHTML = COLS.split("").map((l) => `<span>${l}</span>`).join("");
    }
    for (const id of ["playerRowLabels", "enemyRowLabels"]) {
      $(id).innerHTML = Array.from({ length: SIZE }, (_, i) => `<span>${i + 1}</span>`).join("");
    }
  }

  function buildGrid(el) {
    el.innerHTML = "";
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      d.dataset.r = r;
      d.dataset.c = c;
      d.setAttribute("role", "gridcell");
      d.setAttribute("aria-label", `${COLS[c]}${r + 1}`);
      el.appendChild(d);
    }
  }

  function cellEl(boardEl, r, c) { return boardEl.children[r * SIZE + c]; }

  function renderBoard(boardEl, board, { revealShips }) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const el = cellEl(boardEl, r, c);
      const k = Board.key(r, c);
      const ship = board.shipAt.get(k);
      const shot = board.shots.get(k);
      el.className = "cell";
      if (!shot) el.classList.add("unknown");
      if (ship && (revealShips || (ship.hits.size === ship.size))) el.classList.add("ship");
      if (shot === "miss") el.classList.add("miss");
      if (shot === "hit") {
        el.classList.add("hit");
        if (ship.hits.size === ship.size) el.classList.add("sunk");
      }
    }
  }

  function renderFleet(listEl, board) {
    listEl.innerHTML = SHIPS.map((def) => {
      const ship = board.ships.find((s) => s.name === def.name);
      const hits = ship ? ship.hits.size : 0;
      const sunk = ship && hits === def.size;
      const pips = Array.from({ length: def.size }, (_, i) => `<span class="pip${i < hits ? " hit" : ""}"></span>`).join("");
      return `<li class="${sunk ? "sunk" : ""}"><span class="pips">${pips}</span>${def.name}</li>`;
    }).join("");
  }

  function renderAll() {
    renderBoard(els.playerBoard, state.player, { revealShips: true });
    renderBoard(els.enemyBoard, state.enemy, { revealShips: state.phase === "over" });
    renderFleet(els.playerFleet, state.player);
    renderFleet(els.enemyFleet, state.enemy);
    els.playerShots.textContent = state.playerShots;
    els.playerHits.textContent = state.playerHits;
    els.aiShots.textContent = state.aiShots;
    els.aiHits.textContent = state.aiHits;
    els.playerBoard.classList.toggle("placing", state.phase === "placement");
    els.placementPanel.classList.toggle("hidden", state.phase !== "placement");
    els.difficulty.disabled = state.phase !== "placement";
    updatePlacementPanel();
  }

  function setStatus(msg, cls = "") {
    els.status.textContent = msg;
    els.status.className = `status ${cls}`.trim();
  }

  function coordName(r, c) { return `${COLS[c]}${r + 1}`; }

  // ---------- Placement ----------
  function updatePlacementPanel() {
    const def = SHIPS[state.placeIndex];
    if (def) {
      els.currentShipName.textContent = def.name;
      els.currentShipSize.textContent = def.size;
    } else {
      els.currentShipName.textContent = "All ships placed";
      els.currentShipSize.textContent = "0";
    }
    els.orientationLabel.textContent = state.horizontal ? "Horizontal" : "Vertical";
    els.startBtn.disabled = state.player.ships.length !== SHIPS.length;
    els.undoBtn.disabled = state.player.ships.length === 0;
    els.rotateBtn.disabled = !def;
  }

  function clearPreview() {
    els.playerBoard.querySelectorAll(".preview").forEach((el) => el.classList.remove("preview", "invalid"));
  }

  function showPreview(r, c) {
    clearPreview();
    const def = SHIPS[state.placeIndex];
    if (!def) return;
    const cells = state.player.cellsFor(r, c, def.size, state.horizontal);
    const ok = state.player.canPlace(cells);
    for (const cell of cells) {
      if (!Board.inBounds(cell.r, cell.c)) continue;
      const el = cellEl(els.playerBoard, cell.r, cell.c);
      el.classList.add("preview");
      if (!ok) el.classList.add("invalid");
    }
  }

  function placeAt(r, c) {
    const def = SHIPS[state.placeIndex];
    if (!def) return;
    const cells = state.player.cellsFor(r, c, def.size, state.horizontal);
    if (!state.player.canPlace(cells)) {
      setStatus(`${def.name} doesn't fit there — try another square or rotate.`);
      return;
    }
    state.player.place(def, cells);
    state.placeIndex++;
    clearPreview();
    renderAll();
    if (state.placeIndex >= SHIPS.length) setStatus("Fleet ready! Press Start Battle.");
    else setStatus(`Placed ${def.name}. Now place your ${SHIPS[state.placeIndex].name}.`);
  }

  // ---------- Battle ----------
  function startBattle() {
    if (state.player.ships.length !== SHIPS.length) return;
    state.enemy.randomize();
    state.ai = new AI(els.difficulty.value);
    state.phase = "battle";
    renderAll();
    setStatus("Battle begins! Click a square on Enemy Waters to fire.");
  }

  function markLastShot(boardEl, r, c) {
    boardEl.querySelectorAll(".last-shot").forEach((el) => el.classList.remove("last-shot"));
    cellEl(boardEl, r, c).classList.add("last-shot");
  }

  function playerFire(r, c) {
    if (state.phase !== "battle" || state.busy) return;
    const out = state.enemy.fire(r, c);
    if (!out) { setStatus("You already fired there. Pick another square."); return; }
    state.playerShots++;
    let msg;
    if (out.result === "hit") {
      state.playerHits++;
      msg = out.sunk ? `💥 You sank the enemy ${out.ship.name}!` : `🔴 Hit at ${coordName(r, c)}!`;
    } else {
      msg = `⚪ Miss at ${coordName(r, c)}.`;
    }
    renderAll();
    markLastShot(els.enemyBoard, r, c);
    if (state.enemy.allSunk()) return endGame(true);
    setStatus(`${msg} AI is firing…`);
    state.busy = true;
    setTimeout(() => aiTurn(msg), 650);
  }

  function aiTurn(prevMsg) {
    const shot = state.ai.chooseShot(state.player);
    const out = state.player.fire(shot.r, shot.c);
    state.aiShots++;
    let aiMsg;
    if (out.result === "hit") {
      state.aiHits++;
      aiMsg = out.sunk ? `AI sank your ${out.ship.name}!` : `AI hit your ship at ${coordName(shot.r, shot.c)}.`;
    } else {
      aiMsg = `AI missed at ${coordName(shot.r, shot.c)}.`;
    }
    state.ai.notify(shot, out, state.player);
    renderAll();
    markLastShot(els.playerBoard, shot.r, shot.c);
    state.busy = false;
    if (state.player.allSunk()) return endGame(false);
    setStatus(`${prevMsg} ${aiMsg} Your turn.`);
  }

  function endGame(playerWon) {
    state.phase = "over";
    state.busy = false;
    renderAll();
    if (playerWon) {
      setStatus(`🏆 Victory! You sank the entire enemy fleet in ${state.playerShots} shots. Press New Game to play again.`, "win");
    } else {
      setStatus(`☠️ Defeat — the AI sank your fleet in ${state.aiShots} shots. Enemy ships are revealed. Press New Game for a rematch.`, "lose");
    }
  }

  function newGame() {
    state.phase = "placement";
    state.player.reset();
    state.enemy.reset();
    state.ai = null;
    state.placeIndex = 0;
    state.horizontal = true;
    state.playerShots = state.playerHits = state.aiShots = state.aiHits = 0;
    state.busy = false;
    els.playerBoard.querySelectorAll(".last-shot").forEach((el) => el.classList.remove("last-shot"));
    renderAll();
    setStatus("Place your ships to begin — or click Random Placement.");
  }

  // ---------- Events ----------
  els.playerBoard.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || state.phase !== "placement") return;
    placeAt(+cell.dataset.r, +cell.dataset.c);
  });
  els.playerBoard.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || state.phase !== "placement") return;
    showPreview(+cell.dataset.r, +cell.dataset.c);
  });
  els.playerBoard.addEventListener("mouseleave", clearPreview);

  els.enemyBoard.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    if (state.phase === "placement") { setStatus("Finish placing your ships first, then press Start Battle."); return; }
    playerFire(+cell.dataset.r, +cell.dataset.c);
  });

  els.rotateBtn.addEventListener("click", () => { state.horizontal = !state.horizontal; updatePlacementPanel(); });
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r" && state.phase === "placement" && !els.rulesModal.classList.contains("open")) {
      state.horizontal = !state.horizontal;
      updatePlacementPanel();
    }
    if (e.key === "Escape") closeRules();
  });
  els.randomBtn.addEventListener("click", () => {
    state.player.randomize();
    state.placeIndex = SHIPS.length;
    renderAll();
    setStatus("Fleet placed randomly. Press Start Battle (or Undo to adjust).");
  });
  els.undoBtn.addEventListener("click", () => {
    if (state.player.removeLast()) {
      state.placeIndex = state.player.ships.length;
      renderAll();
      setStatus(`Removed. Place your ${SHIPS[state.placeIndex].name}.`);
    }
  });
  els.startBtn.addEventListener("click", startBattle);
  els.newGameBtn.addEventListener("click", newGame);

  function openRules() { els.rulesModal.classList.add("open"); }
  function closeRules() { els.rulesModal.classList.remove("open"); }
  els.rulesBtn.addEventListener("click", openRules);
  els.closeRules.addEventListener("click", closeRules);
  els.gotItBtn.addEventListener("click", () => {
    closeRules();
    try { localStorage.setItem("battleship-rules-seen", "1"); } catch (_) { /* ignore */ }
  });
  els.rulesModal.addEventListener("click", (e) => { if (e.target === els.rulesModal) closeRules(); });

  // ---------- Init ----------
  buildLabels();
  buildGrid(els.playerBoard);
  buildGrid(els.enemyBoard);
  newGame();
  let seen = false;
  try { seen = localStorage.getItem("battleship-rules-seen") === "1"; } catch (_) { /* ignore */ }
  if (!seen) openRules();
})();
