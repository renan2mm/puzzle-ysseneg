import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================
// CONFIG
// ==========================
const CONFIG = {
  title: "Jigsaw Ysseneg",
  totalLevels: 10,
  levels: [5,6,7,8,9,10,11,12,13,14],

  assets: {
    profileBase: "assets/profile",
    backgroundBase: "assets/background",
    victoryBase: "assets/victory",
    levelBase: "assets/level"
  },

  exts: {
    image: ["jpg","jpeg","png","webp"],
    gifFirst: ["gif","webp","png","jpg","jpeg"]
  },

  maxBox: 800
};

// ==========================
// FIREBASE
// PREENCHA COM OS DADOS DO SEU PROJETO
// ==========================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCSKloA3GOilGlPOiCxdCYDB72Q-xYnStc",
  authDomain: "jigsaw-ysseneg.firebaseapp.com",
  projectId: "jigsaw-ysseneg",
  storageBucket: "jigsaw-ysseneg.firebasestorage.app",
  messagingSenderId: "343706626582",
  appId: "1:343706626582:web:9d64db86cf2423848e6337"
};


const hasFirebaseConfig =
  FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.apiKey !== "COLOQUE_AQUI" &&
  FIREBASE_CONFIG.projectId &&
  FIREBASE_CONFIG.projectId !== "COLOQUE_AQUI";

let app = null;
let auth = null;
let db = null;

if (hasFirebaseConfig) {
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  console.warn("Firebase não configurado. O modo solo funciona; o multiplayer não.");
}

// ==========================
// ESTADO GLOBAL
// ==========================
let currentLevel = 1;
let gridSize = CONFIG.levels[0];
let unlockedLevel = 1;

const imageCache = new Map();
const tileElements = new Map();

const state = {
  mode: "solo", // solo | create-room | room
  soloBoard: null, // piecePositions[pieceId] = currentPosition
  firstSelected: null, // pieceId
  roomId: null,
  roomUnsub: null,
  roomData: null,
  user: null,
  boardBuiltForLevel: null,
  currentBoardImageSrc: null
};

// ==========================
// NAVEGAÇÃO
// ==========================
function goToLevels(mode = "solo") {
  state.mode = mode;
  updateLevelScreenTitle();

  document.getElementById("startScreen").classList.remove("active");
  document.getElementById("levelScreen").classList.add("active");
  generateLevels();
}

function goBack() {
  document.getElementById("levelScreen").classList.remove("active");
  document.getElementById("startScreen").classList.add("active");
}

function openGameScreen() {
  document.getElementById("levelScreen").classList.remove("active");
  document.getElementById("startScreen").classList.remove("active");
  document.getElementById("gameScreen").classList.add("active");
}

function backToLevels() {
  const victory = document.getElementById("victoryScreen");
  if (victory) victory.style.display = "none";

  clearRoomSubscription();
  state.firstSelected = null;
  state.roomId = null;
  state.roomData = null;

  document.getElementById("gameScreen").classList.remove("active");
  document.getElementById("levelScreen").classList.add("active");

  if (state.mode === "room") {
    state.mode = "solo";
  }

  updateRoomPanel();
  updateLevelScreenTitle();
  generateLevels();
}

function updateLevelScreenTitle() {
  const el = document.getElementById("levelScreenTitle");
  if (!el) return;

  if (state.mode === "create-room") {
    el.innerText = "Escolha o Nível da Sala";
  } else {
    el.innerText = "Escolha o Nível";
  }
}

// ==========================
// LOADER DE ASSETS
// ==========================
function loadImageTryExts(basePath, exts){
  const cacheKey = basePath + "|" + exts.join(",");
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const p = new Promise((resolve, reject) => {
    let i = 0;

    const tryNext = () => {
      if (i >= exts.length) {
        reject(new Error("Asset não encontrado: " + basePath + ".{" + exts.join(",") + "}"));
        return;
      }

      const src = basePath + "." + exts[i++];
      const img = new Image();
      img.onload = () => resolve({ img, src });
      img.onerror = tryNext;
      img.src = src;
    };

    tryNext();
  });

  imageCache.set(cacheKey, p);
  return p;
}

