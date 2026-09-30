import type { ReactNode } from "react";

const BLANK = "____";

/** Tekst czarnej karty z wstawionymi odpowiedziami (jeśli są). */
export function FilledText({ text, answers }: { text: string; answers?: string[] }) {
  if (!answers || answers.length === 0) {
    const parts = text.split(BLANK);
    return (
      <>
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && <span className="inline-block w-16 border-b-2 border-current align-baseline" />}
          </span>
        ))}
      </>
    );
  }
  const clean = (a: string) => a.replace(/[.!?]$/, "");
  const parts = text.split(BLANK);
  if (parts.length === 1) {
    return (
      <>
        {text}{" "}
        <strong className="text-amber-300">{answers.map(clean).join(", ")}.</strong>
      </>
    );
  }
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    out.push(<span key={`t${i}`}>{p}</span>);
    if (i < parts.length - 1) {
      let a = clean(answers[i] ?? BLANK);
      // mała litera w środku zdania
      if (p.trim().length > 0 && !/[.!?:]\s*$/.test(p)) a = a.charAt(0).toLowerCase() + a.slice(1);
      out.push(
        <strong key={`a${i}`} className="text-amber-300">
          {a}
        </strong>,
      );
    }
  });
  return <>{out}</>;
}

export function BlackCard({ text, pick, answers, small }: { text: string; pick: number; answers?: string[]; small?: boolean }) {
  return (
    <div
      className={`relative flex flex-col justify-between rounded-2xl bg-zinc-900 text-white shadow-lg ${
        small ? "p-4 text-base" : "min-h-56 p-6 text-xl sm:text-2xl"
      } font-semibold leading-snug`}
    >
      <p>
        <FilledText text={text} answers={answers} />
      </p>
      <div className="mt-6 flex items-center justify-between text-xs font-medium text-zinc-400">
        <span>Karty dżentelmenów</span>
        {pick > 1 && <span className="rounded-full bg-white px-2 py-0.5 text-zinc-900">Wybierz {pick}</span>}
      </div>
    </div>
  );
}

export function WhiteCard({
  text,
  selectedIndex,
  onClick,
  disabled,
  highlight,
  footer,
}: {
  text: string;
  selectedIndex?: number; // 0-based kolejność wybrania
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  footer?: ReactNode;
}) {
  const selected = selectedIndex !== undefined && selectedIndex >= 0;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      className={`relative flex min-h-36 w-full flex-col justify-between rounded-2xl border bg-white p-4 text-left text-base font-semibold leading-snug text-zinc-900 shadow-sm transition ${
        onClick && !disabled ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
      } ${disabled ? "opacity-60" : ""} ${
        selected ? "border-zinc-900 ring-2 ring-zinc-900" : highlight ? "border-amber-400 ring-2 ring-amber-400" : "border-zinc-200"
      }`}
    >
      <span>{text}</span>
      {footer && <span className="mt-3 text-xs font-medium text-zinc-500">{footer}</span>}
      {selected && (
        <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-sm text-white">
          {selectedIndex! + 1}
        </span>
      )}
    </Tag>
  );
}
