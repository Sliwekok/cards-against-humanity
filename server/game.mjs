// Logika gry „Karty dżentelmenów” – całkowicie po stronie serwera.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const CARDS = JSON.parse(
  readFileSync(path.join(process.cwd(), "data", "cards.json"), "utf8"),
);

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
const ROUND_END_DELAY_MS = 8000;
const CZAR_TIMEOUT_MS = 20000;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const DEFAULT_SETTINGS = { pointsToWin: 7, handSize: 10 };

export class Room {
  constructor(code, hooks) {
    this.code = code;
    this.hooks = hooks; // { broadcast(room), onRoundWon(name), onGameOver(room) }
    this.players = []; // {id, token, name, score, connected, hand: number[], socketId}
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.phase = "lobby"; // lobby | playing | judging | roundEnd | gameOver
    this.round = 0;
    this.czarOrder = [];
    this.czarIndex = -1;
    this.czarId = null;
    this.blackCard = null; // index
    this.submissions = []; // {id, playerId, cards: number[]}
    this.revealOrder = []; // submission ids w losowej kolejności
    this.lastRound = null; // {winnerId, winnerName, submissionId}
    this.history = []; // {round, black, cards: string[], winnerName}
    this.roomWins = {}; // name -> wygrane partie w tym pokoju
    this.nextRoundAt = null;
    this.timers = {};
    this.lastActivity = Date.now();
    this.resetDecks();
  }

  // ---------- talie ----------
  resetDecks() {
    this.whiteDeck = shuffle(CARDS.white.map((_, i) => i));
    this.whiteDiscard = [];
    this.blackDeck = shuffle(CARDS.black.map((_, i) => i));
    this.blackDiscard = [];
  }

  drawWhite() {
    if (this.whiteDeck.length === 0) {
      this.whiteDeck = shuffle(this.whiteDiscard);
      this.whiteDiscard = [];
    }
    return this.whiteDeck.pop();
  }

  drawBlack() {
    if (this.blackDeck.length === 0) {
      this.blackDeck = shuffle(this.blackDiscard);
      this.blackDiscard = [];
    }
    return this.blackDeck.pop();
  }

  fillHand(p) {
    while (p.hand.length < this.settings.handSize) {
      const c = this.drawWhite();
      if (c === undefined) break;
      p.hand.push(c);
    }
  }

