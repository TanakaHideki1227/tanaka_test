const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = {
  I: "#39d7ff",
  O: "#ffd938",
  T: "#b97dff",
  S: "#59d98e",
  Z: "#ff6363",
  J: "#6d8aff",
  L: "#ffb347",
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const boardCanvas = document.getElementById("board");
const nextCanvas = document.getElementById("next");
const holdCanvas = document.getElementById("hold");
const boardCtx = boardCanvas.getContext("2d");
const nextCtx = nextCanvas.getContext("2d");
const holdCtx = holdCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");

let board = [];
let bag = [];
let queue = [];
let current = null;
let hold = null;
let holdLocked = false;
let score = 0;
let lines = 0;
let level = 1;
let paused = false;
let gameOver = false;
let dropCounter = 0;
let lastTime = 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function rotate(matrix, dir) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (dir > 0) {
        result[x][rows - 1 - y] = matrix[y][x];
      } else {
        result[cols - 1 - x][y] = matrix[y][x];
      }
    }
  }

  return result;
}

function refillBag() {
  bag = ["I", "O", "T", "S", "Z", "J", "L"];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function getNextType() {
  if (bag.length === 0) {
    refillBag();
  }
  return bag.pop();
}

function spawnPiece(type = null) {
  const pieceType = type ?? queue.shift();
  if (!pieceType) {
    queue.push(getNextType(), getNextType(), getNextType(), getNextType(), getNextType());
    return spawnPiece();
  }

  while (queue.length < 5) {
    queue.push(getNextType());
  }

  const matrix = cloneMatrix(SHAPES[pieceType]);
  const piece = {
    type: pieceType,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: -1,
  };

  if (collides(board, piece)) {
    gameOver = true;
    overlayText.textContent = "GAME OVER";
    overlay.classList.remove("hidden");
  }

  return piece;
}

function collides(targetBoard, piece) {
  for (let y = 0; y < piece.matrix.length; y += 1) {
    for (let x = 0; x < piece.matrix[y].length; x += 1) {
      if (!piece.matrix[y][x]) continue;
      const nx = piece.x + x;
      const ny = piece.y + y;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && targetBoard[ny][nx]) return true;
    }
  }
  return false;
}

function mergePiece(piece) {
  for (let y = 0; y < piece.matrix.length; y += 1) {
    for (let x = 0; x < piece.matrix[y].length; x += 1) {
      if (!piece.matrix[y][x]) continue;
      const bx = piece.x + x;
      const by = piece.y + y;
      if (by >= 0) board[by][bx] = piece.type;
    }
  }
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every((cell) => cell !== null)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    const linePoints = [0, 100, 300, 500, 800];
    score += linePoints[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    updateHUD();
  }
}

function hardDrop() {
  if (paused || gameOver) return;
  while (!collides(board, { ...current, y: current.y + 1 })) {
    current.y += 1;
  }
  lockPiece();
}

function lockPiece() {
  mergePiece(current);
  clearLines();
  current = spawnPiece();
  holdLocked = false;
}

function tryMove(dx, dy) {
  const moved = { ...current, x: current.x + dx, y: current.y + dy };
  if (!collides(board, moved)) {
    current = moved;
    return true;
  }
  return false;
}

function tryRotate(dir) {
  const rotated = rotate(current.matrix, dir);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    const test = { ...current, matrix: rotated, x: current.x + kick };
    if (!collides(board, test)) {
      current = test;
      return;
    }
  }
}

function doHold() {
  if (holdLocked || paused || gameOver) return;
  const swapType = hold;
  hold = current.type;
  current = spawnPiece(swapType);
  holdLocked = true;
}

function getGhostY() {
  let y = current.y;
  while (!collides(board, { ...current, y: y + 1 })) {
    y += 1;
  }
  return y;
}

function dropIntervalMs() {
  const base = 1000;
  const speed = 70;
  return Math.max(80, base - (level - 1) * speed);
}

function update(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  if (!paused && !gameOver) {
    dropCounter += delta;
    if (dropCounter >= dropIntervalMs()) {
      if (!tryMove(0, 1)) {
        lockPiece();
      }
      dropCounter = 0;
    }
    draw();
  }
  requestAnimationFrame(update);
}

function drawCell(ctx, x, y, color, size = BLOCK) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
  ctx.strokeStyle = "#0b0f1d";
  ctx.lineWidth = 1;
  ctx.strokeRect(x * size, y * size, size, size);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const type = board[y][x];
      if (type) drawCell(boardCtx, x, y, COLORS[type]);
    }
  }
}

function drawPiece(piece, ctx = boardCtx, ghost = false) {
  for (let y = 0; y < piece.matrix.length; y += 1) {
    for (let x = 0; x < piece.matrix[y].length; x += 1) {
      if (!piece.matrix[y][x]) continue;
      const px = piece.x + x;
      const py = piece.y + y;
      if (py < 0) continue;
      if (ghost) {
        ctx.fillStyle = `${COLORS[piece.type]}55`;
        ctx.fillRect(px * BLOCK, py * BLOCK, BLOCK, BLOCK);
        ctx.strokeStyle = `${COLORS[piece.type]}aa`;
        ctx.strokeRect(px * BLOCK, py * BLOCK, BLOCK, BLOCK);
      } else {
        drawCell(ctx, px, py, COLORS[piece.type]);
      }
    }
  }
}

function drawMini(ctx, type, offsetY = 0) {
  if (!type) return;
  const matrix = SHAPES[type];
  const size = 24;
  const width = matrix[0].length * size;
  const xOffset = (120 - width) / 2;
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) continue;
      ctx.fillStyle = COLORS[type];
      ctx.fillRect(xOffset + x * size, offsetY + y * size, size, size);
      ctx.strokeStyle = "#0b0f1d";
      ctx.strokeRect(xOffset + x * size, offsetY + y * size, size, size);
    }
  }
}

function drawSidePanels() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawMini(holdCtx, hold, 34);
  for (let i = 0; i < 3; i += 1) {
    drawMini(nextCtx, queue[i], i * 120 + 18);
  }
}

function draw() {
  drawBoard();
  const ghostY = getGhostY();
  drawPiece({ ...current, y: ghostY }, boardCtx, true);
  drawPiece(current);
  drawSidePanels();
}

function updateHUD() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  levelEl.textContent = String(level);
}

function resetGame() {
  board = createBoard();
  bag = [];
  queue = [];
  refillBag();
  queue.push(getNextType(), getNextType(), getNextType(), getNextType(), getNextType());
  current = spawnPiece();
  hold = null;
  holdLocked = false;
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropCounter = 0;
  overlay.classList.add("hidden");
  updateHUD();
  draw();
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "r") {
    resetGame();
    return;
  }

  if (key === "p" && !gameOver) {
    paused = !paused;
    overlayText.textContent = paused ? "PAUSED" : "";
    overlay.classList.toggle("hidden", !paused);
    return;
  }

  if (paused || gameOver) return;

  if (event.key === "ArrowLeft") {
    tryMove(-1, 0);
  } else if (event.key === "ArrowRight") {
    tryMove(1, 0);
  } else if (event.key === "ArrowDown") {
    if (tryMove(0, 1)) {
      score += 1;
      updateHUD();
    } else {
      lockPiece();
    }
    dropCounter = 0;
  } else if (event.key === "ArrowUp" || key === "x") {
    tryRotate(1);
  } else if (key === "z") {
    tryRotate(-1);
  } else if (event.code === "Space") {
    hardDrop();
  } else if (key === "c") {
    doHold();
  }

  draw();
});

resetGame();
requestAnimationFrame(update);
