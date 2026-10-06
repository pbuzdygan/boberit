# Lista wydania Boberit 0.1.1

## Weryfikacja bazowa 0.1.0 — 8 września 2026

- [x] Pełna kompilacja TypeScript, Vite i obrazu Docker.
- [x] Poprawna konfiguracja Docker Compose.
- [x] Aplikacja i endpoint zdrowia odpowiadają po wdrożeniu.
- [x] API danych oraz pobieranie plików zwracają `401` bez sesji.
- [x] Wszystkie używane ikony UI istnieją lokalnie.
- [x] Manifest, favicon, Apple Touch Icon i ikony PWA 192/512 oraz maskable są dostępne.
- [x] Brak niezdefiniowanych zmiennych kolorów CSS.
- [x] `APP_ENC_KEY` jest wymagany, nie jest zapisany w Compose, a `.env` nie trafia do Git ani kontekstu obrazu.
- [x] Dokumentacja wdrożenia i changelog odpowiadały zakresowi 0.1.0 podczas weryfikacji bazowej.
- [x] Obrazy Docker są budowane wyłącznie po publikacji Release, z odseparowanymi kanałami `main` i `dev`.

## Weryfikacja wersji 0.1.1 przed wydaniem

- [ ] Kompilacja i sprawdzenie typów na finalnym commicie wydania.
- [ ] Testy wyszukiwania OCR, liczników kolekcji i nawigacji.
- [ ] Skan Trivy wariantów AMD64 i ARM64 bez naprawialnych podatności HIGH/CRITICAL.
- [x] Rzeczywiste limity lokalnego buildera oraz blokada i obsługa błędów poleceń ciężkich zadań sprawdzone 6 października 2026.

## Akceptacja ręczna przed oznaczeniem wydania

- [ ] Obrócić `APP_ENC_KEY`, który wcześniej występował w konfiguracji, i ponownie zapisać webhooki posiadające secret.
- [ ] iPhone/Safari: logowanie, aparat, plik PDF, szybki zapis, zmiana widoków i instalacja PWA.
- [ ] Android/Chrome: te same przepływy oraz powrót do aplikacji po przejściu w tło.
- [ ] Desktop Firefox/Chromium: Przedmioty, Dokumenty, Terminy, Ustawienia i skrót `/`.
- [ ] Widoki 360 px, około 768 px i duży desktop: brak poziomego przewijania i zasłoniętych akcji.
- [ ] OCR na jednym zdjęciu, PDF tekstowym i skanowanym PDF; wyszukanie rozpoznanej frazy.
- [ ] Backup aktywnego gospodarstwa i odtworzenie na kopii/testowej instancji.
- [ ] Dwa konta i dwa gospodarstwa: ręczna próba odczytu obcego rekordu oraz załącznika.
- [ ] Webhook Discord: utworzenie i usunięcie Przedmiotu/dokumentu oraz wykonanie konserwacji.
- [ ] Kosz: usunięcie, przywrócenie i świadome trwałe opróżnienie elementu testowego.

## Warunek wydania

Wersję `0.1.1` można oznaczyć po zaliczeniu powyższej akceptacji ręcznej i zachowaniu świeżego backupu danych testowych. Szkice offline, OIDC i zaproszenia e-mail pozostają świadomie poza zakresem tej wersji.
