# Boberit — system kolorów UI

## Cel

Paleta interfejsu pochodzi bezpośrednio z zatwierdzonych plików `branding/boberit-icon.png` i `branding/boberit-banner.png`. Ma łączyć techniczny, profesjonalny charakter brandingu z jasnym i zwartym obszarem roboczym. Granat służy do budowania tożsamości, a nie do zalewania nim całej aplikacji.

## Tokeny marki

| Token | Wartość | Zastosowanie |
|---|---:|---|
| Brand 950 | `#000B22` | najgłębsze tło i cień |
| Brand 900 | `#00102F` | panel nawigacji, browser theme |
| Brand 800 | `#00205F` | ciemne powierzchnie i gradienty |
| Brand 700 | `#003AA8` | mocny akcent |
| Brand 600 | `#0068E8` | główne akcje, linki, zaznaczenia |
| Brand 500 | `#0088F8` | światło, hover i akcent gradientu |
| Brand 100 | `#D8EAFA` | obramowania i spokojne wyróżnienia |
| Brand 50 | `#EDF6FF` | aktywne tła i ikony kategorii |
| Silver 100 | `#D0E0F0` | chłodne powierzchnie inspirowane ogonem logo |

## Neutralne i semantyczne

- tło aplikacji: `#F3F7FB`;
- powierzchnia treści: `#FFFFFF`;
- tekst główny: `#0A1D38`;
- tekst pomocniczy: `#65758A`;
- obramowanie: `#D8E2ED`;
- sukces: `#087F60`;
- ostrzeżenie/błąd: `#C9384A`.

## Zastosowanie w mockupie

- ciemny granatowy sidebar kotwiczy branding i dobrze eksponuje logo;
- główna przestrzeń pozostaje jasna i gęsta informacyjnie;
- kobalt jest zarezerwowany dla działań, zaznaczeń, filtrów i linków;
- elektryczny błękit występuje oszczędnie w gradientach i stanach hover;
- wyróżniona karta gwarancji przejmuje ciemną stylistykę bannera;
- czerwony i zielony pozostają kolorami semantycznymi, a nie dekoracyjnymi;
- cienie są chłodne, płytkie i stosowane wyłącznie do hierarchii.

Implementacja mockupu znajduje się w `prototype/styles-v3-brand.css`. Arkusz jest ładowany po bazowym `styles-v2.css`, więc zmienia paletę bez naruszania zwartego layoutu.