async function applyBackground(){
  try{
    const { src } = await loadImageTryExts(CONFIG.assets.backgroundBase, CONFIG.exts.image);
    document.body.style.backgroundImage = `url(${src})`;
  }catch(e){
    console.warn(e.message);
  }
}

async function loadProfileImage(){
  const el = document.getElementById("profileImage");
  try{
    const { src } = await loadImageTryExts(CONFIG.assets.profileBase, CONFIG.exts.image);
    el.src = src;
  }catch(e){
    el.removeAttribute("src");
    console.warn(e.message);
  }
}

async function loadVictoryGif(){
  const el = document.getElementById("victoryGif");
  try{
    const { src } = await loadImageTryExts(CONFIG.assets.victoryBase, CONFIG.exts.gifFirst);
    el.src = src;
  }catch(e){
    el.removeAttribute("src");
    console.warn(e.message);
  }
}

function levelBasePath(level){
  return CONFIG.assets.levelBase + String(level);
}

// ==========================
// AUTH
// ==========================
if (auth) {
  onAuthStateChanged(auth, (user) => {
    state.user = user || null;
    updateAuthInfo();
    updatePlayerHint();
  });
} else {
  updateAuthInfo();
}

async function ensureAuth() {
  if (!auth) {
    alert("Você precisa configurar o Firebase primeiro para usar multiplayer.");
    return null;
  }

  if (state.user) return state.user;

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  state.user = result.user;
  updateAuthInfo();
  updatePlayerHint();
  return result.user;
}

function updateAuthInfo() {
  const el = document.getElementById("authInfo");
  if (!el) return;

  if (!hasFirebaseConfig) {
    el.innerText = "Modo solo disponível. Para o multiplayer, preencha o firebaseConfig no script.js.";
    return;
  }

  if (state.user) {
    el.innerText = `Logado como ${state.user.displayName || state.user.email || "jogador"}.`;
  } else {
    el.innerText = "O login Google será pedido apenas ao criar ou entrar em uma sala.";
  }
}

// ==========================
// NÍVEIS
// ==========================
function generateLevels() {
  const container = document.getElementById("levelsContainer");
  container.innerHTML = "";

  CONFIG.levels.forEach((size, index) => {
    const lvl = index + 1;

    const btn = document.createElement("button");
    btn.innerText = `Nível ${lvl}`;
    btn.disabled = lvl > unlockedLevel;
    btn.onclick = () => startLevel(lvl);
    container.appendChild(btn);
  });
}

async function startLevel(level) {
  currentLevel = level;
  gridSize = CONFIG.levels[level - 1];

  if (state.mode === "create-room") {
    await createRoom(level);
    return;
  }

  await startSoloLevel(level);
}

async function startSoloLevel(level) {
  currentLevel = level;
  gridSize = CONFIG.levels[level - 1];
  state.mode = "solo";
  state.roomId = null;
  state.roomData = null;
  state.firstSelected = null;

  openGameScreen();
  updateRoomPanel();
  await loadProfileImage();
  await buildBoardUI(currentLevel);

  state.soloBoard = createShuffledPiecePositions(gridSize * gridSize);
  applyBoardState(state.soloBoard, {});
  updatePlayerHint();
}

// ==========================
// BOARD
// ==========================
function createShuffledPiecePositions(totalPieces) {
  const shuffled = [];
  for (let i = 0; i < totalPieces; i++) shuffled.push(i);

  shuffle(shuffled);
  while (shuffled.every((v, i) => v === i)) shuffle(shuffled);

  const piecePositions = new Array(totalPieces);
  shuffled.forEach((pieceId, position) => {
    piecePositions[pieceId] = position;
  });

  return piecePositions;
}

