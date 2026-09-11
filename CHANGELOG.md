# Changelog

Zmiany opisujemy z perspektywy użytkownika, bez szczegółów implementacyjnych.

## 0.1.0 — Unreleased

### Features

- Przedmioty przechowują dane zakupu, gwarancję, tagi, notatki oraz wiele załączników.
- Załączniki przedmiotu można pobierać i pojedynczo usuwać.
- Konserwacja obsługuje plany jednorazowe i cykliczne, ich edycję, usuwanie, oznaczanie wykonania oraz historię czynności.
- Terminy łączą nadchodzące gwarancje i konserwację w jednym widoku.
- Do przypisania pozwala masowo importować pliki, a następnie przypisywać je do przedmiotów albo tworzyć z nich niezależne dokumenty.
- Dokumenty są prezentowane w zwartej tabeli i mogą zawierać wiele plików.
- Szczegóły dokumentu skupiają metadane, załączniki, podgląd, pobieranie, usuwanie plików i obsługę OCR.
- Lokalne OCR rozpoznaje polski i angielski tekst obrazów oraz PDF, obsługuje ponowne rozpoznawanie i ręczną korektę treści.
- Wspólna wyszukiwarka obejmuje przedmioty, dokumenty, tagi i tekst OCR.
- Kosz pozwala przywrócić przedmiot lub dokument przez 30 dni albo trwale opróżnić usunięte elementy.
- Boberit obsługuje lokalne konta, wiele gospodarstw oraz role właściciela i członka.
- Właściciel może tworzyć konta członków, zmieniać role i odbierać dostęp do gospodarstwa.
- Ustawienia udostępniają backup, odtwarzanie danych i historię aktywnego gospodarstwa.
- Webhooki można tworzyć, edytować i usuwać oraz niezależnie określać ich gospodarstwa i typy zdarzeń.
- Boberit można zainstalować jako PWA na telefonie lub komputerze.

### Improvements

- Ustawienie daty zakupu może automatycznie przygotować dwuletnią gwarancję z określoną datą.
- Edycja przedmiotu ostrzega przed opuszczeniem widoku z niezapisanymi zmianami.
- Start pokazuje liczbę zapisanych przedmiotów i dokumentów, wykorzystane miejsce oraz sumę wartości zakupów aktywnego gospodarstwa.
- Sekcje „Wymagają uwagi” i „Ostatnio zapisane” wykorzystują dwukolumnowy układ na szerokim ekranie oraz spójne, kompaktowe wiersze.
- Centrum powiadomień pokazuje terminy przypadające na dzisiaj i historię działań UI, a czerwony znacznik znika po odczytaniu dzisiejszych pozycji.
- Komunikaty po operacjach znikają automatycznie po trzech sekundach.
- Obróbka zdjęć i OCR ma ograniczoną równoległość oraz pamięć podręczną, aby stabilniej działać na serwerach z mniejszą ilością RAM.
- Nawigacja używa kolejności Start, Przedmioty, Dokumenty, Terminy i Do przypisania; Kosz znajduje się przy Ustawieniach.
- Filtry Przedmiotów pokazują liczby pasujących rekordów i są wyrównane do lewej.
- Dokumenty mają kompaktowe wiersze, czytelne statusy OCR i licznik zaległych operacji OCR.
- Ustawienia i profil użytkownika mają osobne menu sekcji zamiast jednej długiej karty.
- Widoki mobilne używają spójnej kolorystyki ikon i zwartych układów formularzy.
- Ekran logowania wykorzystuje pełny banner Boberit nad formularzem.
- Ikony, favicon, Apple Touch Icon oraz warianty PWA są dostarczane lokalnie.

### Bug fixes

- Układ szczegółów przedmiotu nie nachodzi na pola formularza przy pośrednich szerokościach ekranu.
- Załączniki dodawane podczas tworzenia przedmiotu lub dokumentu są prawidłowo przypisywane do utworzonego obiektu również w widoku mobilnym.
- Wykonanie konserwacji zapisuje historię, wylicza kolejny termin planu cyklicznego i usuwa zakończony termin jednorazowy z listy zadań.
- Usunięcie pliku dokumentu aktualizuje tekst OCR, dzięki czemu usunięta treść nie pozostaje w wynikach wyszukiwania.
- Dzisiejsze terminy pojawiają się w centrum powiadomień po odświeżeniu danych aplikacji.
- Wyczyszczenie pola wyszukiwania pozostawia użytkownika w widoku, z którego rozpoczął wyszukiwanie.
- Formularz logowania na iPhonie nie powoduje automatycznego przybliżenia strony.
- API i załączniki nie są dostępne bez zalogowania ani z innego gospodarstwa.
- Interfejs nie używa już niespójnego fioletowego tła ani odmiennego kolorowania ikon w widoku mobilnym.
- Klucz szyfrowania nie jest zapisany na stałe w konfiguracji Compose.

### Distribution

- Obrazy wydań zawierają SBOM i informacje o pochodzeniu oraz są sprawdzane pod kątem podatności HIGH i CRITICAL dla AMD64 i ARM64.
- Obrazy kontenerowe są budowane wyłącznie po opublikowaniu GitHub Release.
- Release z `main` publikuje `latest` i tag wersji `X.Y.Z`.
- Prerelease z `dev` publikuje `dev_latest` i tag `devX.Y.Z`, bez modyfikowania tagów produkcyjnych.
