// ==========================
// Puzzle FoxyB (V2)
// Mantém arquitetura do projeto anterior:
// startScreen -> levelScreen -> gameScreen -> victoryScreen
// Mantém: contorno inteligente, desbloqueio progressivo em memória, botões Próximo/Níveis
// Remove: personagens, frases, salvar imagem
// ==========================

/**
 * CONFIG: você escolhe os arquivos dentro de /assets
 * Basta colocar os arquivos com esses nomes (ou mudar aqui).
 *
 * Estrutura sugerida:
 * assets/
 *   profile.jpg (ou png)
 *   background.jpg (ou png)
 *   victory.gif
 *   level1.jpg
 *   level2.jpg
 *   ...
 *   level10.jpg
 */
const CONFIG = {
  title: "Jigsaw Ysseneg",
  totalLevels: 10,
  // grade: nível 1=5x5, nível 2=6x6 ... nível 10=14x14
  levels: [5,6,7,8,9,10,11,12,13,14],

  // nomes-base (sem extensão) — o loader tenta várias extensões
  assets: {
    profileBase: "assets/profile",
    backgroundBase: "assets/background",
    // victory pode ser gif; loader tenta gif primeiro
    victoryBase: "assets/victory",
    levelBase: "assets/level" // vira level1..level10
  },

  // extensões aceitas (tentadas nessa ordem)
  exts: {
    image: ["jpg","jpeg","png","webp"],
    gifFirst: ["gif","webp","png","jpg","jpeg"]
  },

  // tamanho máximo do puzzle na tela (mantém ideia do anterior)
  maxBox: 800
};

let currentLevel = 1;
let gridSize = CONFIG.levels[0];
let tiles = [];
let firstSelected = null;

// desbloqueio em memória (reinicia ao atualizar)
let unlockedLevel = 1;

// cache de imagens (pra não ficar recarregando toda hora)
const imageCache = new Map();

// ==========================
// Navegação de telas (arquitetura original)
// ==========================
function goToLevels(){
  document.getElementById("startScreen").classList.remove("active");
  document.getElementById("levelScreen").classList.add("active");
  generateLevels();
}

function goBack() {
  document.getElementById("levelScreen").classList.remove("active");
  document.getElementById("startScreen").classList.add("active");
}

// voltar pro menu de níveis sem F5
function backToLevels() {
  const victory = document.getElementById("victoryScreen");
  if (victory) victory.style.display = "none";

  document.getElementById("gameScreen").classList.remove("active");
  document.getElementById("levelScreen").classList.add("active");
  generateLevels();
}