async function buildBoardUI(level) {
  const container = document.getElementById("puzzleContainer");
  container.innerHTML = "";
  tileElements.clear();

  let imgObj;
  try{
    imgObj = await loadImageTryExts(levelBasePath(level), CONFIG.exts.image);
  }catch(e){
    container.style.width = "auto";
    container.style.height = "auto";
    container.style.display = "block";
    container.style.padding = "18px";
    container.innerHTML = `<div style="max-width:720px;margin:0 auto;line-height:1.35;opacity:.9;">
      <b>Não encontrei a imagem do nível ${level}</b>.<br>
      Coloque em <code>assets/</code> um arquivo chamado <code>level${level}.jpg</code> (ou png/webp/jpeg).<br>
      Exemplo: <code>${levelBasePath(level)}.jpg</code>
    </div>`;
    console.warn(e.message);
    return;
  }

  state.boardBuiltForLevel = level;
  state.currentBoardImageSrc = imgObj.src;

  const image = imgObj.img;
  const ratio = image.width / image.height;
  let width = CONFIG.maxBox;
  let height = CONFIG.maxBox;

  if (ratio > 1) height = CONFIG.maxBox / ratio;
  else width = CONFIG.maxBox * ratio;

  container.style.display = "grid";
  container.style.padding = "0";
  container.style.width = width + "px";
  container.style.height = height + "px";
  container.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
  container.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;

  const totalPieces = gridSize * gridSize;

  for (let pieceId = 0; pieceId < totalPieces; pieceId++) {
    const tile = document.createElement("div");
    tile.classList.add("tile");
    tile.dataset.correct = pieceId;
    tile.dataset.current = pieceId;

    const x = pieceId % gridSize;
    const y = Math.floor(pieceId / gridSize);

    tile.style.backgroundImage = `url(${imgObj.src})`;
    tile.style.backgroundSize = `${gridSize * 100}% ${gridSize * 100}%`;
    tile.style.backgroundPosition =
      `${x * (100 / (gridSize - 1))}% ${y * (100 / (gridSize - 1))}%`;

    tile.onclick = () => handleTileClick(pieceId);

    tile.addEventListener("mouseenter", () => {
      tile.classList.remove("correct-hover", "wrong-hover");
      if (tile.dataset.current === tile.dataset.correct) {
        tile.classList.add("correct-hover");
      } else {
        tile.classList.add("wrong-hover");
      }
    });

    tile.addEventListener("mouseleave", () => {
      tile.classList.remove("correct-hover");
      tile.classList.remove("wrong-hover");
    });

    tileElements.set(pieceId, tile);
    container.appendChild(tile);
  }
}

function applyBoardState(piecePositions, locks = {}) {
  tileElements.forEach((tile, pieceId) => {
    const currentPosition = piecePositions[pieceId];
    tile.dataset.current = String(currentPosition);
    tile.style.order = currentPosition;

    tile.classList.remove("selected", "locked-by-me", "locked-by-other");

    const lockedBy = locks[pieceId];
    if (lockedBy) {
      if (state.user && lockedBy === state.user.uid) {
        tile.classList.add("locked-by-me");
      } else {
        tile.classList.add("locked-by-other");
      }
    }

    if (state.firstSelected === pieceId) {
      tile.classList.add("selected");
    }

    updateHoverState(tile);
  });
}

function updateHoverState(tile) {
  tile.classList.remove("correct-hover", "wrong-hover");
  if (tile.matches(":hover")) {
    if (tile.dataset.current === tile.dataset.correct) {
      tile.classList.add("correct-hover");
    } else {
      tile.classList.add("wrong-hover");
    }
  }
}

function isSolved(piecePositions) {
  return piecePositions.every((position, pieceId) => position === pieceId);
}

// ==========================
// CLIQUES NAS PEÇAS
// ==========================
async function handleTileClick(pieceId) {
  if (state.mode === "room") {
    await handleRoomTileClick(pieceId);
    return;
  }

  handleSoloTileClick(pieceId);
}

function handleSoloTileClick(pieceId) {
  if (state.firstSelected === null) {
    state.firstSelected = pieceId;
    applyBoardState(state.soloBoard, {});
    updatePlayerHint();
    return;
  }

  if (state.firstSelected === pieceId) {
    state.firstSelected = null;
    applyBoardState(state.soloBoard, {});
    updatePlayerHint();
    return;
  }

  swapPositions(state.soloBoard, state.firstSelected, pieceId);
  state.firstSelected = null;
  applyBoardState(state.soloBoard, {});
  updatePlayerHint();

  if (isSolved(state.soloBoard)) {
    showVictory("solo");
  }
}

