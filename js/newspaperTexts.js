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
#wygrany i #przegrany stoczyli bój, jakiego dawno nie widziano na tych łąkach. Od pierwszych minut obie drużyny rzuciły się do walki z taką zaciętością, że trawa aż jęczała pod butami. Wynik #wynik padł dopiero po heroicznym starciu trwającym do ostatnich sekund. Strzały padały z dwóch stron jak filmie gangsterskim, a kości trzeszczały jak stare radio. Ostatecznie to #wygrany wyszedł z tarczą, ale #przegrany może być dumny z postawy – oddał wszystko, co miał w nogach i sercu.`,
      `[[WOJNA O KAŻDĄ PIŁKĘ]]
Na boisku w Bieździadowie rozegrała się prawdziwa bitwa o honor i punkty. #wygrany pokonali #przegrany wynikiem #wynik dopiero po długotrwałych, heroicznych bojach w środku pola i desperackich obronach pod własnym polem karnym. Pot lał się strumieniami, nogi odmawiały posłuszeństwa, a kibice niemal weszli na murawę z emocji. Żadna z drużyn nie chciała oddać nawet cala ziemi. Takich meczów się nie zapomina – zostają w pamięci na całe lata.`,
      `[[LEDWO, LEDWO]]
Ktoś tu próbował grać w piłkę, a skończyło się na wojnie pozycyjnej. #wygrany ostatecznie ugryzł #przegrany wynikiem #wynik, ale różnica była mikroskopijna. Więcej było walki o każdy metr murawy niż efektownych akcji. Klasyczny, brudny i bardzo bieździadowski mecz.`,
    ],
    dominant: [
      `[[RZEŹ NIEWINIĄTEK]]
#wygrany nie tyle wygrali, co zmiotli #przegrany z boiska wynikiem #wynik. Różnica klas była widoczna gołym okiem od momentu gdy piłkarze wchodzili na boisko. #przegrany biegali jak dzieci we mgle zagubieni na polu minowym. Za każdym golem #wygrany kolejna eksplozja. #przegrany byliby bezpieczniejsi szturmując plaże Normandii w D-Day niż stając dzisiaj do pojedynku z #wygrany. BUM! BUM! BUM!`,
      `[[BEZ LITOŚCI]]
To nie był mecz. To była egzekucja. #wygrany rozjechali #przegrany #wynik i nawet nie musieli się spocić. Każda akcja kończyła się zagrożeniem, każda strata piłki u rywali – kontrą. Kreatywność, polot i chirurgiczna wręcz precyzja z jaką #wygrany dekonstruowali obronę przeciwnika. #przegrany wyglądali, jakby dopiero dziś rano dowiedzieli się, że grają w piłkę nożną. Bieździadów zobaczył dziś pokaz siły.`,
      `[[RÓŻNICA KLAS]]
#wygrany potraktowali to spotkanie jak trening z przeszkodami. Wynik #wynik mówi wszystko. #przegrany próbowali walczyć, ale ich wysiłki przypominały rzucanie rozgotowanym grochem o ścianę - brudno i śmierdząco. Tempa, precyzji i pomysłu uświadczaliśmy głównie po jednej stronie. Drugiej pozostało jedynie liczenie minut do końca cierpienia.`,
    ],
    finalClose: [
      `[[PIŁKARSKI TEATR MARZEŃ]]
Na tej skromnej bieździadowskiej łące rozegrał się dzisiaj dramat Szekspira w trampkach. Mrożące krew w żyłach sceny, o których nastepne pokolenia będą opowiadać przy ognisku w Halloween. Niczym pojedynek nieśmiertelnych tytanów, w którym żaden nie był gotowy odpuścić i z każdym przyjętym ciosem, straconym golem, stawał się jeszcze mocniejszy i bardziej rozjuszony. Wraz z ostatnim gwizdkiem ryk zwycięskich #wygrany był słyszalny aż w Jarocinie, a smak złota unosił się w powietrzu. Heroiczne zwycięstwo wynikiem #wynik pokazuje, że #przegrany też dali z siebie wszystko i zasłużyli na srebro. Bieździadów stał się dziś centrum piłkarskiego wszechświata.`,
    ],
    finalDominant: ["Przykładowy tekst"],
  },

  siatkowka: {
    close: ["Przykładowy tekst", "Przykładowy tekst"],
    dominant: ["Przykładowy tekst", "Przykładowy tekst"],
    finalClose: ["Przykładowy tekst"],
    finalDominant: ["Przykładowy tekst"],
  },

  badminton: {
    close: ["Przykładowy tekst", "Przykładowy tekst"],
    dominant: ["Przykładowy tekst", "Przykładowy tekst"],
    finalClose: ["Przykładowy tekst"],
    finalDominant: ["Przykładowy tekst"],
  },

  // ===== DYSCYPLINY INDYWIDUALNE =====
  koszykowka: {
    close: ["Przykładowy tekst"],
    dominant: ["Przykładowy tekst"],
  },

  pilkaInd: {
    close: ["Przykładowy tekst"],
    dominant: ["Przykładowy tekst"],
  },
};
