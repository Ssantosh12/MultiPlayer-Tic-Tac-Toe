const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/dual", (req, res) => {
  res.sendFile(path.join(publicDir, "dual.html"));
});

const waitingPlayers = [];
const dualModePairs = new Map(); // Maps dualCode to waiting player
const games = new Map();

function createEmptyBoard() {
  return {
    btn1: null,
    btn2: null,
    btn3: null,
    btn4: null,
    btn5: null,
    btn6: null,
    btn7: null,
    btn8: null,
    btn9: null,
  };
}

function getOpponentMark(mark) {
  return mark === "X" ? "O" : "X";
}

function computeWinner(board) {
  const lines = [
    ["btn1", "btn2", "btn3"],
    ["btn4", "btn5", "btn6"],
    ["btn7", "btn8", "btn9"],
    ["btn1", "btn4", "btn7"],
    ["btn2", "btn5", "btn8"],
    ["btn3", "btn6", "btn9"],
    ["btn1", "btn5", "btn9"],
    ["btn3", "btn5", "btn7"],
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function isBoardFull(board) {
  return Object.values(board).every((cell) => cell !== null);
}

function createGame(player1, player2) {
  const gameId = `game_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const game = {
    id: gameId,
    board: createEmptyBoard(),
    currentTurn: "X",
    players: {
      X: player1,
      O: player2,
    },
  };

  games.set(gameId, game);
  return game;
}

function cleanupGame(gameId) {
  games.delete(gameId);
}

io.on("connection", (socket) => {
  socket.on("find", ({ name, dualMode, dualCode }) => {
    if (!name || typeof name !== "string") {
      return;
    }

    // Ignore repeated requests once the player is in a game.
    if (socket.data.gameId) {
      return;
    }

    socket.data.name = name;
    socket.data.dualMode = dualMode;
    socket.data.dualCode = dualCode;

    // If the player is already in the waiting queue, ignore.
    if (waitingPlayers.includes(socket)) {
      return;
    }

    // Handle dual mode pairing
    if (dualMode && dualCode) {
      console.log(`[Dual Mode] Player ${name} connecting with code: ${dualCode}`);
      if (dualModePairs.has(dualCode)) {
        const opponent = dualModePairs.get(dualCode);
        dualModePairs.delete(dualCode);
        console.log(`[Dual Mode] Matched! Pairing ${name} with ${opponent.data.name}`);

        // Create game with dual mode players
        const game = createGame(
          { socket: opponent, name: opponent.data.name },
          { socket, name: socket.data.name }
        );

        socket.data.gameId = game.id;
        socket.data.mark = "O";
        opponent.data.gameId = game.id;
        opponent.data.mark = "X";

        socket.join(game.id);
        opponent.join(game.id);

        const opponentPayload = {
          gameId: game.id,
          yourMark: "X",
          opponentName: socket.data.name,
          board: game.board,
          currentTurn: game.currentTurn,
        };

        opponent.emit("matched", opponentPayload);

        const payload = {
          gameId: game.id,
          yourMark: "O",
          opponentName: opponent.data.name,
          board: game.board,
          currentTurn: game.currentTurn,
        };

        socket.emit("matched", payload);
        return;
      } else {
        // First player in dual mode - add to waiting for pair
        console.log(`[Dual Mode] First player (${name}) waiting with code: ${dualCode}`);
        dualModePairs.set(dualCode, socket);
        socket.emit("waiting");
        return;
      }
    }

    // If there is someone waiting, start a game; otherwise, wait.
    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift();

      const game = createGame(
        { socket, name: socket.data.name },
        { socket: opponent, name: opponent.data.name }
      );

      socket.data.gameId = game.id;
      socket.data.mark = "X";
      opponent.data.gameId = game.id;
      opponent.data.mark = "O";

      socket.join(game.id);
      opponent.join(game.id);

      const payload = {
        gameId: game.id,
        yourMark: "X",
        opponentName: opponent.data.name,
        board: game.board,
        currentTurn: game.currentTurn,
      };

      socket.emit("matched", payload);

      const opponentPayload = {
        gameId: game.id,
        yourMark: "O",
        opponentName: socket.data.name,
        board: game.board,
        currentTurn: game.currentTurn,
      };

      opponent.emit("matched", opponentPayload);
    } else {
      waitingPlayers.push(socket);
      socket.emit("waiting");
    }
  });

  socket.on("move", ({ gameId, cellId }) => {
    const game = games.get(gameId);
    if (!game) return;

    const mark = socket.data.mark;
    if (!mark) return;

    if (game.currentTurn !== mark) return;
    if (!game.board.hasOwnProperty(cellId)) return;
    if (game.board[cellId] !== null) return;

    game.board[cellId] = mark;
    game.currentTurn = getOpponentMark(mark);

    const winner = computeWinner(game.board);
    const boardFull = isBoardFull(game.board);

    io.to(game.id).emit("update", {
      gameId: game.id,
      board: game.board,
      currentTurn: game.currentTurn,
      winner,
      isDraw: !winner && boardFull,
    });

    if (winner || boardFull) {
      cleanupGame(game.id);
    }
  });

  socket.on("disconnect", () => {
    const gameId = socket.data.gameId;
    const dualCode = socket.data.dualCode;

    // If the player was in dual mode queue, remove them
    if (dualCode && dualModePairs.has(dualCode)) {
      dualModePairs.delete(dualCode);
    }

    // If the player was waiting, remove them from the queue.
    const waitingIndex = waitingPlayers.indexOf(socket);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    if (gameId) {
      const game = games.get(gameId);
      if (game) {
        const opponentMark = getOpponentMark(socket.data.mark);
        const opponent = game.players[opponentMark];
        if (opponent && opponent.socket && opponent.socket.connected) {
          opponent.socket.emit("opponentLeft");
        }
      }
      cleanupGame(gameId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
