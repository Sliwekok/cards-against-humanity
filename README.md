# Karty dżentelmenów

Imprezowa gra karciana w stylu *Cards Against Humanity* – dla 3–12 osób, każda na swoim urządzeniu (telefon, laptop).
Next.js 16 + React 19 + Tailwind 4, komunikacja w czasie rzeczywistym przez **Socket.IO** (WebSockety).

## Uruchomienie

```bash
npm install          # jednorazowo (doinstaluje socket.io)
npm run dev          # tryb deweloperski
# albo produkcyjnie (szybciej, zalecane do grania):
npm run build
npm start
```

Po starcie serwer wypisze adresy, np.:

```
- na tym komputerze:  http://localhost:3000
- w sieci lokalnej:   http://192.168.1.23:3000
```

Pozostali gracze otwierają adres „w sieci lokalnej” (ta sama sieć Wi-Fi).
Jeśli się nie łączą – zezwól Node.js na ruch w Zaporze Windows (sieci prywatne). Port zmienisz zmienną `PORT`.

> To aplikacja z własnym serwerem Node (`server.mjs`) – nie działa przez Apache z XAMPP-a.

## Zasady

1. Gospodarz tworzy pokój i przekazuje 4-literowy kod lub link.
2. Po starcie losowana jest kolejka sędziów – w każdej rundzie sędzią jest kolejna osoba.
3. Pozostali wybierają z ręki 1 lub 2 białe karty (w kolejności) pasujące do czarnej karty.
4. Gdy wszyscy zagrają, odpowiedzi są odkrywane anonimowo. Sędzia wybiera najlepszą – autor dostaje punkt.
5. Wygrywa osoba, która pierwsza zdobędzie ustaloną liczbę punktów (domyślnie 7).

Dodatkowo: powrót do gry po odświeżeniu / utracie Wi-Fi, przekazanie roli gospodarza, wyrzucanie graczy,
pomijanie rundy, automatyczne pominięcie rundy, gdy sędzia rozłączy się na 20 s.

## Struktura

| Plik | Opis |
|---|---|
| `server.mjs` | serwer HTTP: Next.js + Socket.IO |
| `server/game.mjs` | logika gry (talie, rundy, punkty, kolejka sędziów) |
| `server/leaderboard.mjs` | globalna tablica wyników → `data/leaderboard.json` |
| `data/cards.json` | karty: `black` (`text`, `pick`) i `white` – `____` oznacza lukę |
| `src/app/page.tsx` | strona główna (utwórz / dołącz) |
| `src/app/pokoj/[kod]/page.tsx` | ekran gry |
| `src/app/wyniki/page.tsx` | tablica wyników wszech czasów |

Własne karty dopisujesz w `data/cards.json` (potem restart serwera).