// ==========================
// Loader de assets por tentativa de extensão
// ==========================
function loadImageTryExts(basePath, exts){
  const cacheKey = basePath + "|" + exts.join(",");
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const p = new Promise((resolve, reject) => {
    let i = 0;

    const tryNext = () => {
      if (i >= exts.length) {
        reject(new Error("Asset não encontrado: " + basePath + ".{"+exts.join(",")+"}"));
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
    // sem fundo, ok (fica cor base)
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
// Níveis
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

  document.getElementById("levelScreen").classList.remove("active");
  document.getElementById("gameScreen").classList.add("active");

  // carrega perfil e fundo (globais)
  await loadProfileImage();

  await createPuzzle();
}

// ==========================
// Puzzle (mesma lógica do anterior)
// ==========================
async function createPuzzle() {
  const container = document.getElementById("puzzleContainer");
  container.innerHTML = "";
  firstSelected = null;

  // carrega imagem do nível (assets/levelN.ext)
  let imgObj;
  try{
    imgObj = await loadImageTryExts(levelBasePath(currentLevel), CONFIG.exts.image);
  }catch(e){
    // mostra erro visível
    container.style.width = "auto";
    container.style.height = "auto";
    container.style.display = "block";
    container.style.padding = "18px";
    container.innerHTML = `<div style="max-width:720px;margin:0 auto;line-height:1.35;opacity:.9;">
      <b>Não encontrei a imagem do nível ${currentLevel}</b>.<br>
      Coloque em <code>assets/</code> um arquivo chamado <code>level${currentLevel}.jpg</code> (ou png/webp/jpeg).<br>
      Exemplo: <code>${levelBasePath(currentLevel)}.jpg</code>
    </div>`;
    console.warn(e.message);
    return;
  }

  const image = imgObj.img;

  // mantém lógica do anterior: calcula caixa 800x800 ajustada pelo ratio
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

  tiles = [];
  for (let i = 0; i < gridSize * gridSize; i++) tiles.push(i);

  shuffle(tiles);
  while (tiles.every((v,i)=>v===i)) shuffle(tiles);

  tiles.forEach((value, index) => {
    const tile = document.createElement("div");
    tile.classList.add("tile");
    tile.dataset.correct = value;
    tile.dataset.current = index;

    const x = value % gridSize;
    const y = Math.floor(value / gridSize);

    // sem deformar: backgroundSize/Position como no anterior
    tile.style.backgroundImage = `url(${imgObj.src})`;
    tile.style.backgroundSize = `${gridSize*100}% ${gridSize*100}%`;
    tile.style.backgroundPosition =
      `${x*(100/(gridSize-1))}% ${y*(100/(gridSize-1))}%`;

    tile.onclick = () => selectTile(tile);

    // contorno inteligente (hover)
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

    container.appendChild(tile);
  });

  updateTilePositions();
}

// recalcula hover depois da troca (mantido)
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

function selectTile(tile) {
  if (!firstSelected) {
    firstSelected = tile;
    tile.classList.add("selected");
  } else {
    swapTiles(firstSelected, tile);
    firstSelected.classList.remove("selected");
    firstSelected = null;
    checkWin();
  }
}

function swapTiles(t1, t2) {
  const temp = t1.dataset.current;
  t1.dataset.current = t2.dataset.current;
  t2.dataset.current = temp;

  updateTilePositions();
  updateHoverState(t1);
  updateHoverState(t2);
}

function updateTilePositions() {
  document.querySelectorAll(".tile").forEach(tile=>{
    tile.style.order = tile.dataset.current;
  });
}

function checkWin() {
  let correct = true;
  document.querySelectorAll(".tile").forEach(tile=>{
    if(tile.dataset.current !== tile.dataset.correct) correct=false;
  });
  if(correct) showVictory();
}

// ==========================
// Vitória (mantém botões Próximo / Níveis, remove salvar imagem)
// ==========================
async function showVictory() {
  // desbloqueia o próximo nível (em memória)
  if (currentLevel < CONFIG.totalLevels) {
    unlockedLevel = Math.min(CONFIG.totalLevels, Math.max(unlockedLevel, currentLevel + 1));
  }

  const screen = document.getElementById("victoryScreen");
  const msg = document.getElementById("victoryMessage");

  await loadVictoryGif();

  msg.innerText = currentLevel === CONFIG.totalLevels
    ? "Você completou todos os níveis."
    : `Nível ${currentLevel} concluído!`;

  screen.style.display = "flex";
}

function nextLevel() {
  document.getElementById("victoryScreen").style.display = "none";
  if(currentLevel < CONFIG.totalLevels) startLevel(currentLevel + 1);
}

// ==========================
// Utils
// ==========================
function shuffle(array){
  for(let i=array.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [array[i],array[j]]=[array[j],array[i]];
  }
}

// ==========================
// Boot
// ==========================
(function init(){
  document.getElementById("gameTitle").innerText = CONFIG.title;
  document.title = CONFIG.title;

  // fundo global (opcional)
  applyBackground();

  // expõe funções no escopo global (porque o HTML chama onclick="")
  window.goToLevels = goToLevels;
  window.goBack = goBack;
  window.backToLevels = backToLevels;
  window.startLevel = startLevel;
  window.nextLevel = nextLevel;
})();
