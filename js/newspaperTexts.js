/**
 * Newspaper headline/body templates per discipline and outcome type.
 * Format: "[[NAGŁÓWEK]] Treść body…"
 * Placeholders: #wygrany #przegrany #wynik #zloty #srebrny #brazowy #skladzloto
 *
 * Use template literals (backticks) for multi-line texts — plain "..." cannot span lines.
 */

export const newspaperTexts = {
  // ===== DYSCYPLINY DRUŻYNOWE + BADMINTON =====
  pilkaNozna: {
    close: [
      `[[DRAMAT DO KOŃCA]]
#wygrany i #przegrany stoczyli bój, jakiego dawno nie widziano na tych łąkach. Od pierwszych minut obie drużyny rzuciły się do walki z taką zaciętością, że trawa aż jęczała pod butami. Wynik #wynik padł dopiero po heroicznym starciu trwającym do ostatnich sekund. Strzały padały z dwóch stron jak w filmie gangsterskim, a kości trzeszczały jak stare radio. Ostatecznie to #wygrany wyszedł z tarczą, ale #przegrany może być dumny z postawy – oddał wszystko, co miał w nogach i sercu.`,
      `[[WOJNA O KAŻDĄ PIŁKĘ]]
Na boisku w Bieździadowie rozegrała się prawdziwa bitwa o honor i punkty. #wygrany pokonali #przegrany wynikiem #wynik dopiero po długotrwałych, zaciętych bojach w środku pola i desperackich obronach pod własnym polem karnym. Pot lał się strumieniami, nogi odmawiały posłuszeństwa, a kibice niemal weszli na murawę z emocji. Żadna z drużyn nie chciała oddać nawet cala ziemi. Takich meczów się nie zapomina – zostają w pamięci na całe lata.`,
      `[[LEDWO, LEDWO]]
Ktoś tu próbował grać w piłkę, a skończyło się na wojnie pozycyjnej. #wygrany ostatecznie ugryzł #przegrany wynikiem #wynik, ale różnica była mikroskopijna. Więcej było walki o każdy metr murawy niż efektownych akcji. Klasyczny, brudny i bardzo bieździadowski mecz.`,
    ],
    dominant: [
      `[[RZEŹ NIEWINIĄTEK]]
#wygrany nie tyle wygrali, co zmietli #przegrany z boiska wynikiem #wynik. Różnica klas była widoczna gołym okiem od momentu gdy piłkarze wchodzili na boisko, a nawet już wcześniej - gdy schodzili po schodach. #przegrany biegali jak dzieci we mgle zagubione na polu minowym. Za każdym golem #wygrany kolejna eksplozja. #przegrany byliby bezpieczniejsi szturmując plaże Normandii w D-Day niż stając dzisiaj do pojedynku z #wygrany. BUM! BUM! BUM!`,
      `[[BEZ LITOŚCI]]
To nie był mecz. To była egzekucja. #wygrany rozjechali #przegrany #wynik i nawet nie musieli się spocić. Każda akcja kończyła się zagrożeniem, każda strata piłki u rywali – kontrą. Kreatywność, polot i chirurgiczna wręcz precyzja z jaką #wygrany dekonstruowali obronę przeciwnika. #przegrany wyglądali, jakby dopiero dziś rano dowiedzieli się, że grają w piłkę nożną. Bieździadów zobaczył dziś pokaz siły.`,
      `[[RÓŻNICA KLAS]]
#wygrany potraktowali to spotkanie jak trening z przeszkodami. Wynik #wynik mówi wszystko. #przegrany próbowali walczyć, ale ich wysiłki przypominały rzucanie rozgotowanym grochem o ścianę - brudno i śmierdząco. Tempo, precyzję i pomysł widać było głównie po jednej stronie. Drugiej pozostało jedynie liczenie minut do końca cierpienia.`,
    ],
    finalClose: [
      `[[PIŁKARSKI TEATR MARZEŃ]]
Na tej skromnej bieździadowskiej łące rozegrał się dzisiaj dramat Szekspira w trampkach. Mrożące krew w żyłach sceny, o których następne pokolenia będą opowiadać przy ognisku w Halloween. Niczym pojedynek nieśmiertelnych tytanów, w którym żaden nie był gotowy odpuścić i z każdym przyjętym ciosem, straconym golem, stawał się jeszcze mocniejszy i bardziej rozjuszony. Wraz z ostatnim gwizdkiem ryk zwycięskich #wygrany był słyszalny aż w Jarocinie, a smak złota unosił się w powietrzu. Heroiczne zwycięstwo wynikiem #wynik pokazuje, że #przegrany też dali z siebie wszystko i zasłużyli na srebro. Bieździadów stał się dziś centrum piłkarskiego wszechświata. Nowi mistrzowie wszechświata to: #skladzloto`,
    ],
    finalDominant: [
      `[[ZŁOTA DEMOLKA]]
#wygrany pokazali dzisiaj całemu światu jak wygląda współczesny futbol w najlepszym wydaniu. Piłka krążyła jak po sznurku, którego koniec znajdował się w bramce #przegrany. Wychodzenie spod pressingu wydawało się spacerkiem z psem, którego kupę musieli posprzątać #przegrany. W środku pola #wygrany zbierali urodzajne plony swoich precyzyjnych zagrań, a #przegrany stali jak pijany rolnik machający na ślepo kosą. Pod samą bramką to już nie była piłka nożna, to był taniec — jeśli do tanga trzeba dwojga, to okazuje się, że ten drugi może tylko stać i patrzeć. Trzeba jednak oddać, że #przegrany też mieli swoje momenty, w których potrafili nawiązać klasą do rywala. Ostatecznie #wygrany nie pozostawili jednak cienia wątpliwości, kto zasługiwał na złoty medal: #skladzloto.`,
    ],
  },

  siatkowka: {
    close: [
      `[[BITWA NAD SIATKĄ]]
Od pierwszego gwizdka było jasne, że nikt nie zamierza odpuszczać ani jednej piłki. #wygrany imponowali spokojem i świetnym wyczuciem gry, cierpliwie budując przewagę w każdej kolejnej akcji. #przegrany odpowiadali ambitnie, szukając sposobu na przełamanie rytmu rywala i odwrócenie losów spotkania. Wynik #wynik potwierdził, kto tego dnia lepiej wykorzystał swoje atuty. Był to mecz, po którym jedni dopisali cenne zwycięstwo, a drudzy mogli zejść z boiska z przekonaniem, że zostawili na nim wszystko.`,
      `[[Mecz charakterów]]
Siatkówka nie wybacza zawahania, ale hojnie nagradza cierpliwość i konsekwencję. #wygrany od początku narzucili własne tempo, punktując wtedy, gdy nadarzała się okazja, i unikając prostych błędów. #przegrany walczyli ambitnie do ostatniej akcji, próbując znaleźć sposób na zatrzymanie rozpędzonego rywala. Wynik #wynik nie pozostawia wątpliwości, kto tego dnia lepiej odnalazł się na boisku, a kto myślami był już z piwkiem w basenie.`,
      `[[RYTM WYMIAN]]
#wygrany dyktowali dziś większość wymian i lepiej odczytywali kierunek piłki. Zagrywki i ataki kończyły się częściej po stronie #przegrany. Wyprowadzenia spod siatki wyglądały u nich płynniej, podczas gdy #przegrany musieli pracować nad utrzymaniem tempa. W środkowej strefie #wygrany układali akcje spokojnie, a #przegrany bronili się poprawnie, choć z lekkim opóźnieniem. Przy siatce różnica była widoczna, lecz #przegrany zaliczyli kilka udanych bloków. #wynik oddaje to co działo się na boisku.`,
    ],
    dominant: [
      `[[RYTM WYMIAN]]
#wygrany dyktowali dziś większość wymian i lepiej odczytywali kierunek piłki. Zagrywki i ataki kończyły się częściej po stronie #przegrany. Wyprowadzenia spod siatki wyglądały u nich płynniej, podczas gdy #przegrany musieli pracować nad utrzymaniem tempa. W środkowej strefie #wygrany układali akcje spokojnie, a #przegrany bronili się poprawnie, choć z lekkim opóźnieniem. Przy siatce różnica była widoczna, lecz #przegrany zaliczyli kilka udanych bloków. #wynik oddaje to co działo się na boisku.`,
      `[[Mecz charakterów]]
Siatkówka nie wybacza zawahania, ale hojnie nagradza cierpliwość i konsekwencję. #wygrany od początku narzucili własne tempo, punktując wtedy, gdy nadarzała się okazja, i unikając prostych błędów. #przegrany walczyli ambitnie do ostatniej akcji, próbując znaleźć sposób na zatrzymanie rozpędzonego rywala. Wynik #wynik nie pozostawia wątpliwości, kto tego dnia lepiej odnalazł się na boisku, a kto myślami był już z piwkiem w basenie.`,
      `[[BITWA NAD SIATKĄ]]
Od pierwszego gwizdka było jasne, że nikt nie zamierza odpuszczać ani jednej piłki. #wygrany imponowali spokojem i świetnym wyczuciem gry, cierpliwie budując przewagę w każdej kolejnej akcji. #przegrany odpowiadali ambitnie, szukając sposobu na przełamanie rytmu rywala i odwrócenie losów spotkania. Wynik #wynik potwierdził, kto tego dnia lepiej wykorzystał swoje atuty. Był to mecz, po którym jedni dopisali cenne zwycięstwo, a drudzy mogli zejść z boiska z przekonaniem, że zostawili na nim wszystko.`,
    ],
    finalClose: [
      `[[Siatkarski spektakl]]
To spotkanie miało wszystko, czego można oczekiwać od turniejowej siatkówki – efektowne akcje, odważne decyzje i walkę o każdy punkt. #wygrany przez całe spotkanie prezentowali dużą pewność siebie, zachowując koncentrację nawet wtedy, gdy presja rosła. #przegrany nie przestawali szukać swoich szans, zmuszając rywala do maksymalnego wysiłku. Takiego finału wszyscy oczekiwali, starcia na najwyższym poziomie, tak że nawet sąsiad zaczął latać dronem i podpatrywać co się dzieje, jak sławetny Pan Ryszard z Dziekany. Ostatecznie to #wygrany okazali się bardziej warci podglądania, być może nawet spuszczania się z dachu na pasach. Oto złoci mistrzowie siatkówki: #skladzloto.`,
    ],
    finalDominant: [
      `[[Siatkarski spektakl]]
To spotkanie miało wszystko, czego można oczekiwać od turniejowej siatkówki – efektowne akcje, odważne decyzje i walkę o każdy punkt. #wygrany przez całe spotkanie prezentowali dużą pewność siebie, zachowując koncentrację nawet wtedy, gdy presja rosła. #przegrany nie przestawali szukać swoich szans, zmuszając rywala do maksymalnego wysiłku. Takiego finału wszyscy oczekiwali, starcia na najwyższym poziomie, tak że nawet sąsiad zaczął latać dronem i podpatrywać co się dzieje, jak sławetny Pan Ryszard z Dziekany. Ostatecznie to #wygrany okazali się bardziej warci podglądania, być może nawet spuszczania się z dachu na pasach. Oto złoci mistrzowie siatkówki: #skladzloto.`,
    ],
  },

  badminton: {
    close: [
      `[[NA STYKU]]
Po zaciętym boju na korcie, #wygrany potwierdził swoje wysokie aspiracje i zdołał zwyciężyć #wynik. #przegrany jednak nie był tylko tłem w tym meczu i także pokazał, że przy odrobinie lepszej formy lub szczęścia mógłby przechylić szalę zwycięstwa na swoją korzyść.`,
      `[[POTWIERDZENIE FORMY]]
W powietrzu unosił się zapach chloru, gdy #wygrany i #przegrany podnieśli rakiety by stoczyć bój z lotką i wiatrem. #wygrany prowadził dziś wymianę z wyraźną przewagą w tempie, każde odbicie spod siatki wyglądało u niego bardziej naturalnie. Lotka zachowywała się przy jego rakietce przewidywalnie, a zagrania kończyły się częściej w polu #przegrany. Wynik #wynik można uznać za całkowicie sprawiedliwy.`,
      `[[MECZYCHO]]
Gdy rozpoczął się ten mecz, nikt nie przypuszczał, że lotka stanie się główną bohaterką prawdziwego dramatu. #wygrany i #przegrany walczyli z taką zawziętością, jakby stawką była beczka piwa. Większy apetyt na złocisty eliksir wykazał jednak #wygrany i to on odniósł zwycięstwo #wynik.`,
    ],
    dominant: [
      `[[PEWNE ZWYCIĘSTWO]]
Niektórzy przychodzą na kort walczyć. #wygrany przyszedł po prostu wygrać – i zrobił to z taką łatwością, że #przegrany mógł odnieść wrażenie, iż uczestniczy w prezentacji, pt. Jak grać w badmintona - skutecznie. Kolejne punkty wpadały z nieubłaganą regularnością, a odpowiedzi rywala znikały szybciej niż święta kiełbasa z rusztu grilla. Wynik #wynik mówi wszystko.`,
      `[[MECZYCHO]]
Gdy rozpoczął się ten mecz, nikt nie przypuszczał, że lotka stanie się główną bohaterką prawdziwego dramatu. #wygrany i #przegrany walczyli z taką zawziętością, jakby stawką była beczka piwa. Większy apetyt na złocisty eliksir wykazał jednak #wygrany i to on odniósł zwycięstwo #wynik.`,
      `[[POTWIERDZENIE FORMY]]
W powietrzu unosił się zapach chloru, gdy #wygrany i #przegrany podnieśli rakiety by stoczyć bój z lotką i wiatrem. #wygrany prowadził dziś wymianę z wyraźną przewagą w tempie, każde odbicie spod siatki wyglądało u niego bardziej naturalnie. Lotka zachowywała się przy jego rakietce przewidywalnie, a zagrania kończyły się częściej w polu #przegrany. Wynik #wynik można uznać za całkowicie sprawiedliwy.`,
    ],
    finalClose: [
      `[[GODNY FINAŁ]]
#wygrany i #przegrany zaprezentowali nam dzisiaj kawał dobrego widowiska. Szybkie i zacięte wymiany sprawiały, że nawet Rysiu z krzaków miał problem z nadążeniem wzrokiem za lotką. To nie był zwykły mecz, to był sportowy poemat. Przeszywające ze świstem powietrze rakiety, niczym miecze w rękach dwóch rycerzy, którzy toczą pojedynek na śmierć i życie. Ostatecznie #wygrany był tym, który zdołał zadać więcej decydujących ciosów i po wyniku #wynik sięgnąć po wymarzone złoto.`,
    ],
    finalDominant: [
      `[[GODNY FINAŁ]]
#wygrany i #przegrany zaprezentowali nam dzisiaj kawał dobrego widowiska. Szybkie i zacięte wymiany sprawiały, że nawet Rysiu z krzaków miał problem z nadążeniem wzrokiem za lotką. To nie był zwykły mecz, to był sportowy poemat. Przeszywające ze świstem powietrze rakiety, niczym miecze w rękach dwóch rycerzy, którzy toczą pojedynek na śmierć i życie. Ostatecznie #wygrany był tym, który zdołał zadać więcej decydujących ciosów i po wyniku #wynik sięgnąć po wymarzone złoto.`,
    ],
  },

  // ===== DYSCYPLINY INDYWIDUALNE =====
  koszykowka: {
    close: [
      `[[#zloty WRZUCIŁ RYWALI DO KOSZA]]
Rzuty z różnych pozycji i odległości okazały się bardziej wymagającym wyzwaniem niż wielu graczy mogło przypuszczać. Łatwo można było dostrzec przewagę w doświadczeniu uczestników grających wcześniej w BieździKosz. Kilku innych graczy także pokazało się z bardzo dobrej strony, budując swoją formę kolejnymi próbami i bijąc wielokrotnie swoje rekordy. #zloty nie pozostawił jednak innym złudzeń. To on okazał największą precyzję i intymną wręcz relację z obręczą. Nowy kosz w Bieździadowskim Kompleksie Sportowym został naznaczony wynikiem jaki osiągnął i pozostanie wysoko zawieszoną poprzeczką dla innych amatorów tej dyscypliny na długi czas. Michael Jordan był podobno widziany w krzakach skrzętnie sporządzając notatki.`,
    ],
    dominant: [
      `[[#zloty WRZUCIŁ RYWALI DO KOSZA]]
Rzuty z różnych pozycji i odległości okazały się bardziej wymagającym wyzwaniem niż wielu graczy mogło przypuszczać. Łatwo można było dostrzec przewagę w doświadczeniu uczestników grających wcześniej w BieździKosz. Kilku innych graczy także pokazało się z bardzo dobrej strony, budując swoją formę kolejnymi próbami i bijąc wielokrotnie swoje rekordy. #zloty nie pozostawił jednak innym złudzeń. To on okazał największą precyzję i intymną wręcz relację z obręczą. Nowy kosz w Bieździadowskim Kompleksie Sportowym został naznaczony wynikiem jaki osiągnął i pozostanie wysoko zawieszoną poprzeczką dla innych amatorów tej dyscypliny na długi czas. Michael Jordan był podobno widziany w krzakach skrzętnie sporządzając notatki.`,
    ],
  },

  pilkaInd: {
    close: [
      `[[ZŁOTY STRZAŁ]]
Oglądanie popisów #zloty było jak złoty strzał dla każdego fana piłki nożnej. Ostateczna ekstaza i już więcej nic, bo żaden mecz, żadne zagranie nie będzie robiło już większego wrażenia. Precyzja w operowaniu piłką, kliniczne wykorzystywanie jedenastek, sprawiłoby, że nawet Lewandowski podrapałby się po głowie i zastanowił nad jakością swojej techniki. Strzały przez całe boisko spadały na bramkę niczym bomby na Berlin w '44. Akcje 1 na 1, to był magiczny taniec pijanego mistrza, nigdy nie było wiadomo, w którą stronę zaraz go zniesie. Ostatecznie znosiło go do bramki i całkowicie zasłużenie zdobył złoty medal w piłce nożnej indywidualnej.`,
    ],
    dominant: [
      `[[ZŁOTY STRZAŁ]]
Oglądanie popisów #zloty było jak złoty strzał dla każdego fana piłki nożnej. Ostateczna ekstaza i już więcej nic, bo żaden mecz, żadne zagranie nie będzie robiło już większego wrażenia. Precyzja w operowaniu piłką, kliniczne wykorzystywanie jedenastek, sprawiłoby, że nawet Lewandowski podrapałby się po głowie i zastanowił nad jakością swojej techniki. Strzały przez całe boisko spadały na bramkę niczym bomby na Berlin w '44. Akcje 1 na 1, to był magiczny taniec pijanego mistrza, nigdy nie było wiadomo, w którą stronę zaraz go zniesie. Ostatecznie znosiło go do bramki i całkowicie zasłużenie zdobył złoty medal w piłce nożnej indywidualnej.`,
    ],
  },
};
