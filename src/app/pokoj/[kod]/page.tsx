"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { emit, getSocket } from "@/lib/socket";
import { clearSession, lastName, loadSession, saveSession } from "@/lib/session";
import type { GameState } from "@/lib/types";
import { BlackCard, WhiteCard } from "@/components/Cards";
import Scoreboard from "@/components/Scoreboard";

type JoinRes = { code: string; playerId: string; token: string; name: string };

export default function RoomPage() {
  const { kod } = useParams<{ kod: string }>();
  const code = String(kod).toUpperCase();
  const router = useRouter();

  const [state, setState] = useState<GameState | null>(null);
  const [needName, setNeedName] = useState(false);
  const [fatal, setFatal] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);

  const rejoin = useCallback(async () => {
    const s = loadSession(code);
    if (!s) return setNeedName(true);
    const res = await emit<JoinRes>("room:join", { code, playerId: s.playerId, token: s.token });
    if (res.ok) return setNeedName(false);
    if (res.error === "SESSION_EXPIRED") {
      clearSession(code);
      setNeedName(true);
    } else setFatal(res.error);
  }, [code]);

  useEffect(() => {
    const socket = getSocket();
    const onState = (s: GameState) => setState(s);
    const onConnect = () => {
      setConnected(true);
      rejoin();
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = (msg: string) => {
      clearSession(code);
      setState(null);
      setFatal(msg);
    };
    socket.on("state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("kicked", onKicked);
    if (socket.connected) rejoin();
    return () => {
      socket.off("state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("kicked", onKicked);
    };
  }, [code, rejoin]);

  const act = async (event: string, payload?: unknown) => {
    setError("");
    const res = await emit(event, payload);
    if (!res.ok) setError(res.error);
    return res.ok;
  };

  const leave = async () => {
    await emit("room:leave");
    clearSession(code);
    router.push("/");
  };

  if (fatal) {
    return (
      <Centered>
        <p className="text-lg font-semibold">{fatal}</p>
        <Link href="/" className="mt-4 inline-block rounded-xl bg-zinc-900 px-5 py-2.5 font-semibold text-white">
          Wróć na stronę główną
        </Link>
      </Centered>
    );
  }

  if (needName) return <JoinForm code={code} onJoined={() => setNeedName(false)} onFatal={setFatal} />;
  if (!state) return <Centered>Łączenie z pokojem {code}…</Centered>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-5">
        {!connected && (
          <div className="rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900">
            Utracono połączenie z serwerem – próbuję połączyć ponownie…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
            <button onClick={() => setError("")} className="ml-3 text-red-400 hover:text-red-700">
              ✕
            </button>
          </div>
        )}
        <GameArea state={state} act={act} />
      </div>

      <aside className="space-y-4">
        <RoomInfo code={code} />
        <Scoreboard state={state} onKick={(id) => act("room:kick", { playerId: id })} />
        {state.phase !== "lobby" && state.czarQueue.length > 0 && state.phase !== "gameOver" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Kolejka sędziów</h2>
            <ol className="space-y-1">
              {state.czarQueue.map((n, i) => (
                <li key={n} className={i === 0 ? "font-semibold" : "text-zinc-600"}>
                  {i === 0 ? "▶ " : `${i}. `}
                  {n}
                </li>
              ))}
            </ol>
          </section>
        )}
        {state.history.length > 0 && <History state={state} />}
        <div className="flex gap-2">
          {state.me?.id === state.hostId && ["playing", "judging"].includes(state.phase) && (
            <button
              onClick={() => act("round:skip")}
              className="flex-1 rounded-xl border border-zinc-300 bg-white py-2 text-sm hover:bg-zinc-50"
            >
              Pomiń rundę
            </button>
          )}
          <button
            onClick={leave}
            className="flex-1 rounded-xl border border-zinc-300 bg-white py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Opuść pokój
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md py-16 text-center text-zinc-600">{children}</div>;
}

function JoinForm({ code, onJoined, onFatal }: { code: string; onJoined: () => void; onFatal: (m: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setName(lastName()), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await emit<JoinRes>("room:join", { code, name });
    if (!res.ok) {
      if (res.error.startsWith("Nie znaleziono")) onFatal(res.error);
      else setError(res.error);
      return;
    }
    saveSession(code, { playerId: res.playerId, token: res.token, name: res.name });
    onJoined();
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">
        Dołącz do pokoju <span className="font-mono">{code}</span>
      </h1>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        placeholder="Twój pseudonim"
        className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-900"
      />
      <button
        disabled={!name.trim()}
        className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
      >
        Dołącz
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function RoomInfo({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <section className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500">Kod pokoju</div>
        <div className="font-mono text-2xl font-bold tracking-[0.3em]">{code}</div>
      </div>
      <button onClick={copy} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">
        {copied ? "Skopiowano!" : "Kopiuj link"}
      </button>
    </section>
  );
}

function History({ state }: { state: GameState }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Historia rund</h2>
      <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {state.history.map((h) => (
          <li key={h.round} className="border-b border-zinc-100 pb-2 last:border-0">
            <div className="text-xs text-zinc-400">
              Runda {h.round} · sędzia {h.czarName}
            </div>
            <div className="text-zinc-700">{h.black}</div>
            <div className="font-medium">
              → {h.cards.join(" / ")} <span className="text-zinc-500">({h.winnerName})</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

type Act = (event: string, payload?: unknown) => Promise<boolean>;

function GameArea({ state, act }: { state: GameState; act: Act }) {
  switch (state.phase) {
    case "lobby":
      return <Lobby state={state} act={act} />;
    case "playing":
      return <Playing state={state} act={act} />;
    case "judging":
    case "roundEnd":
      return <Judging state={state} act={act} />;
    case "gameOver":
      return <GameOver state={state} act={act} />;
  }
}

function PhaseHeader({ state, children }: { state: GameState; children: React.ReactNode }) {
  const czar = state.players.find((p) => p.id === state.czarId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
      <span>
        Runda <strong className="text-zinc-900">{state.round}</strong> · sędzia{" "}
        <strong className="text-zinc-900">{czar?.id === state.me?.id ? "Ty" : czar?.name}</strong>
      </span>
      <span>{children}</span>
    </div>
  );
}

function Lobby({ state, act }: { state: GameState; act: Act }) {
  const isHost = state.me?.id === state.hostId;
  const active = state.players.filter((p) => p.connected).length;
  const enough = active >= state.minPlayers;
  const host = state.players.find((p) => p.id === state.hostId);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Poczekalnia</h1>
        <p className="mt-1 text-zinc-600">
          Podaj znajomym kod <span className="font-mono font-bold">{state.code}</span> albo wyślij im link. Każdy gra na
          swoim urządzeniu.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Punkty do wygranej</span>
            <input
              type="number"
              min={1}
              max={30}
              disabled={!isHost}
              value={state.settings.pointsToWin}
              onChange={(e) => act("settings:update", { ...state.settings, pointsToWin: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 disabled:bg-zinc-50"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Kart na ręce</span>
            <input
              type="number"
              min={5}
              max={12}
              disabled={!isHost}
              value={state.settings.handSize}
              onChange={(e) => act("settings:update", { ...state.settings, handSize: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 disabled:bg-zinc-50"
            />
          </label>
        </div>

        <div className="mt-6">
          {isHost ? (
            <button
              onClick={() => act("game:start")}
              disabled={!enough}
              className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              {enough ? "Rozpocznij grę" : `Czekamy na graczy (${active}/${state.minPlayers})`}
            </button>
          ) : (
            <p className="rounded-xl bg-zinc-100 py-3 text-center text-zinc-600">
              Czekamy, aż {host?.name ?? "gospodarz"} rozpocznie grę… ({active} graczy)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Playing({ state, act }: { state: GameState; act: Act }) {
  const [sel, setSel] = useState<{ round: number; ids: number[] }>({ round: 0, ids: [] });
  const selected = sel.round === state.round ? sel.ids : [];
  const pick = state.blackCard?.pick ?? 1;
  const isCzar = state.me?.id === state.czarId;
  const isHost = state.me?.id === state.hostId;
  const needed = state.players.filter((p) => p.connected && p.id !== state.czarId).length;

  const toggle = (id: number) => {
    const ids = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : pick === 1
        ? [id]
        : selected.length < pick
          ? [...selected, id]
          : selected;
    setSel({ round: state.round, ids });
  };

  const selectedTexts = selected.map((id) => state.hand.find((c) => c.id === id)?.text ?? "");

  return (
    <div className="space-y-5">
      <PhaseHeader state={state}>
        Zagrało {state.submissionsCount}/{needed}
      </PhaseHeader>

      {state.blackCard && (
        <BlackCard
          text={state.blackCard.text}
          pick={pick}
          answers={state.mySubmission ?? (selected.length ? selectedTexts : undefined)}
        />
      )}

      {isCzar ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center">
          <p className="font-semibold">Jesteś sędzią w tej rundzie.</p>
          <p className="text-sm text-zinc-600">Poczekaj, aż wszyscy zagrają – potem wybierzesz najlepszą odpowiedź.</p>
        </div>
      ) : state.mySubmission ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-900">
          Zagrane! Czekamy na pozostałych graczy…
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <span className="text-sm text-zinc-600">
            {pick > 1 ? `Wybierz ${pick} karty w kolejności (${selected.length}/${pick}).` : "Wybierz jedną kartę."}
          </span>
          <button
            disabled={selected.length !== pick}
            onClick={() => act("card:submit", { cards: selected })}
            className="rounded-xl bg-zinc-900 px-6 py-2.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            Zagraj
          </button>
        </div>
      )}

      {(isCzar || isHost) && state.submissionsCount > 0 && state.submissionsCount < needed && (
        <button onClick={() => act("round:force")} className="text-sm text-zinc-500 underline hover:text-zinc-900">
          Nie czekaj na resztę – odkryj odpowiedzi teraz
        </button>
      )}

      <Hand state={state} selected={selected} onToggle={!isCzar && !state.mySubmission ? toggle : undefined} />
    </div>
  );
}

function Hand({
  state,
  selected,
  onToggle,
}: {
  state: GameState;
  selected: number[];
  onToggle?: (id: number) => void;
}) {
  if (state.hand.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Twoje karty</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {state.hand.map((c) => (
          <WhiteCard
            key={c.id}
            text={c.text}
            selectedIndex={selected.indexOf(c.id)}
            onClick={onToggle ? () => onToggle(c.id) : undefined}
            disabled={!onToggle}
          />
        ))}
      </div>
    </section>
  );
}

function Countdown({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.ceil((at - now) / 1000))}</>;
}

function Judging({ state, act }: { state: GameState; act: Act }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const isCzar = state.me?.id === state.czarId;
  const isHost = state.me?.id === state.hostId;
  const ended = state.phase === "roundEnd";
  const czar = state.players.find((p) => p.id === state.czarId);
  const pick = state.blackCard?.pick ?? 1;
  const winnerSub = state.submissions.find((s) => s.id === state.lastRound?.submissionId);
  const preview = ended ? winnerSub : state.submissions.find((s) => s.id === chosen);

  return (
    <div className="space-y-5">
      <PhaseHeader state={state}>
        {ended ? (
          <>
            Następna runda za {state.nextRoundAt ? <Countdown at={state.nextRoundAt} /> : 0} s
          </>
        ) : isCzar ? (
          "Wybierz najlepszą odpowiedź"
        ) : (
          `${czar?.name ?? "Sędzia"} wybiera…`
        )}
      </PhaseHeader>

      {ended && state.lastRound && (
        <div className="rounded-2xl bg-amber-100 p-4 text-center text-amber-950">
          <span className="text-lg font-bold">
            {state.lastRound.winnerId === state.me?.id ? "Ty wygrywasz" : `${state.lastRound.winnerName} wygrywa`} tę rundę!
          </span>{" "}
          +1 punkt
        </div>
      )}

      {state.blackCard && <BlackCard text={state.blackCard.text} pick={pick} answers={preview?.cards} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {state.submissions.map((s) => {
          const isWinner = ended && s.id === state.lastRound?.submissionId;
          const clickable = isCzar && !ended;
          return (
            <div
              key={s.id}
              onClick={clickable ? () => setChosen(s.id) : undefined}
              className={`space-y-2 rounded-2xl p-2 transition ${clickable ? "cursor-pointer hover:bg-zinc-200/60" : ""} ${
                chosen === s.id && !ended ? "bg-zinc-900/10 ring-2 ring-zinc-900" : ""
              } ${isWinner ? "bg-amber-100 ring-2 ring-amber-400" : ""}`}
            >
              {s.cards.map((t, i) => (
                <WhiteCard key={i} text={t} highlight={isWinner} />
              ))}
              {s.playerName && (
                <div className={`px-2 text-sm ${isWinner ? "font-bold" : "text-zinc-500"}`}>{s.playerName}</div>
              )}
            </div>
          );
        })}
      </div>

      {isCzar && !ended && (
        <button
          disabled={!chosen}
          onClick={() => chosen && act("czar:choose", { submissionId: chosen })}
          className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          {chosen ? "Wybierz tę odpowiedź" : "Kliknij odpowiedź, która cię rozbawiła najbardziej"}
        </button>
      )}

      {ended && (isCzar || isHost) && (
        <button
          onClick={() => act("round:next")}
          className="w-full rounded-xl border border-zinc-900 bg-white py-3 font-semibold hover:bg-zinc-50"
        >
          Następna runda teraz
        </button>
      )}

      {!isCzar && <Hand state={state} selected={[]} />}
    </div>
  );
}

function GameOver({ state, act }: { state: GameState; act: Act }) {
  const isHost = state.me?.id === state.hostId;
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        {state.aborted ? (
          <>
            <h1 className="text-2xl font-bold">Gra przerwana</h1>
            <p className="mt-1 text-zinc-600">Zostało za mało graczy, żeby kontynuować.</p>
          </>
        ) : (
          <>
            <div className="text-sm uppercase tracking-wide text-zinc-500">Koniec gry po {state.round} rundach</div>
            <h1 className="mt-1 text-3xl font-bold">{ranking[0]?.name} wygrywa!</h1>
          </>
        )}

        <ol className="mx-auto mt-6 max-w-sm space-y-2 text-left">
          {ranking.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-2 ${i === 0 && !state.aborted ? "bg-amber-100" : "bg-zinc-50"}`}
            >
              <span className="w-7 text-center">{medals[i] ?? `${i + 1}.`}</span>
              <span className="flex-1 font-medium">{p.name}</span>
              <span className="font-bold tabular-nums">{p.score} pkt</span>
            </li>
          ))}
        </ol>

        {isHost ? (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => act("game:start")}
              className="flex-1 rounded-xl bg-zinc-900 py-3 font-semibold text-white hover:bg-zinc-700"
            >
              Zagraj ponownie
            </button>
            <button
              onClick={() => act("game:lobby")}
              className="flex-1 rounded-xl border border-zinc-300 py-3 font-semibold hover:bg-zinc-50"
            >
              Wróć do poczekalni
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">Gospodarz może rozpocząć kolejną partię.</p>
        )}
        <Link href="/wyniki" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-900">
          Zobacz ogólną tablicę wyników
        </Link>
      </div>
    </div>
  );
}