async function handleRoomTileClick(pieceId) {
  if (!state.roomId || !state.roomData || !state.user) return;

  const locks = state.roomData.board?.locks || {};
  const lockedBy = locks[pieceId];

  if (lockedBy && lockedBy !== state.user.uid) {
    return;
  }

  if (state.firstSelected === null) {
    const ok = await roomTryPick(pieceId);
    if (ok) {
      state.firstSelected = pieceId;
      updatePlayerHint();
    }
    return;
  }

  if (state.firstSelected === pieceId) {
    await roomReleasePiece(pieceId);
    state.firstSelected = null;
    updatePlayerHint();
    return;
  }

  const ok = await roomTrySwap(state.firstSelected, pieceId);
  if (ok) {
    state.firstSelected = null;
    updatePlayerHint();
  }
}

function swapPositions(piecePositions, pieceA, pieceB) {
  const temp = piecePositions[pieceA];
  piecePositions[pieceA] = piecePositions[pieceB];
  piecePositions[pieceB] = temp;
}

// ==========================
// MULTIPLAYER
// ==========================
function roomRef(roomId) {
  return doc(db, "puzzleRooms", roomId);
}

async function createRoom(level) {
  const user = await ensureAuth();
  if (!user) return;

  currentLevel = level;
  gridSize = CONFIG.levels[level - 1];

  const roomId = generateRoomCode();
  const piecePositions = createShuffledPiecePositions(gridSize * gridSize);

  await setDoc(roomRef(roomId), {
    roomId,
    level,
    gridSize,
    status: "playing",
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    playerIds: [user.uid],
    playerNames: {
      [user.uid]: user.displayName || user.email || "Jogador"
    },
    board: {
      piecePositions,
      locks: {}
    }
  });

  state.mode = "room";
  state.roomId = roomId;
  currentLevel = level;
  gridSize = CONFIG.levels[level - 1];

  openGameScreen();
  updateRoomPanel();
  await loadProfileImage();
  await buildBoardUI(level);
  subscribeToRoom(roomId);
}

async function joinRoom() {
  const codeInput = document.getElementById("roomCodeInput");
  const roomId = (codeInput.value || "").trim().toUpperCase();

  if (!roomId) {
    alert("Digite o código da sala.");
    return;
  }

  if (!hasFirebaseConfig) {
    alert("Preencha o firebaseConfig no script.js para usar o multiplayer.");
    return;
  }

  const user = await ensureAuth();
  if (!user) return;

  const snap = await getDoc(roomRef(roomId));
  if (!snap.exists()) {
    alert("Sala não encontrada.");
    return;
  }

  const data = snap.data();

  await updateDoc(roomRef(roomId), {
    playerIds: arrayUnion(user.uid),
    [`playerNames.${user.uid}`]: user.displayName || user.email || "Jogador",
    updatedAt: serverTimestamp()
  });

  state.mode = "room";
  state.roomId = roomId;
  currentLevel = data.level;
  gridSize = data.gridSize;
  state.firstSelected = null;

  openGameScreen();
  updateRoomPanel();
  await loadProfileImage();
  await buildBoardUI(currentLevel);
  subscribeToRoom(roomId);
}

function subscribeToRoom(roomId) {
  clearRoomSubscription();

  state.roomUnsub = onSnapshot(roomRef(roomId), async (snap) => {
    if (!snap.exists()) {
      alert("A sala foi removida.");
      backToLevels();
      return;
    }

    const data = snap.data();
    state.roomData = data;
    currentLevel = data.level;
    gridSize = data.gridSize;

    if (state.boardBuiltForLevel !== data.level) {
      await buildBoardUI(data.level);
    }

    applyBoardState(data.board.piecePositions, data.board.locks || {});
    updateRoomPanel();
    updatePlayerHint();

    if (data.status === "complete") {
      showVictory("room", data.completedByName || "Sala concluída!");
    } else {
      document.getElementById("victoryScreen").style.display = "none";
    }
  });
}

function clearRoomSubscription() {
  if (state.roomUnsub) {
    state.roomUnsub();
    state.roomUnsub = null;
  }
}

