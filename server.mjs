// Serwer: Next.js + Socket.IO na jednym porcie.
// Uruchom:  npm run dev   (tryb deweloperski)
//           npm run build && npm start   (produkcja)
import { createServer } from "node:http";
import os from "node:os";
import next from "next";
import { Server } from "socket.io";
import { Room, newRoomCode } from "./server/game.mjs";
import { recordGame, recordRoundWin } from "./server/leaderboard.mjs";

const dev = !process.argv.includes("--production");
const port = Number(process.env.PORT) || 3000;
const hostname = "0.0.0.0"; // nasłuch w całej sieci lokalnej

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer, {
  // nie ubijaj cudzych połączeń websocket (np. hot-reload Next.js)
  destroyUpgrade: false,
});

/** @type {Map<string, Room>} */
const rooms = new Map();

const broadcast = (room) => {
  for (const p of room.players) {
    if (p.connected && p.socketId) io.to(p.socketId).emit("state", room.viewFor(p.id));
  }
};

const hooks = {
  broadcast,
  onRoundWon: (name) => recordRoundWin(name),
  onGameOver: (room) => recordGame(room),
};

io.on("connection", (socket) => {
  /** @type {{room: Room, playerId: string} | null} */
  let session = null;

  const attach = (room, player) => {
    if (session && (session.room !== room || session.playerId !== player.id)) detach();
    // jeśli gracz był podłączony z innej karty – rozłącz stare gniazdo
    if (player.socketId && player.socketId !== socket.id) {
      io.sockets.sockets.get(player.socketId)?.emit("kicked", "Połączono z innego okna.");
      io.sockets.sockets.get(player.socketId)?.disconnect(true);
    }
    session = { room, playerId: player.id };
    socket.join(room.code);
    room.setConnected(player.id, true, socket.id);
  };

  const detach = () => {
    if (!session) return;
    const { room, playerId } = session;
    socket.leave(room.code);
    const p = room.getPlayer(playerId);
    if (p && p.socketId === socket.id) room.setConnected(playerId, false);
    session = null;
    broadcast(room);
  };

  // Każda akcja: wykonaj, odpowiedz callbackiem, roześlij stan.
  const action = (name, fn) =>
    socket.on(name, (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const result = fn(payload || {});
        reply({ ok: true, ...(result || {}) });
        if (session) broadcast(session.room);
      } catch (e) {
        reply({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });

  const requireSession = () => {
    if (!session) throw new Error("Nie jesteś w żadnym pokoju.");
    return session;
  };

  action("room:create", ({ name }) => {
    const code = newRoomCode(new Set(rooms.keys()));
    const room = new Room(code, hooks);
    const player = room.addPlayer(name);
    rooms.set(code, room);
    attach(room, player);
    return { code, playerId: player.id, token: player.token };
  });

  action("room:join", ({ code, name, playerId, token }) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) throw new Error("Nie znaleziono pokoju o takim kodzie.");
    // powrót po rozłączeniu
    if (playerId && token) {
      const existing = room.getPlayer(playerId);
      if (existing && existing.token === token) {
        attach(room, existing);
        return { code: room.code, playerId: existing.id, token: existing.token, name: existing.name };
      }
      if (!name) throw new Error("SESSION_EXPIRED");
    }
    const player = room.addPlayer(name);
    attach(room, player);
    return { code: room.code, playerId: player.id, token: player.token, name: player.name };
  });

  action("room:leave", () => {
    const { room, playerId } = requireSession();
    socket.leave(room.code);
    session = null;
    room.removePlayer(playerId);
    broadcast(room);
    if (room.players.length === 0) {
      room.clearAllTimers();
      rooms.delete(room.code);
    }
  });

  action("room:kick", ({ playerId }) => {
    const { room, playerId: me } = requireSession();
    if (me !== room.hostId) throw new Error("Tylko gospodarz może wyrzucać graczy.");
    if (playerId === me) throw new Error("Nie możesz wyrzucić samego siebie.");
    const target = room.getPlayer(playerId);
    if (!target) return;
    if (target.socketId) {
      const s = io.sockets.sockets.get(target.socketId);
      s?.emit("kicked", "Gospodarz usunął cię z pokoju.");
      s?.leave(room.code);
    }
    room.removePlayer(playerId);
  });

  action("settings:update", (s) => {
    const { room, playerId } = requireSession();
    room.updateSettings(playerId, s);
  });

  action("game:start", () => {
    const { room, playerId } = requireSession();
    room.start(playerId);
  });

  action("card:submit", ({ cards }) => {
    const { room, playerId } = requireSession();
    room.submit(playerId, cards);
  });

  action("round:force", () => {
    const { room, playerId } = requireSession();
    room.forceJudging(playerId);
  });

  action("czar:choose", ({ submissionId }) => {
    const { room, playerId } = requireSession();
    room.choose(playerId, submissionId);
  });

  action("round:next", () => {
    const { room, playerId } = requireSession();
    room.nextRound(playerId);
  });

  action("round:skip", () => {
    const { room, playerId } = requireSession();
    room.skipRound(playerId);
  });

  action("game:lobby", () => {
    const { room, playerId } = requireSession();
    room.backToLobby(playerId);
  });

  socket.on("disconnect", detach);
});

// sprzątanie pustych pokoi (brak aktywnych graczy przez 15 minut)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.activePlayers().length === 0 && now - room.lastActivity > 15 * 60 * 1000) {
      room.clearAllTimers();
      rooms.delete(code);
    }
  }
}, 60 * 1000);

httpServer.listen(port, hostname, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${port}`);
  console.log(`\n  Karty dżentelmenów działają (${dev ? "dev" : "produkcja"})`);
  console.log(`  - na tym komputerze:  http://localhost:${port}`);
  lan.forEach((u) => console.log(`  - w sieci lokalnej:   ${u}`));
  console.log("");
});
