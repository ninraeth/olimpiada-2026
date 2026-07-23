# Olimpiada Bieździadów 2026 — PWA

Progresywna aplikacja webowa (PWA) do śledzenia wyników turnieju.  
Dane są **tylko do odczytu** i pochodzą z publicznego arkusza Google Sheets.

## Skąd pochodzą dane?

Aplikacja pobiera arkusze z dokumentu:

**[Olimpiada Bieździadów 2026 (Google Sheets)](https://docs.google.com/spreadsheets/d/18Frm47PTR0FCaZs4QoELydkQNmLQWmvU)**

- ID arkusza: `18Frm47PTR0FCaZs4QoELydkQNmLQWmvU` (ustawione w `js/config.js` jako `SPREADSHEET_ID`).
- Każda zakładka w aplikacji odpowiada arkuszu o tej samej nazwie:  
  `Info`, `Gracze`, `Piłka Nożna`, `Piłka ind.`, `Siatkówka`, `Koszykówka`, `Badminton`, `Inne`.
- Źródło (preferowane): oficjalny eksport CSV Google  
  `export?format=csv&gid=…` (GID-y w `js/config.js` → `SHEET_GIDS`).  
  Ten sposób **zachowuje tekst** w komórkach (np. literę `s` w koszykówce).  
- Zapasowo: `gviz/tq` (uwaga: bywa, że gubi tekst w kolumnach liczbowych) oraz [OpenSheet](https://opensheet.elk.sh/).
- Po udanym pobraniu dane trafiają do `localStorage` (offline / błąd sieci).
- Auto-odświeżanie co 5 minut (oraz przycisk ↻ i powrót do karty przeglądarki).

Arkusz musi być udostępniony jako **„Każdy z linkiem → Przeglądający”**.

Lokalna kopia szablonu: `Olimpiada2026_v2.xlsx` (wersja **2.1**).

## Uruchomienie lokalne

Aplikacja jest statyczna (HTML/CSS/JS). Potrzebujesz lokalnego serwera HTTP (moduły ES i Service Worker nie działają poprawnie z `file://`).

```bash
# Node.js
npx --yes serve .

# albo Python
python -m http.server 8080
```

Następnie otwórz w przeglądarce adres wskazany przez serwer (np. `http://localhost:3000` lub `http://localhost:8080`).

## Deploy

### Vercel

1. Połącz repozytorium z [Vercel](https://vercel.com) albo:

```bash
npx vercel
```

2. Framework preset: **Other** (static).  
3. Plik `vercel.json` ustawia nagłówki dla service workera.

### GitHub Pages

1. Wypchnij projekt do repozytorium.
2. Settings → Pages → Source: branch `main` (folder `/` lub `/docs`).
3. Upewnij się, że ścieżki w HTML są względne (`./js/...`) — już tak jest.

Po wdrożeniu na HTTPS: w przeglądarce mobilnej **„Dodaj do ekranu głównego”**.

## Struktura projektu

```
├── index.html
├── css/styles.css
├── js/
│   ├── app.js          # nawigacja, odświeżanie
│   ├── config.js       # ID arkusza, zakładki
│   ├── data.js         # fetch + parser
│   ├── render.js       # UI
│   └── sw-register.js
├── icons/
├── manifest.webmanifest
├── sw.js
├── vercel.json
├── Olimpiada2026_v2.xlsx
└── scripts/rebuild_xlsx.py
```

## Struktura arkusza (szablon 2.1)

### Znaczniki sekcji

W arkuszu dyscypliny używaj w kolumnie **A**:

| Znacznik | Znaczenie |
|----------|-----------|
| `# DRUŻYNY` | Tabela drużyn |
| `# MECZE` | Tabela meczów |
| `# RANKING` | Ranking indywidualny |
| `# GRACZE` | Lista graczy (koszykówka, badminton) |
| `# SEKCJA \| Nazwa` | Dowolna tabela (arkusz **Inne**) |

Pod znacznikiem: **wiersz nagłówków**, potem wiersze danych.  
Kolumny `ID_*` (szare) — tylko do edycji w Sheets, **ukryte w aplikacji**.

### Piłka Nożna / Siatkówka

1. `# DRUŻYNY` → składy drużyn (patrz niżej)
2. `# MECZE` → `ID_meczu | Faza | Drużyna 1 | Drużyna 2 | Wynik (X:Y)`
3. `# RANKING` → opcjonalne w arkuszu (w Siatkówce ranking liczy aplikacja)

**Składy drużyn — dwa obsługiwane układy:**

| | A (zalecany) | B (starszy) |
|---|---|---|
| Kolumny | `ID` \| `Nazwa drużyny` \| `Gracz 1` \| `Gracz 2` \| `Gracz 3` \| … | `ID` \| `Nazwa` \| `Gracze (po przecinku)` |
| Komórki | **jeden gracz = jedna kolumna** | wszyscy w jednej komórce, rozdzieleni przecinkiem |

Aplikacja zbiera **wszystkie kolumny po nazwie drużyny** (albo od kolumny „Gracze” w prawo).  
Ten sam gracz w kilku drużynach → wpisz go w wierszu każdej z tych drużyn.

**Siatkówka / Piłka Nożna — ranking automatyczny:**  
dla każdego gracza ze składów liczone są mecze z wynikiem `X:Y`  
(Siatkówka = sety, Piłka = gole).  
% zwycięstw = wygrane / rozegrane; różnica = zdobyte − stracone (perspektywa drużyny gracza).  
Gracz w **kilku drużynach** — sumowane mecze wszystkich jego drużyn.  
W **obu** składach jednego meczu — mecz liczy się **dwa razy**.  
Sortowanie: % zwycięstw ↓, potem różnica setów/goli ↓.  

**Wynik meczu:** format `X:Y` jako **tekst** (żeby Sheets nie zamienił na godzinę).

### Strefa medalowa (każda dyscyplina)

Na końcu arkusza i zakładki:

```
# STREFA MEDALOWA
medal,nazwa,gracze
złoty,,
srebrny,,
brązowy,,
```

- `nazwa` — gracz lub drużyna (wpisywane ręcznie)
- `gracze` — opcjonalny skład drużyny (po przecinku)
- Aplikacja pokazuje podium 🥇🥈🥉 na dole każdej zakładki dyscypliny.

Skrypt: `python scripts/add_medal_zones.py` (dopisuje sekcję do lokalnego xlsx z aktualnego Google).

### Koszykówka

`# GRACZE` → `ID_gracza | Imię gracza | WYNIK | Próba 1… | Próba 2… | Próba N…`  

Kolumny prób: `Próba N - 1P`, `Próba N - 2P`, `Próba N - 3P`, `Próba N - UK1`, `Próba N - UK2`  
(można dodać więcej niż 3 próby — wystarczy dopisać kolejne kolumny w tym samym formacie).

**Wynik w aplikacji** (nie zwykła średnia ze wszystkich komórek) — tak samo **Piłka ind.**:
1. Dla każdej wypełnionej próby: średnia z pól kategorii tej próby  
   - Koszykówka: `1P, 2P, 3P, UK1, UK2`  
   - Piłka ind.: `Karne, 1na1, Luta`
2. Jedna próba → ta średnia jest wynikiem
3. Dwie lub więcej → **50%** średnia najlepszej próby + **50%** średnia ze średnich pozostałych prób

**Litera `S` / `s` w komórce próby** (np. `Próba 1 - 3P` / `Próba 1 - Karne`):
w obliczeniach: **50%** × najgorszy wynik tego typu ze **wszystkich prób wszystkich graczy** + **50%** × średnia tego typu.  
Inne komórki `S` nie wchodzą do puli.

Kolumna **WYNIK** w arkuszu jest opcjonalna (aplikacja liczy wynik z prób).  
Źródło: preferowany eksport CSV (`SHEET_GIDS` w `config.js`) — zachowuje literę `s`.

### Badminton

`# GRACZE` (opcjonalnie), `# MECZE`, `# RANKING` (opcjonalnie).  
Bez listy graczy aplikacja zbiera imiona z meczów.

### Inne

```
# SEKCJA | Nazwa konkurencji
miejsce | uczestnik | wynik | uwagi
1       | ...       | ...   |
```

### Dodawanie meczów / graczy

Dopisz **nowy wiersz** pod tabelą (z kolejnym ID).  
Nie zostawiaj wierszy „tylko ID” bez fazy / nazw — parser je pomija.

### Kompatybilność ze starym szablonem (2.0)

Parser rozpoznaje też układ legacy (`DRUŻYNY`, `MECZE (faza pucharowa)`, dane od kolumny B).  
Zalecana synchronizacja Google Sheets z lokalnym `Olimpiada2026_v2.xlsx` (v2.1).

Przebudowa xlsx:

```bash
python scripts/rebuild_xlsx.py
```

## Konfiguracja

W `js/config.js` możesz zmienić:

- `SPREADSHEET_ID` — inny dokument Google
- `TABS` — nazwy arkuszy / etykiety zakładek
- `REFRESH_INTERVAL_MS` — interwał auto-odświeżania

## Wymagania techniczne

- Nowoczesna przeglądarka z ES modules
- Publiczny arkusz Google (link do przeglądania)
- HTTPS na produkcji (PWA / Service Worker)

## Licencja

Projekt turniejowy — do swobodnego użycia przez organizatorów Olimpiady Bieździadów 2026.
