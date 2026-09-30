import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tablica wyników · Karty dżentelmenów" };

interface Entry {
  name: string;
  gamesPlayed: number;
  gamesWon: number;
  roundsWon: number;
  lastPlayed: string | null;
}
interface Game {
  date: string;
  room: string;
  rounds: number;
  results: { name: string; score: number }[];
}

function load(): { players: Entry[]; games: Game[] } {
  const file = path.join(process.cwd(), "data", "leaderboard.json");
  try {
    if (existsSync(file)) {
      const d = JSON.parse(readFileSync(file, "utf8"));
      const players = (Object.values(d.players ?? {}) as Entry[]).sort(
        (a, b) => b.gamesWon - a.gamesWon || b.roundsWon - a.roundsWon || a.name.localeCompare(b.name, "pl"),
      );
      return { players, games: (d.games ?? []).slice(0, 20) };
    }
  } catch {}
  return { players: [], games: [] };
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "–";

export default function Leaderboard() {
  const { players, games } = load();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tablica wyników</h1>
        <p className="text-zinc-600">Statystyki wszystkich rozegranych partii na tym serwerze.</p>
      </div>

      {players.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-600">
          Nie rozegrano jeszcze żadnej partii.{" "}
          <Link href="/" className="font-semibold text-zinc-900 underline">
            Zacznij grę
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Gracz</th>
                <th className="px-4 py-3 text-right">Wygrane partie</th>
                <th className="px-4 py-3 text-right">Rozegrane</th>
                <th className="px-4 py-3 text-right">% wygranych</th>
                <th className="px-4 py-3 text-right">Wygrane rundy</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Ostatnio</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.name} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2.5 tabular-nums text-zinc-400">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">{p.gamesWon}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.gamesPlayed}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.gamesPlayed ? Math.round((p.gamesWon / p.gamesPlayed) * 100) : 0}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.roundsWon}</td>
                  <td className="hidden px-4 py-2.5 text-right text-zinc-500 sm:table-cell">{fmt(p.lastPlayed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {games.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Ostatnie partie</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g, i) => (
              <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
                <div className="mb-2 flex justify-between text-xs text-zinc-500">
                  <span>{fmt(g.date)}</span>
                  <span>
                    pokój {g.room} · {g.rounds} rund
                  </span>
                </div>
                <ol className="space-y-0.5">
                  {g.results.map((r, j) => (
                    <li key={j} className={`flex justify-between ${j === 0 ? "font-bold" : "text-zinc-600"}`}>
                      <span>
                        {j + 1}. {r.name}
                      </span>
                      <span className="tabular-nums">{r.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