async function roomTryPick(pieceId) {
  try {
    await runTransaction(db, async (transaction) => {
      const ref = roomRef(state.roomId);
      const snap = await transaction.get(ref);

      if (!snap.exists()) throw new Error("Sala inexistente.");

      const data = snap.data();
      if (data.status === "complete") throw new Error("A sala já terminou.");

      const board = data.board || {};
      const locks = { ...(board.locks || {}) };

      if (locks[pieceId] && locks[pieceId] !== state.user.uid) {
        throw new Error("Peça em uso.");
      }

      locks[pieceId] = state.user.uid;

      transaction.update(ref, {
        board: {
          piecePositions: [...board.piecePositions],
          locks
        },
        updatedAt: serverTimestamp()
      });
    });

    return true;
  } catch (e) {
    console.warn(e.message);
    return false;
  }
}

async function roomReleasePiece(pieceId) {
  try {
    await runTransaction(db, async (transaction) => {
      const ref = roomRef(state.roomId);
      const snap = await transaction.get(ref);

      if (!snap.exists()) throw new Error("Sala inexistente.");

      const data = snap.data();
      const board = data.board || {};
      const locks = { ...(board.locks || {}) };

      if (locks[pieceId] !== state.user.uid) return;

      delete locks[pieceId];

      transaction.update(ref, {
        board: {
          piecePositions: [...board.piecePositions],
          locks
        },
        updatedAt: serverTimestamp()
      });
    });

    return true;
  } catch (e) {
    console.warn(e.message);
    return false;
  }
}

async function roomTrySwap(pieceA, pieceB) {
  try {
    await runTransaction(db, async (transaction) => {
      const ref = roomRef(state.roomId);
      const snap = await transaction.get(ref);

      if (!snap.exists()) throw new Error("Sala inexistente.");

      const data = snap.data();
      if (data.status === "complete") throw new Error("A sala já terminou.");

      const board = data.board || {};
      const piecePositions = [...board.piecePositions];
      const locks = { ...(board.locks || {}) };

      if (locks[pieceA] !== state.user.uid) {
        throw new Error("Você não está segurando a primeira peça.");
      }

      if (locks[pieceB] && locks[pieceB] !== state.user.uid) {
        throw new Error("A segunda peça está em uso.");
      }

      const temp = piecePositions[pieceA];
      piecePositions[pieceA] = piecePositions[pieceB];
      piecePositions[pieceB] = temp;

      delete locks[pieceA];
      delete locks[pieceB];

      const solved = piecePositions.every((pos, pieceId) => pos === pieceId);

      const payload = {
        board: {
          piecePositions,
          locks
        },
        updatedAt: serverTimestamp()
      };

      if (solved) {
        payload.status = "complete";
        payload.completedBy = state.user.uid;
        payload.completedByName = state.user.displayName || state.user.email || "Jogador";
      }

      transaction.update(ref, payload);
    });

    return true;
  } catch (e) {
    console.warn(e.message);
    return false;
  }
}

function generateRoomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ==========================
// HUD / UI
// ==========================
function updateRoomPanel() {
  const panel = document.getElementById("roomPanel");
  const modeLabel = document.getElementById("roomModeLabel");
  const roomCodeLabel = document.getElementById("roomCodeLabel");
  const roomPlayersLabel = document.getElementById("roomPlayersLabel");

  if (state.mode === "room" && state.roomId) {
    panel.classList.remove("hidden");
    modeLabel.innerText = "Cooperativo";
    roomCodeLabel.innerText = state.roomId;

    if (state.roomData?.playerNames) {
      roomPlayersLabel.innerText = Object.values(state.roomData.playerNames).join(", ");
    } else {
      roomPlayersLabel.innerText = "-";
    }
  } else {
    panel.classList.add("hidden");
    modeLabel.innerText = "-";
    roomCodeLabel.innerText = "-";
    roomPlayersLabel.innerText = "-";
  }
}

