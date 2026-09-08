# Wydania i obrazy kontenerowe

Obrazy są publikowane do GitHub Container Registry jako `ghcr.io/<owner>/<repository>`. Zwykły commit oraz push nie uruchamiają budowania obrazu. Workflow zaczyna się dopiero po opublikowaniu GitHub Release.

## Wydanie produkcyjne (`main`)

1. Upewnij się, że commit wydania znajduje się na gałęzi `main`.
2. Utwórz tag w formacie `vX.Y.Z`, np. `v0.2.0`.
3. Utwórz GitHub Release, jako target wybierz `main` i nie zaznaczaj opcji prerelease.
4. Po publikacji powstaną dwa tagi obrazu:
   - `ghcr.io/<owner>/<repository>:latest`
   - `ghcr.io/<owner>/<repository>:vX.Y.Z`

Workflow produkcyjny nie uruchomi się dla tagu zawierającego `-dev`.

## Wydanie rozwojowe (`dev`)

1. Upewnij się, że commit wydania znajduje się na gałęzi `dev`.
2. Utwórz tag w formacie `vX.Y.Z-dev.N`, np. `v0.2.0-dev.1`.
3. Utwórz GitHub Release, jako target wybierz `dev` i zaznacz opcję prerelease.
4. Po publikacji powstaną dwa tagi obrazu:
   - `ghcr.io/<owner>/<repository>:dev_latest`
   - `ghcr.io/<owner>/<repository>:vX.Y.Z-dev.N`

Workflow rozwojowy nigdy nie zapisuje tagu `latest`. Workflow produkcyjny nigdy nie zapisuje `dev_latest`.

## Ustawienia GitHub

W `Settings → Actions → General → Workflow permissions` repozytorium musi zezwalać `GITHUB_TOKEN` na zapis pakietów. Po pierwszej publikacji ustaw widoczność pakietu w GHCR odpowiednio do widoczności repozytorium.

Jeśli Release ma błędny target, typ lub nazwę tagu, zadanie publikacji zostanie pominięte. Popraw Release zamiast ręcznie zmieniać tagi obrazu.
