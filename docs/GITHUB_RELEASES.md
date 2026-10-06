# Wydania i obrazy kontenerowe

Plik `.github/workflows/release.yml` musi znajdować się na domyślnej gałęzi `main`; jest to wymagane przez obsługę zdarzeń Release także wtedy, gdy Release wskazuje `dev`. Sam workflow pobiera kod z taga Release, więc obraz deweloperski nadal powstaje z `dev`, a nie z `main`.

Obrazy są publikowane do GitHub Container Registry jako `ghcr.io/<owner>/<repository>`. Zwykły commit oraz push nie uruchamiają budowania obrazu. Workflow zaczyna się dopiero po opublikowaniu GitHub Release.

Każdy obraz zawiera SBOM oraz informacje o pochodzeniu (provenance). Po publikacji workflow skanuje warianty AMD64 i ARM64 narzędziem Trivy. Wykrycie naprawialnej podatności o poziomie HIGH lub CRITICAL kończy workflow błędem. Ponieważ skan następuje po przesłaniu obrazu wieloarchitekturowego, przy nieudanym skanie nie należy używać utworzonych tagów do czasu wydania poprawionej wersji.

Akcje workflow i bazowe obrazy są przypięte do niezmiennych identyfikatorów. Dependabot sprawdza ich aktualizacje co tydzień.

Etap `runtime` aktualizuje również pakiety Debiana odziedziczone z obrazu bazowego (`apt-get update` oraz `apt-get upgrade`), zanim zainstaluje narzędzia OCR. Workflow nie używa cache dla tego etapu, aby każde wydanie pobierało dostępne poprawki systemowe; etap kompilacji nadal korzysta z cache. Samo `apt-get update` odświeża listę pakietów, ale nie aktualizuje zainstalowanych bibliotek.

Jeśli Trivy zgłasza błąd, sprawdź kolumny `Installed Version` i `Fixed Version`. Popraw Dockerfile lub zależności i opublikuj nowy Release z nowym tagiem wskazującym poprawiony commit. Ponowienie starego workflow nadal pobiera kod ze starego taga. Nie wyłączaj skanowania ani blokady HIGH/CRITICAL, aby ominąć dostępne poprawki.

## Lokalne ciężkie zadania na maszynie deweloperskiej

Maszyna Incus ma 6 GiB RAM i współdzieli zasoby z edytorem oraz innymi aplikacjami. Lokalne obrazy należy budować i skanować przez polecenia z limitami:

```bash
npm run heavy:setup
npm run heavy:status
npm run image:build -- boberit:local
npm run image:scan -- boberit:local
```

- Builder `boberit-local-limited`: 1,5 GiB RAM, bez swapu, 1 CPU, jeden krok budowania naraz. Skrypt weryfikuje limity kontenera i zatrzymuje builder po zakończeniu, również przy błędzie lub przerwaniu.
- Trivy: 1 GiB RAM, bez swapu, 1 CPU, `--parallel 1`, limit skanowania 10 minut. Wyjście z przekroczeniem pamięci, czasu lub wykrytą podatnością oznacza nieudany skan.
- Wspólna blokada `flock` dopuszcza jedno ciężkie zadanie na użytkownika, także między checkoutami projektu. Przed rozpoczęciem skrypt wymaga wolnego budżetu cgroup na limit zadania oraz dodatkowy 1 GiB rezerwy. Jest to kontrola wstępna, a nie gwarancja przeciw równoczesnemu wzrostowi pamięci innych procesów.
- Obraz do skanu jest eksportowany do `.tmp`, skan nie otrzymuje dostępu do socketu Dockera. Pliki robocze są usuwane po zakończeniu, a baza Trivy pozostaje w `.tmp/trivy-cache`.

Limity dotyczą tych poleceń i ich kontenerów. Nie ograniczają innych aplikacji, dowolnych poleceń Dockera, procesu `docker save` ani całego demona Dockera. Zwykłe `docker build` i `docker compose up --build` omijają zabezpieczenia. W przypadku braku zasobów pełny build/skan należy wykonać na GitHub Actions, bez podnoszenia lokalnych limitów. Konfiguracja hosta Incusa i przydział swapu nie są zmieniane przez skrypty.

## Wydanie produkcyjne (`main`)

1. Upewnij się, że commit wydania znajduje się na gałęzi `main`.
2. Utwórz tag w formacie `X.Y.Z`, np. `0.2.0`.
3. Utwórz GitHub Release, jako target wybierz `main` i nie zaznaczaj opcji prerelease.
4. Po publikacji powstaną dwa tagi obrazu:
   - `ghcr.io/<owner>/<repository>:latest`
   - `ghcr.io/<owner>/<repository>:X.Y.Z`

Wydanie produkcyjne nie uruchomi się dla taga zaczynającego się od `dev`.

## Wydanie rozwojowe (`dev`)

1. Upewnij się, że commit wydania znajduje się na gałęzi `dev`.
2. Utwórz tag w formacie `devX.Y.Z`, np. `dev0.2.0`.
3. Utwórz GitHub Release, jako target wybierz `dev` i zaznacz opcję prerelease.
4. Po publikacji powstaną dwa tagi obrazu:
   - `ghcr.io/<owner>/<repository>:dev_latest`
   - `ghcr.io/<owner>/<repository>:devX.Y.Z`

Wydanie z `dev` nigdy nie zapisuje tagu `latest`. Wydanie z `main` nigdy nie zapisuje `dev_latest`.

## Ponowienie wydania pominiętego jako `skipped`

Zmiana pliku workflow nie uruchomi ponownie już opublikowanego Release. Po zapisaniu tej poprawki na `dev` umieść ten sam plik workflow także na domyślnej gałęzi `main`, a następnie opublikuj nowy prerelease, np. `dev0.1.1`, wskazujący `dev`. Alternatywnie usuń nieudany Release i jego tag, a potem utwórz ponownie `dev0.1.0` na aktualnym commicie.

## Ustawienia GitHub

W `Settings → Actions → General → Workflow permissions` repozytorium musi zezwalać `GITHUB_TOKEN` na zapis pakietów. Po pierwszej publikacji ustaw widoczność pakietu w GHCR odpowiednio do widoczności repozytorium.

Jeśli Release ma błędny target, typ lub nazwę tagu, zadanie publikacji zostanie pominięte. Popraw Release zamiast ręcznie zmieniać tagi obrazu.