function updatePlayerHint() {
  const el = document.getElementById("playerHint");
  if (!el) return;

  if (state.mode === "room") {
    if (!state.user) {
      el.innerText = "Faça login para jogar em salas.";
      return;
    }

    if (state.firstSelected === null) {
      el.innerText = "Modo cooperativo: clique em uma peça para reservá-la e depois clique na peça que deseja trocar.";
    } else {
      el.innerText = "Você está segurando uma peça. Clique em outra para trocar, ou clique nela novamente para soltar.";
    }
    return;
  }

  if (state.firstSelected === null) {
    el.innerText = "Modo solo: clique em uma peça e depois em outra para trocar.";
  } else {
    el.innerText = "Peça selecionada. Clique em outra para trocar, ou clique novamente nela para cancelar.";
  }
}

async function copyRoomCode() {
  if (!state.roomId) return;
  try {
    await navigator.clipboard.writeText(state.roomId);
    alert("Código da sala copiado.");
  } catch {
    alert("Não consegui copiar automaticamente. Código: " + state.roomId);
  }
}

function openReferenceImage() {
  if (!state.currentBoardImageSrc) {
    alert("A imagem de referência ainda não foi carregada.");
    return;
  }

  window.open(state.currentBoardImageSrc, "_blank");
}
// ==========================
// VITÓRIA
// ==========================
async function showVictory(kind = "solo", roomMessage = "") {
  if (kind === "solo") {
    if (currentLevel < CONFIG.totalLevels) {
      unlockedLevel = Math.min(CONFIG.totalLevels, Math.max(unlockedLevel, currentLevel + 1));
    }
  }

  const screen = document.getElementById("victoryScreen");
  const msg = document.getElementById("victoryMessage");

  await loadVictoryGif();

 if (kind === "room") {

  if (currentLevel === CONFIG.totalLevels) {
    msg.innerText = "Parabéns! Venceram o jogo!!!";
  } else {
    msg.innerText = `Parabéns! Concluíram o nível ${currentLevel}!!`;
  }

} else {

  msg.innerText = currentLevel === CONFIG.totalLevels
    ? "Você completou todos os níveis."
    : `Nível ${currentLevel} concluído!`;

}

  screen.style.display = "flex";
}

async function nextLevel() {
  document.getElementById("victoryScreen").style.display = "none";

  if (state.mode === "room") {
    await roomNextLevel();
    return;
  }

  if (currentLevel < CONFIG.totalLevels) {
    await startSoloLevel(currentLevel + 1);
  }
}
async function roomNextLevel() {
  if (!state.roomId || !state.user) return;

  try {
    await runTransaction(db, async (transaction) => {
      const ref = roomRef(state.roomId);
      const snap = await transaction.get(ref);

      if (!snap.exists()) throw new Error("Sala inexistente.");

      const data = snap.data();

      // Só o dono da sala pode avançar
      if (data.createdBy !== state.user.uid) {
        throw new Error("Só o dono da sala pode avançar o nível.");
      }

      // Só pode avançar se a sala ainda estiver na tela de vitória
      if (data.status !== "complete") {
        throw new Error("A sala já avançou de nível.");
      }

      const next = data.level + 1;

      if (next > CONFIG.totalLevels) {
        throw new Error("Vocês já concluíram o último nível.");
      }

      const nextGridSize = CONFIG.levels[next - 1];
      const piecePositions = createShuffledPiecePositions(nextGridSize * nextGridSize);

      transaction.update(ref, {
        level: next,
        gridSize: nextGridSize,
        status: "playing",
        completedBy: null,
        completedByName: null,
        board: {
          piecePositions,
          locks: {}
        },
        updatedAt: serverTimestamp()
      });
    });

    state.firstSelected = null;

  } catch (e) {
    alert(e.message);
  }
}
// ==========================
// UTILS
// ==========================
function shuffle(array){
  for(let i = array.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ==========================
// BOOT
// ==========================
(function init(){
  document.getElementById("gameTitle").innerText = CONFIG.title;
  document.title = CONFIG.title;

  applyBackground();
  updatePlayerHint();
  updateRoomPanel();
  updateLevelScreenTitle();

  window.goToLevels = goToLevels;
  window.goBack = goBack;
  window.backToLevels = backToLevels;
  window.startLevel = startLevel;
  window.nextLevel = nextLevel;
  window.joinRoom = joinRoom;
  window.copyRoomCode = copyRoomCode;
  window.openReferenceImage = openReferenceImage;
})();