  // ---------- gracze ----------
  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  addPlayer(name) {
    if (this.players.length >= MAX_PLAYERS) throw new Error("Pokój jest pełny.");
    const clean = String(name || "").trim().slice(0, 20);
    if (!clean) throw new Error("Podaj swój pseudonim.");
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase()))
      throw new Error("Ten pseudonim jest już zajęty w tym pokoju.");
    const p = {
      id: randomUUID(),
      token: randomBytes(16).toString("hex"),
      name: clean,
      score: 0,
      connected: true,
      hand: [],
      socketId: null,
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    if (this.phase !== "lobby" && this.phase !== "gameOver") {
      this.fillHand(p);
      this.czarOrder.push(p.id); // dołącza na koniec kolejki sędziów
    }
    this.touch();
    return p;
  }

  removePlayer(id) {
    const p = this.getPlayer(id);
    if (!p) return;
    this.whiteDiscard.push(...p.hand);
    const sub = this.submissions.find((s) => s.playerId === id);
    if (sub && this.phase === "playing") {
      this.whiteDiscard.push(...sub.cards);
      this.submissions = this.submissions.filter((s) => s !== sub);
    }
    this.players = this.players.filter((x) => x.id !== id);
    const idx = this.czarOrder.indexOf(id);
    if (idx !== -1) {
      this.czarOrder.splice(idx, 1);
      if (idx <= this.czarIndex) this.czarIndex--;
    }
    if (this.hostId === id) {
      const next = this.players.find((x) => x.connected) || this.players[0];
      this.hostId = next ? next.id : null;
    }
    if (this.isActiveGame()) {
      if (this.players.length < MIN_PLAYERS) {
        this.endGame(true);
        return;
      }
      if (id === this.czarId) this.skipRound();
      else this.checkAllSubmitted();
    }
  }

  setConnected(id, connected, socketId = null) {
    const p = this.getPlayer(id);
    if (!p) return;
    p.connected = connected;
    p.socketId = connected ? socketId : null;
    this.touch();
    if (!connected) {
      if (this.hostId === id) {
        const next = this.players.find((x) => x.connected);
        if (next) this.hostId = next.id;
      }
      if (this.isActiveGame()) {
        if (id === this.czarId && (this.phase === "playing" || this.phase === "judging")) {
          this.setTimer("czar", CZAR_TIMEOUT_MS, () => {
            const czar = this.getPlayer(this.czarId);
            if (czar && !czar.connected) {
              this.skipRound();
              this.hooks.broadcast(this);
            }
          });
        }
        this.checkAllSubmitted();
      }
    } else if (id === this.czarId) {
      this.clearTimer("czar");
    }
  }

  activePlayers() {
    return this.players.filter((p) => p.connected);
  }

  isActiveGame() {
    return ["playing", "judging", "roundEnd"].includes(this.phase);
  }

  touch() {
    this.lastActivity = Date.now();
  }

  // ---------- timery ----------
  setTimer(key, ms, fn) {
    this.clearTimer(key);
    this.timers[key] = setTimeout(() => {
      delete this.timers[key];
      fn();
    }, ms);
  }

  clearTimer(key) {
    if (this.timers[key]) clearTimeout(this.timers[key]);
    delete this.timers[key];
  }

  clearAllTimers() {
    Object.keys(this.timers).forEach((k) => this.clearTimer(k));
  }

  // ---------- przebieg gry ----------
  updateSettings(byId, s) {
    if (byId !== this.hostId) throw new Error("Tylko gospodarz może zmieniać ustawienia.");
    if (this.phase !== "lobby" && this.phase !== "gameOver")
      throw new Error("Ustawienia można zmienić tylko przed grą.");
    const pts = Number(s.pointsToWin);
    const hand = Number(s.handSize);
    if (Number.isInteger(pts) && pts >= 1 && pts <= 30) this.settings.pointsToWin = pts;
    if (Number.isInteger(hand) && hand >= 5 && hand <= 12) this.settings.handSize = hand;
  }

  start(byId) {
    if (byId !== this.hostId) throw new Error("Tylko gospodarz może rozpocząć grę.");
    if (this.activePlayers().length < MIN_PLAYERS)
      throw new Error(`Potrzeba co najmniej ${MIN_PLAYERS} graczy.`);
    this.clearAllTimers();
    // gracze rozłączeni w lobby wypadają
    this.players = this.players.filter((p) => p.connected);
    this.resetDecks();
    this.players.forEach((p) => {
      p.score = 0;
      p.hand = [];
      this.fillHand(p);
    });
    this.czarOrder = shuffle(this.players.map((p) => p.id)); // losowa kolejka sędziów
    this.czarIndex = -1;
    this.round = 0;
    this.history = [];
    this.lastRound = null;
    this.startRound();
  }

  startRound() {
    this.clearAllTimers();
    this.nextRoundAt = null;
    this.lastRound = null;
    if (this.blackCard !== null) this.blackDiscard.push(this.blackCard);
    // następny podłączony gracz w kolejce zostaje sędzią
    let tries = 0;
    do {
      this.czarIndex = (this.czarIndex + 1) % this.czarOrder.length;
      tries++;
    } while (!this.getPlayer(this.czarOrder[this.czarIndex])?.connected && tries <= this.czarOrder.length);
    this.czarId = this.czarOrder[this.czarIndex];
    this.round++;
    this.blackCard = this.drawBlack();
    this.submissions = [];
    this.revealOrder = [];
    this.players.forEach((p) => this.fillHand(p));
    this.phase = "playing";
  }

  pick() {
    return CARDS.black[this.blackCard]?.pick ?? 1;
  }

  submit(playerId, cardIds) {
    if (this.phase !== "playing") throw new Error("Teraz nie można zagrywać kart.");
    if (playerId === this.czarId) throw new Error("Sędzia nie zagrywa kart w tej rundzie.");
    const p = this.getPlayer(playerId);
    if (!p) throw new Error("Nie ma takiego gracza.");
    if (this.submissions.some((s) => s.playerId === playerId))
      throw new Error("Już zagrałeś w tej rundzie.");
    if (!Array.isArray(cardIds) || cardIds.length !== this.pick())
      throw new Error(`Wybierz dokładnie ${this.pick()} kart(y).`);
    if (new Set(cardIds).size !== cardIds.length || !cardIds.every((c) => p.hand.includes(c)))
      throw new Error("Nie masz tych kart.");
    p.hand = p.hand.filter((c) => !cardIds.includes(c));
    this.submissions.push({ id: randomUUID().slice(0, 8), playerId, cards: cardIds });
    this.checkAllSubmitted();
  }

  checkAllSubmitted() {
    if (this.phase !== "playing") return;
    const needed = this.players.filter((p) => p.connected && p.id !== this.czarId);
    const done = needed.every((p) => this.submissions.some((s) => s.playerId === p.id));
    if (done && this.submissions.length > 0) {
      this.phase = "judging";
      this.revealOrder = shuffle(this.submissions.map((s) => s.id));
    }
  }

  forceJudging(byId) {
    if (byId !== this.hostId && byId !== this.czarId)
      throw new Error("Tylko gospodarz lub sędzia może to zrobić.");
    if (this.phase !== "playing") return;
    if (this.submissions.length === 0) throw new Error("Nikt jeszcze nie zagrał karty.");
    this.phase = "judging";
    this.revealOrder = shuffle(this.submissions.map((s) => s.id));
  }

  choose(byId, submissionId) {
    if (this.phase !== "judging") throw new Error("Teraz nie można wybierać zwycięzcy.");
    if (byId !== this.czarId) throw new Error("Tylko sędzia wybiera zwycięzcę.");
    const sub = this.submissions.find((s) => s.id === submissionId);
    if (!sub) throw new Error("Nie ma takiej odpowiedzi.");
    const winner = this.getPlayer(sub.playerId);
    const winnerName = winner ? winner.name : "(gracz, który wyszedł)";
    if (winner) winner.score++;
    this.lastRound = { winnerId: sub.playerId, winnerName, submissionId };
    this.history.unshift({
      round: this.round,
      black: CARDS.black[this.blackCard].text,
      cards: sub.cards.map((c) => CARDS.white[c]),
      winnerName,
      czarName: this.getPlayer(this.czarId)?.name ?? "?",
    });
    this.history = this.history.slice(0, 50);
    this.submissions.forEach((s) => this.whiteDiscard.push(...s.cards));
    if (winner) this.hooks.onRoundWon?.(winner.name);

    if (winner && winner.score >= this.settings.pointsToWin) {
      this.endGame(false);
    } else {
      this.phase = "roundEnd";
      this.nextRoundAt = Date.now() + ROUND_END_DELAY_MS;
      this.setTimer("next", ROUND_END_DELAY_MS, () => {
        if (this.phase === "roundEnd") {
          this.startRound();
          this.hooks.broadcast(this);
        }
      });
    }
  }

  nextRound(byId) {
    if (this.phase !== "roundEnd") return;
    if (byId !== this.hostId && byId !== this.czarId)
      throw new Error("Tylko gospodarz lub sędzia może przejść dalej.");
    this.startRound();
  }

  skipRound(byId) {
    if (byId !== undefined && byId !== this.hostId)
      throw new Error("Tylko gospodarz może pominąć rundę.");
    if (!this.isActiveGame()) return;
    // oddaj zagrane karty graczom
    this.submissions.forEach((s) => {
      const p = this.getPlayer(s.playerId);
      if (p) p.hand.push(...s.cards);
      else this.whiteDiscard.push(...s.cards);
    });
    this.submissions = [];
    this.startRound();
  }

  endGame(aborted) {
    this.clearAllTimers();
    this.phase = "gameOver";
    this.nextRoundAt = null;
    this.aborted = !!aborted;
    if (!aborted) {
      const top = [...this.players].sort((a, b) => b.score - a.score)[0];
      if (top) this.roomWins[top.name] = (this.roomWins[top.name] || 0) + 1;
      this.hooks.onGameOver?.(this);
    }
  }

  backToLobby(byId) {
    if (byId !== this.hostId) throw new Error("Tylko gospodarz może to zrobić.");
    this.clearAllTimers();
    this.phase = "lobby";
    this.blackCard = null;
    this.submissions = [];
    this.czarId = null;
    this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p) => {
      p.score = 0;
      p.hand = [];
    });
  }

  // ---------- widok dla konkretnego gracza ----------
  viewFor(playerId) {
    const me = this.getPlayer(playerId);
    const reveal = this.phase === "judging" || this.phase === "roundEnd";
    const showNames = this.phase === "roundEnd" || this.phase === "gameOver";
    const mySub = this.submissions.find((s) => s.playerId === playerId);
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      minPlayers: MIN_PLAYERS,
      hostId: this.hostId,
      czarId: this.czarId,
      me: me ? { id: me.id, name: me.name } : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        submitted: this.submissions.some((s) => s.playerId === p.id),
        roomWins: this.roomWins[p.name] || 0,
      })),
      czarQueue: this.czarOrder
        .map((_, i) => this.czarOrder[(this.czarIndex + i) % this.czarOrder.length])
        .filter((id) => this.getPlayer(id))
        .map((id) => this.getPlayer(id).name),
      blackCard:
        this.blackCard !== null && this.phase !== "lobby"
          ? { text: CARDS.black[this.blackCard].text, pick: CARDS.black[this.blackCard].pick }
          : null,
      hand: me ? me.hand.map((id) => ({ id, text: CARDS.white[id] })) : [],
      mySubmission: mySub ? mySub.cards.map((c) => CARDS.white[c]) : null,
      submissionsCount: this.submissions.length,
      submissions: reveal
        ? this.revealOrder
            .map((sid) => this.submissions.find((s) => s.id === sid))
            .filter(Boolean)
            .map((s) => ({
              id: s.id,
              cards: s.cards.map((c) => CARDS.white[c]),
              playerName: showNames ? this.getPlayer(s.playerId)?.name ?? "?" : null,
            }))
        : [],
      lastRound: this.lastRound,
      nextRoundAt: this.nextRoundAt,
      history: this.history,
      aborted: !!this.aborted,
    };
  }
}

export const newRoomCode = (taken) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (taken.has(code));
  return code;
};
