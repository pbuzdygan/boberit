# Wydania i obrazy kontenerowe

Plik `.github/workflows/release.yml` musi znajdować się na domyślnej gałęzi `main`; jest to wymagane przez obsługę zdarzeń Release także wtedy, gdy Release wskazuje `dev`. Sam workflow pobiera kod z taga Release, więc obraz deweloperski nadal powstaje z `dev`, a nie z `main`.

Obrazy są publikowane do GitHub Container Registry jako `ghcr.io/<owner>/<repository>`. Zwykły commit oraz push nie uruchamiają budowania obrazu. Workflow zaczyna się dopiero po opublikowaniu GitHub Release.

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
