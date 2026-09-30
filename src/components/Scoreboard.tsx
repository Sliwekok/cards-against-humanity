import type { GameState } from "@/lib/types";

export default function Scoreboard({
  state,
  onKick,
}: {
  state: GameState;
  onKick?: (id: string) => void;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"));
  const inGame = state.phase !== "lobby";
  const isHost = state.me?.id === state.hostId;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Wyniki</h2>
        {inGame && <span className="text-xs text-zinc-400">do {state.settings.pointsToWin} pkt</span>}
      </div>
      <ol className="space-y-1.5">
        {sorted.map((p, i) => {
          const isCzar = inGame && p.id === state.czarId && state.phase !== "gameOver";
          const status = !p.connected
            ? "rozłączony"
            : isCzar
              ? "sędzia"
              : state.phase === "playing"
                ? p.submitted
                  ? "zagrał"
                  : "myśli…"
                : "";
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${p.id === state.me?.id ? "bg-zinc-100" : ""} ${
                p.connected ? "" : "opacity-50"
              }`}
            >
              <span className="w-5 text-right text-sm tabular-nums text-zinc-400">{inGame ? i + 1 : "•"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {p.name}
                {p.id === state.hostId && <span title="Gospodarz" className="ml-1 text-xs text-zinc-400">(host)</span>}
              </span>
              {status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isCzar
                      ? "bg-zinc-900 text-white"
                      : p.submitted && state.phase === "playing"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {status}
                </span>
              )}
              {inGame && <span className="w-6 text-right font-semibold tabular-nums">{p.score}</span>}
              {isHost && onKick && p.id !== state.me?.id && (
                <button
                  type="button"
                  onClick={() => onKick(p.id)}
                  title="Wyrzuć z pokoju"
                  className="text-zinc-300 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {state.players.some((p) => p.roomWins > 0) && (
        <p className="mt-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
          Wygrane partie w tym pokoju:{" "}
          {state.players
            .filter((p) => p.roomWins > 0)
            .sort((a, b) => b.roomWins - a.roomWins)
            .map((p) => `${p.name} ${p.roomWins}`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
