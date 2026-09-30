// Globalna tablica wyników zapisywana w data/leaderboard.json
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "leaderboard.json");

const load = () => {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, "utf8"));
  } catch (e) {
    console.error("Nie udało się wczytać tablicy wyników:", e);
  }
  return { players: {}, games: [] };
};

let data = load();
let saveTimer = null;

const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    renameSync(tmp, FILE);
  }, 300);
};

const entry = (name) => {
  const key = name.trim().toLowerCase();
  data.players[key] ??= { name, gamesPlayed: 0, gamesWon: 0, roundsWon: 0, lastPlayed: null };
  data.players[key].name = name;
  return data.players[key];
};

export const recordRoundWin = (name) => {
  const e = entry(name);
  e.roundsWon++;
  e.lastPlayed = new Date().toISOString();
  save();
};

export const recordGame = (room) => {
  const ranking = [...room.players].sort((a, b) => b.score - a.score);
  ranking.forEach((p, i) => {
    const e = entry(p.name);
    e.gamesPlayed++;
    if (i === 0) e.gamesWon++;
    e.lastPlayed = new Date().toISOString();
  });
  data.games.unshift({
    date: new Date().toISOString(),
    room: room.code,
    rounds: room.round,
    results: ranking.map((p) => ({ name: p.name, score: p.score })),
  });
  data.games = data.games.slice(0, 100);
  save();
};

export const getLeaderboard = () => ({
  players: Object.values(data.players).sort(
    (a, b) => b.gamesWon - a.gamesWon || b.roundsWon - a.roundsWon || a.name.localeCompare(b.name, "pl"),
  ),
  games: data.games.slice(0, 20),
});
