const socket = io();

const dom = {
  loading: document.getElementById("loading"),
  findBtn: document.getElementById("find"),
  nameInput: document.getElementById("name"),
  userCont: document.getElementById("userCont"),
  oppNameCont: document.getElementById("oppNameCont"),
  valueCont: document.getElementById("valueCont"),
  whosTurn: document.getElementById("whosTurn"),
  userName: document.getElementById("user"),
  oppName: document.getElementById("oppName"),
  value: document.getElementById("value"),
  gridButtons: Array.from(document.querySelectorAll(".btn")),
};

let currentGameId = null;
let myMark = null;
let isMyTurn = false;

// Get URL parameters for dual mode
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    dualMode: params.get("dualMode"),
    playerName: params.get("playerName"),
    dualCode: params.get("dualCode"),
  };
}

function setVisibility(isInGame) {
  dom.bigcont = dom.bigcont || document.getElementById("bigcont");
  dom.bigcont.style.display = isInGame ? "block" : "none";
  dom.userCont.style.display = isInGame ? "block" : "none";
  dom.oppNameCont.style.display = isInGame ? "block" : "none";
  dom.valueCont.style.display = isInGame ? "block" : "none";
  dom.whosTurn.style.display = isInGame ? "block" : "none";
  dom.nameInput.style.display = isInGame ? "none" : "inline-block";
  dom.findBtn.style.display = isInGame ? "none" : "inline-block";
  document.getElementById("enterName").style.display = isInGame ? "none" : "block";
}

function resetBoard() {
  dom.gridButtons.forEach((btn) => {
    btn.innerText = "";
    btn.disabled = false;
    btn.style.color = "black";
  });
}

function updateBoard(board) {
  dom.gridButtons.forEach((btn) => {
    const value = board[btn.id];
    btn.innerText = value || "";
    btn.disabled = !!value;
    if (value) {
      btn.style.color = "black";
    }
  });
}

function showStatus(text) {
  dom.whosTurn.innerText = text;
}

function startMatch({ gameId, yourMark, opponentName, board, currentTurn }) {
  currentGameId = gameId;
  myMark = yourMark;
  isMyTurn = currentTurn === myMark;

  dom.userName.innerText = dom.nameInput.value.trim();
  dom.oppName.innerText = opponentName;
  dom.value.innerText = myMark;

  setVisibility(true);
  dom.loading.style.display = "none";

  resetBoard();
  updateBoard(board);
  showStatus(isMyTurn ? "Your Turn" : "Opponent's Turn");
}

function endMatch(message) {
  alert(message);
  window.location.reload();
}

function onUpdate({ board, currentTurn, winner, isDraw }) {
  updateBoard(board);

  if (winner) {
    const youWon = winner === myMark;
    return endMatch(youWon ? "You won!" : "You lost :(");
  }

  if (isDraw) {
    return endMatch("Draw!");
  }

  isMyTurn = currentTurn === myMark;
  showStatus(isMyTurn ? "Your Turn" : "Opponent's Turn");
}

function setLoading(isLoading) {
  dom.loading.style.display = isLoading ? "block" : "none";
}

// Initial UI state
setLoading(false);
setVisibility(false);

// Check for dual mode and auto-start
const urlParams = getUrlParams();
if (urlParams.dualMode && urlParams.playerName) {
  dom.nameInput.value = urlParams.playerName;
  
  // Use the dualCode passed from parent window
  const dualCode = urlParams.dualCode;
  
  // Auto-trigger find after a short delay to ensure socket connection is ready
  setTimeout(() => {
    const name = dom.nameInput.value.trim();
    if (name && dualCode) {
      setLoading(true);
      dom.findBtn.disabled = true;
      console.log("Emitting find for dual mode with code:", dualCode);
      socket.emit("find", { 
        name,
        dualMode: urlParams.dualMode,
        dualCode: dualCode
      });
    }
  }, 300); // Shorter delay since we now have a matching code
}

// Event listeners

dom.findBtn.addEventListener("click", () => {
  const name = dom.nameInput.value.trim();
  if (!name) {
    alert("Please enter a name");
    return;
  }

  dom.userName.innerText = name;
  setLoading(true);
  dom.findBtn.disabled = true;

  socket.emit("find", { name });
});

dom.gridButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentGameId || !isMyTurn) return;
    if (button.innerText) return;

    socket.emit("move", {
      gameId: currentGameId,
      cellId: button.id,
    });
  });
});

socket.on("waiting", () => {
  setLoading(true);
  showStatus("Waiting for an opponent...");
});

socket.on("matched", (payload) => {
  startMatch(payload);
});

socket.on("update", (payload) => {
  onUpdate(payload);
});

socket.on("opponentLeft", () => {
  endMatch("Opponent disconnected. Refresh to play again.");
});
