# Boberit 0.1.0 — stan wdrożenia

Status: **kandydat do pierwszego prywatnego wydania**  
Data przeglądu: 8 września 2026

## Gotowy zakres produktu

### Przedmioty i terminy

- tworzenie, edycja, wyszukiwanie i usuwanie Przedmiotów;
- nazwa, producent, model, numer seryjny, zakup, cena, ilość, link, tagi i notatki;
- gwarancja z zakresem, datą wygaśnięcia albo wariantem dożywotnim;
- konserwacja jednorazowa lub cykliczna w dniach, tygodniach, miesiącach i latach, z edycją i usuwaniem planów;
- przypomnienia na Start i w Terminach oraz trwała historia wykonanych czynności.

### Pliki, Do przypisania i Dokumenty

- załączniki Przedmiotu: zdjęcie, paragon, instrukcja i inny dokument;
- sekcja Do przypisania na masowy import zdjęć i plików przed ich uporządkowaniem;
- przypisanie pliku z Do przypisania do Przedmiotu albo utworzenie niezależnego dokumentu;
- niezależny dokument z nazwą, typem, tagami, notatką i wieloma załącznikami;
- szczegóły dokumentu z podglądem, pobieraniem i usuwaniem pojedynczych załączników;
- pobieranie i usuwanie pojedynczych załączników Przedmiotu;
- Kosz dla Przedmiotów i dokumentów z przywracaniem przez 30 dni.

### OCR i wyszukiwanie

- lokalny Tesseract OCR w języku polskim i angielskim;
- odczyt obrazów, PDF z warstwą tekstową i skanowanych PDF do 12 stron;
- korekta pełnego tekstu OCR i zbiorcze przetwarzanie oczekujących dokumentów;
- SQLite FTS5 dla Przedmiotów, metadanych dokumentów i treści OCR;
- wspólne wyniki wyszukiwania Przedmiotów i dokumentów.

### Konta i gospodarstwa

- lokalne konta z loginem, e-mailem i hasłem;
- sesje unieważniane przy wylogowaniu oraz możliwość wylogowania innych urządzeń;
- wiele gospodarstw na konto i widoczny wybór aktywnego gospodarstwa;
- role właściciel/członek, tworzenie kont przez właściciela i ochrona ostatniego właściciela;
- izolacja danych, plików, Kosza, backupu i odtwarzania między gospodarstwami;
- API i pliki niedostępne bez prawidłowej sesji.

### Administracja i integracje

- backup aktywnego gospodarstwa z danymi i załącznikami;
- odtwarzanie pakietu po jawnym potwierdzeniu zastąpienia danych;
- webhooki należące do użytkownika, dla wszystkich lub wybranych jego gospodarstw;
- opcjonalny secret webhooka szyfrowany AES-256-GCM przez obowiązkowy `APP_ENC_KEY`;
- konfiguracja webhooków i sekretów wyłączona z backupu;
- historia aktywności i informacja o zajętym miejscu;
- tworzenie, edycja i usuwanie webhooków z oddzielnym wyborem gospodarstw oraz typów zdarzeń.

### Interfejs i PWA

- zwarty interfejs bez okładek na listach, spójny z brandingiem Boberit v2;
- Start z licznikami przedmiotów, dokumentów i zajętego miejsca oraz dwukolumnowym przeglądem najważniejszych informacji;
- centrum powiadomień z dzisiejszymi terminami i historią działań UI;
- Start, Przedmioty, Dokumenty, Terminy, Do przypisania, Kosz i Ustawienia;
- dolne menu mobilne z centralnym szybkim dodawaniem oraz panelem dostępu do pozostałych sekcji;
- ochrona przed automatycznym powiększaniem formularzy na iOS;
- skrót `/` przenoszący fokus do wyszukiwarki;
- favicony, Apple Touch Icon oraz ikony PWA 192/512 i warianty maskable.

## Bezpieczeństwo i dane

`APP_ENC_KEY` jest obowiązkowy i musi mieć 64 znaki hex (`openssl rand -hex 32`). Compose pobiera go wyłącznie ze środowiska lub ignorowanego przez Git pliku `.env`; w repozytorium nie ma klucza domyślnego. Zmiana klucza powoduje utratę możliwości odszyfrowania istniejących sekretów webhooków.

Upload przyjmuje wyłącznie dozwolone typy plików i ma limit 25 MB. Zdjęcia są skalowane do maksymalnie 2000 px i zapisywane jako powszechnie obsługiwany JPEG, a grafiki z przezroczystością jako PNG. Pobranie i podgląd przechodzą przez uwierzytelnione API.

SQLite działa w trybie WAL. Baza znajduje się w `/data/db`, a załączniki w `/data/items/<household_id>`, `/data/documents/<household_id>` i `/data/inbox/<household_id>`. Starszy układ bazy oraz katalog `uploads` są migrowane automatycznie przy pierwszym starcie nowej wersji.

Proces kontenera działa domyślnie jako `1000:1000`; Compose pozwala zmienić te identyfikatory przez `PUID` i `PGID` dla bind mountów.

## Uruchomienie

```bash
cp .env.example .env
printf 'APP_ENC_KEY=%s\n' "$(openssl rand -hex 32)" > .env
docker compose up --build -d
```

Port hosta ustala opcjonalne `APP_PORT` (domyślnie `3219`); nowa baza jest domyślnie pusta.

## Weryfikacja wydania

Sprawdzone automatycznie:

- kompilacja wszystkich workspace’ów TypeScript i obrazu Docker;
- poprawność konfiguracji Compose;
- endpoint zdrowia i dostępność zasobów PWA;
- odpowiedź `401` dla API danych i pobierania pliku bez sesji;
- izolacja dwóch kont i dwóch gospodarstw w osobnym teście integracyjnym;
- unieważnienie tokenu po wylogowaniu;
- podstawowy cykl Przedmiotu, gwarancji, konserwacji, dokumentu, OCR i pliku.

Przed publicznym oznaczeniem wydania należy jeszcze wykonać ręczny test akceptacyjny na rzeczywistym iPhonie i Androidzie: aparat, wybór plików, instalacja PWA, nawigacja, OCR skanu oraz przerwanie i wznowienie pracy. Automatyczny test wizualny w prawdziwej przeglądarce nie jest obecnie częścią repozytorium.

## Po wersji 0.1.0

- szkice i kolejka uploadu działające bez sieci;
- zaproszenia członków e-mailem;
- logowanie przez zewnętrznego dostawcę, np. Authentik/OIDC;
- strumieniowy upload, kontrola zawartości MIME, checksumy i atomowa finalizacja;
- opcjonalne push/e-mail obok obecnych webhooków;
- adaptery importu z ustalonych formatów zewnętrznych;
- automatyczne testy E2E i regresji wizualnej.
