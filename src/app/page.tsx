"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { emit } from "@/lib/socket";
import { lastName, saveSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(lastName());
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await emit<{ code: string; playerId: string; token: string }>("room:create", { name });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession(res.code, { playerId: res.playerId, token: res.token, name: name.trim() });
    router.push(`/pokoj/${res.code}`);
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const c = code.trim().toUpperCase();
    const res = await emit<{ code: string; playerId: string; token: string; name: string }>("room:join", { code: c, name });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession(res.code, { playerId: res.playerId, token: res.token, name: res.name });
    router.push(`/pokoj/${res.code}`);
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Karty dżentelmenów</h1>
        <p className="mt-2 text-zinc-600">
          Uzupełniaj czarne karty najzabawniejszymi białymi. Sędzia wybiera najlepszą odpowiedź.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">Twój pseudonim</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="np. Pan Zdzisław"
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-900"
          />
        </label>

        <form onSubmit={create}>
          <button
            disabled={busy || !name.trim()}
            className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-40"
          >
            Utwórz nowy pokój
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" /> albo dołącz <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form onSubmit={join} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="KOD"
            className="w-28 rounded-xl border border-zinc-300 px-3 py-2.5 text-center font-mono text-lg tracking-widest uppercase outline-none focus:border-zinc-900"
          />
          <button
            disabled={busy || !name.trim() || code.trim().length !== 4}
            className="flex-1 rounded-xl border border-zinc-900 py-2.5 font-semibold transition hover:bg-zinc-100 disabled:opacity-40"
          >
            Dołącz do pokoju
          </button>
        </form>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        <h2 className="mb-2 font-semibold text-zinc-900">Jak grać?</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Jedna osoba tworzy pokój i podaje reszcie 4-literowy kod (albo link).</li>
          <li>Kolejka sędziów jest losowana na starcie – sędzia zmienia się co rundę.</li>
          <li>Pozostali wybierają z ręki białe karty pasujące do czarnej karty.</li>
          <li>Sędzia anonimowo wybiera najlepszą odpowiedź – autor dostaje punkt.</li>
          <li>Wygrywa pierwsza osoba, która zdobędzie ustaloną liczbę punktów.</li>
        </ol>
      </div>
    </div>
  );
}
