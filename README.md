# UPA Games Launcher

Desktopowy launcher gier dla Windowsa.

## Funkcje

- katalog gier z serwera,
- instalacja gier z pakietów ZIP,
- automatyczne tworzenie skrótów na pulpicie po instalacji gry,
- automatyczne usuwanie skrótu z pulpitu po usunięciu gry,
- ręczne tworzenie skrótu przyciskiem `Utwórz skrót`,
- ikony skrótów pobierane z pola `iconUrl`,
- oznaczanie nowych gier przez pole `isNew`,
- aktualizacja gier,
- uruchamianie zainstalowanych gier,
- aktualizacja samego launchera.

## Uruchomienie projektu

```bash
npm install
npm start
```

## Skróty na pulpicie

Po instalacji gry launcher automatycznie tworzy skrót na pulpicie.

Po usunięciu gry launcher usuwa również jej skrót z pulpitu.

Po kliknięciu skrótu:

1. uruchamia się launcher,
2. sprawdza aktualizację launchera,
3. jeśli jest dostępna, pyta czy ją pobrać,
4. jeśli użytkownik wybierze `Pomiń`, przechodzi dalej,
5. sprawdza aktualizację gry,
6. jeśli jest dostępna, pyta czy ją pobrać,
7. jeśli użytkownik wybierze `Uruchom bez aktualizacji`, uruchamia lokalną wersję gry.

## Ikona gry

Dodaj do dokumentu gry pole:

```json
"iconUrl": "https://example.com/game-icon.ico"
```

Najlepiej używać `.ico`, bo Windows najlepiej obsługuje ten format w skrótach `.lnk`.

## Oznaczanie nowych gier

Dodaj do dokumentu gry pole:

```json
"isNew": true
```

Jeśli `isNew` jest ustawione na `true`, launcher pokaże przy grze etykietę:

```text
NOWE
```

Jeśli `isNew` jest `false` albo nie istnieje, gra będzie oznaczona jako:

```text
DOSTĘPNA
```

## Przykładowy dokument gry

```json
{
  "id": "space_shooter",
  "name": "Space Shooter",
  "description": "Dynamiczna strzelanka kosmiczna.",
  "imageUrl": "https://example.com/cover.jpg",
  "iconUrl": "https://example.com/icon.ico",
  "isNew": true,
  "version": "1.0.0",
  "downloadUrl": "https://example.com/game.zip",
  "executable": "SpaceShooter.exe",
  "folderName": "space_shooter",
  "sizeMb": 450,
  "active": true
}
```

## Struktura projektu

```text
projekt/
├── src/
│   ├── main.mjs
│   ├── preload.cjs
│   └── renderer/
│       └── assets/
├── config/
│   └── firebase.json
├── games/
├── temp/
├── icons/
├── installed-games.json
└── package.json
```

## Gdzie zapisują się gry?

```text
./games
```

Pliki tymczasowe:

```text
./temp
```

Ikony skrótów:

```text
./icons
```

## Aktualizacja launchera

Dokument:

```text
launcher/latest
```

Przykład:

```json
{
  "version": "1.0.1",
  "downloadUrl": "https://example.com/UPA-Games-Launcher-Setup.exe",
  "changelog": "Poprawki i usprawnienia.",
  "mandatory": false,
  "active": true
}
```

## Reguły Firestore

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /games/{gameId} {
      allow read: if true;
      allow write: if false;
    }

    match /launcher/{documentId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

## Format ZIP gry

Jeśli plik wykonywalny jest bezpośrednio w archiwum:

```text
Game.exe
```

ustaw:

```json
"executable": "Game.exe"
```

Jeśli plik wykonywalny znajduje się w podfolderze:

```text
Build/Game.exe
```

ustaw:

```json
"executable": "Build/Game.exe"
```

## Czyszczenie lokalnych danych

```bash
npm run clean:local
```


## Budowanie instalatora `.exe`

Najpierw zainstaluj zależności:

```bash
npm install
```

Potem zbuduj instalator:

```bash
npm run dist
```

Gotowe pliki będą w:

```text
dist/
```

Skrót tworzony przez instalator będzie nazywał się:

```text
UPA Games Launcher
```

bez myślników.

## Folder danych po zbudowaniu `.exe`

W wersji developerskiej dane są zapisywane obok `src`:

```text
./games
./temp
./icons
./installed-games.json
```

Po zbudowaniu i zainstalowaniu `.exe` dane są zapisywane w:

```text
%APPDATA%\UPA Games Launcher\
```

czyli przykładowo:

```text
C:\Users\PC\AppData\Roaming\UPA Games Launcher\
├── games\
├── temp\
├── icons\
└── installed-games.json
```

To zapobiega problemowi, w którym aplikacja uruchamia się w tle, ale nie pokazuje okna, bo próbuje zapisywać dane do `app.asar` albo folderu programu.


## Ekran szczegółów gry

Kliknięcie w kartę gry otwiera pełny widok szczegółów.

Opis gry korzysta z pola:

```json
"description": "..."
```

Obsługiwane jest podstawowe formatowanie w stylu Discorda:

```text
# Nagłówek 1
## Nagłówek 2
### Nagłówek 3

**pogrubienie**
*kursywa*
__podkreślenie__
~~przekreślenie~~
`kod inline`

- lista
- lista

> cytat

```blok kodu```
```

Pole `changelog` jest wyświetlane w szczegółach jako osobna sekcja „Zmiany” i obsługuje to samo formatowanie.


## Obraz w szczegółach gry

W szczegółach gry obraz jest wyświetlany nad nazwą i skalowany jako `contain`, żeby był widoczny w całości.

Widok jest ustawiony pod grafiki 16:9. Pole używane dla obrazu:

```json
"imageUrl": "https://example.com/cover-16-9.jpg"
```


## Poprawka obrazu w szczegółach

Obraz w szczegółach gry nie jest przycinany. Widok używa:

```css
object-fit: contain;
aspect-ratio: 16 / 9;
```

Jeśli obraz zajmuje dużo miejsca, przewija się cały panel szczegółów.


## Ważne: wersja launchera przy aktualizacjach

Przed zbudowaniem każdej nowej aktualizacji musisz podbić wersję w `package.json`.

Przykład:

```json
"version": "1.0.1"
```

Potem budujesz instalator:

```bash
npm run dist
```

W dokumencie `launcher/latest` wpisujesz tę samą albo wyższą wersję:

```json
{
  "version": "1.0.1",
  "downloadUrl": "https://twoj-link/UPA-Games-Launcher-Setup-1.0.1.exe",
  "changelog": "Poprawki i usprawnienia.",
  "mandatory": false,
  "active": true
}
```

Jeżeli zbudujesz instalator bez zmiany `package.json > version`, nowy instalator dalej będzie zgłaszał starą wersję, np. `1.0.0`.

W wersji `.exe` launcher odczytuje lokalną wersję przez:

```js
app.getVersion()
```

czyli z metadanych zbudowanej aplikacji.


## Funkcje Discord i ograniczone gry

Ta wersja dodaje:

- `minLauncherVersion` dla każdej gry,
- Discord Rich Presence,
- przełącznik aktywności Discord,
- przycisk Discord prowadzący do `https://discord.gg/5fgAE5ShJA`,
- opinie gier: 0-5 gwiazdek + komentarz,
- gry ograniczone rolą Discord,
- pole `restrictedRoleId`, domyślnie `1506147510228353084`.

## Nowe pola gry

Przykład dokumentu w `games`:

```json
{
  "id": "example_game",
  "name": "Example Game",
  "description": "Opis gry",
  "imageUrl": "https://example.com/cover.jpg",
  "iconUrl": "https://example.com/icon.ico",
  "isNew": true,
  "version": "1.0.0",
  "minLauncherVersion": "1.0.0",
  "downloadUrl": "https://example.com/game.zip",
  "executable": "Game.exe",
  "folderName": "example_game",
  "sizeMb": 450,
  "active": true,
  "restricted": false,
  "restrictedRoleId": "1506147510228353084",
  "changelog": "Lista zmian"
}
```

`minLauncherVersion` blokuje instalację, jeśli użytkownik ma starszą wersję launchera.

`restricted: true` oznacza, że gra wymaga roli Discord.

## Konfiguracja Discord Rich Presence

Utwórz aplikację w Discord Developer Portal i wpisz Client ID w:

```text
config/discord.json
```

Przykład:

```json
{
  "enabled": true,
  "clientId": "DISCORD_APPLICATION_CLIENT_ID",
  "serverInvite": "https://discord.gg/5fgAE5ShJA",
  "guildId": "ID_SERWERA",
  "restrictedRoleId": "1506147510228353084"
}
```

Aby Rich Presence miało obrazek, w Discord Developer Portal dodaj asset o nazwie:

```text
upa_logo
```

## Opinie gier

Opinie zapisują się w:

```text
games/{gameId}/reviews
```

Format opinii:

```json
{
  "gameId": "example_game",
  "rating": 5,
  "comment": "Komentarz",
  "discordUserId": "123",
  "discordUsername": "User"
}
```

W tej wersji dostępny jest tryb prototypowy: użytkownik wpisuje Discord ID i role w panelu bocznym. To pozwala testować restricted games i opinie bez backendu.

Produkcja: prawdziwą weryfikację Discord ID i ról najlepiej zrobić przez Cloud Function lub własny backend. Desktopowego klienta da się obejść, więc nie traktuj lokalnie wpisanych ról jako zabezpieczenia produkcyjnego.

## Reguły Firestore dla opinii

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /games/{gameId} {
      allow read: if true;
      allow write: if false;

      match /reviews/{reviewId} {
        allow read: if true;
        allow create: if true;
        allow update, delete: if false;
      }
    }

    match /launcher/{documentId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```


## Discord: Rich Presence + logowanie konta

Ta wersja używa Discorda w dwóch miejscach:

1. **Rich Presence** — pokazuje w aktywności Discorda, w co gra użytkownik.
2. **Logowanie Discord OAuth** — pobiera prawdziwe Discord ID użytkownika i używa go do:
   - opinii gier,
   - restricted games.

## Konfiguracja Discord OAuth

W Discord Developer Portal dodaj Redirect URI:

```text
http://127.0.0.1/callback
```

W pliku:

```text
config/discord.json
```

ustaw:

```json
{
  "enabled": true,
  "clientId": "DISCORD_APPLICATION_CLIENT_ID",
  "serverInvite": "https://discord.gg/5fgAE5ShJA",
  "redirectUri": "http://127.0.0.1/callback"
}
```

Launcher używa OAuth2 implicit flow z zakresem `identify`, żeby pobrać Discord ID użytkownika.

## Restricted games przez bazę danych

Restricted games nie są już sprawdzane po lokalnie wpisanej roli.

Teraz gra z polem:

```json
"restricted": true
```

będzie dostępna tylko wtedy, gdy Discord ID użytkownika istnieje w kolekcji:

```text
allowedDiscordUsers
```

Przykład dokumentu:

```text
allowedDiscordUsers/123456789012345678
```

Dane dokumentu:

```json
{
  "active": true,
  "username": "DiscordUser",
  "note": "Dostęp do restricted games"
}
```

Opcjonalnie możesz ograniczyć dostęp tylko do wybranych gier:

```json
{
  "active": true,
  "allowedGames": ["game_one", "game_two"]
}
```

Jeśli `allowedGames` nie istnieje albo jest pustą tablicą, użytkownik ma dostęp do wszystkich restricted games.

## Nowe pola gry

```json
{
  "restricted": true,
  "minLauncherVersion": "1.0.0"
}
```

`minLauncherVersion` nadal blokuje instalację, jeśli launcher użytkownika jest za stary.

## Reguły Firestore

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    match /games/{gameId} {
      allow read: if true;
      allow write: if false;

      match /reviews/{reviewId} {
        allow read: if true;
        allow create: if true;
        allow update, delete: if false;
      }
    }

    match /allowedDiscordUsers/{discordUserId} {
      allow read: if true;
      allow write: if false;
    }

    match /launcher/{documentId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

## Ważne bezpieczeństwo

Bez własnego backendu/Cloud Function użytkownik techniczny nadal może próbować obejść klienta desktopowego. Ten wariant jest prosty i wygodny, ale do płatnych lub mocno chronionych gier najlepiej później przenieść sprawdzanie dostępu do Cloud Function.


## Błąd permission-denied przy opiniach

Opinie są zapisywane do:

```text
games/{gameId}/reviews/{reviewId}
```

Jeśli pojawia się:

```text
FirebaseError: permission-denied
```

to w Firebase Console trzeba opublikować reguły z pliku:

```text
firestore.rules
```

Wymagany fragment:

```js
match /games/{gameId} {
  allow read: if true;
  allow write: if false;

  match /reviews/{reviewId} {
    allow read: if true;
    allow create: if true;
    allow update, delete: if false;
  }
}
```

Po wklejeniu reguł kliknij `Publish`.


## Discord Rich Presence — obraz gry i czyszczenie aktywności

Rich Presence pokazuje teraz:

```text
details: nazwa gry
state/opis: pusty
```

Obraz aktywności jest brany z pola gry:

```json
"discordImageKey": "boku_no_headshot"
```

Możesz też użyć alternatywnej nazwy pola:

```json
"iconKey": "boku_no_headshot"
```

Ważne: Discord Rich Presence nie używa lokalnej ikony `.ico` ani `iconUrl` bezpośrednio. Obraz musi być dodany jako asset w Discord Developer Portal dla aplikacji Discord.

Przykład dokumentu gry:

```json
{
  "id": "boku_no_headshot",
  "name": "Boku no Headshot The Last Battle",
  "discordImageKey": "boku_no_headshot"
}
```

W Discord Developer Portal dodaj asset o dokładnie takiej nazwie:

```text
boku_no_headshot
```

Po zamknięciu procesu gry launcher czyści aktywność Discord.


## Osobne logo gry z bazy danych

Dodano osobne pole dla logo gry:

```json
"logoUrl": "https://example.com/game-logo.png"
```

Możesz też użyć alternatywnej nazwy:

```json
"gameLogoUrl": "https://example.com/game-logo.png"
```

Różnice między polami:

```text
imageUrl          → duży obraz / banner / okładka gry
logoUrl           → osobne logo gry wyświetlane na karcie i w szczegółach
iconUrl           → ikona skrótu Windows
discordImageKey   → asset Discord Rich Presence
```

Przykład:

```json
{
  "id": "boku_no_headshot",
  "name": "Boku no Headshot The Last Battle",
  "imageUrl": "https://example.com/boku-cover.jpg",
  "logoUrl": "https://example.com/boku-logo.png",
  "iconUrl": "https://example.com/boku-icon.ico",
  "discordImageKey": "boku_no_headshot"
}
```

Najlepiej, żeby `logoUrl` prowadziło do pliku PNG z przezroczystym tłem.


## Discord Rich Presence — finalna konfiguracja obrazu

Rich Presence używa teraz:

```js
details: nazwa gry
state: nieustawione
largeImageKey: logoUrl z bazy danych
largeImageText: nazwa gry
```

W dokumencie gry ustaw:

```json
{
  "logoUrl": "https://example.com/game-logo.png"
}
```

To pole jest używane jako obraz Rich Presence oraz jako logo gry w launcherze.

Jeśli Discord nie przyjmie `logoUrl`, launcher użyje fallbacku:

```text
upa_logo
```

Wtedy dodaj asset `upa_logo` w Discord Developer Portal.


## Discord Rich Presence — ograniczenia i per-game clientId

Discord pokazuje na samej górze aktywności nazwę aplikacji z Discord Developer Portal.
Tego tekstu nie da się dynamicznie zmienić z launchera przez `setActivity`.

Jeśli widzisz:

```text
UPA Games Studio
```

to jest to nazwa aplikacji Discord, czyli nazwa ustawiona w Discord Developer Portal.

Launcher ustawia:

```js
details: nazwa gry
state: brak
largeImageKey: logoUrl / discordImageKey
```

Jeśli chcesz, żeby na górze Discorda była nazwa konkretnej gry, utwórz osobną aplikację Discord dla tej gry i dodaj do dokumentu gry:

```json
{
  "discordClientId": "CLIENT_ID_APLIKACJI_TEJ_GRY"
}
```

Wtedy Discord użyje nazwy tej konkretnej aplikacji.

## Rich Presence — obraz gry

Launcher przy uruchamianiu gry pobiera aktualny wpis gry z serwera i przekazuje do Discorda:

```json
{
  "logoUrl": "https://example.com/game-logo.png",
  "discordImageKey": "asset_key"
}
```

Kolejność użycia obrazu:

```text
logoUrl
gameLogoUrl
discordImageUrl
discordImageKey
iconKey
upa_logo
```

Jeśli `logoUrl` nie pokaże się w Discordzie, użyj `discordImageKey` i dodaj asset w Discord Developer Portal.

## Logo w szczegółach gry

Logo gry nie zasłania już dużego obrazu. Jest wyświetlane pod obrazem.


## Poprawka położenia logo gry

Logo gry w szczegółach jest teraz osobnym blokiem pod dużym obrazem.
Nie jest pozycjonowane absolutnie na bannerze, więc nie powinno nachodzić na grafikę `imageUrl`.


## Gry dla Windows, Linux i macOS

Launcher wybiera plik gry na podstawie systemu użytkownika.

Możesz używać starych pól:

```json
{
  "downloadUrl": "https://example.com/game-windows.zip",
  "executable": "Game.exe"
}
```

albo nowych pól per system:

```json
{
  "downloadUrlWindows": "https://example.com/game-windows.zip",
  "executableWindows": "Game.exe",

  "downloadUrlLinux": "https://example.com/game-linux.zip",
  "executableLinux": "Game.x86_64",

  "downloadUrlMac": "https://example.com/game-macos.zip",
  "executableMac": "Game.app/Contents/MacOS/Game"
}
```

Alternatywnie możesz użyć struktury:

```json
{
  "platforms": {
    "windows": {
      "downloadUrl": "https://example.com/game-windows.zip",
      "executable": "Game.exe",
      "folderName": "game-windows",
      "sizeMb": 450
    },
    "linux": {
      "downloadUrl": "https://example.com/game-linux.zip",
      "executable": "Game.x86_64",
      "folderName": "game-linux",
      "sizeMb": 470
    },
    "mac": {
      "downloadUrl": "https://example.com/game-macos.zip",
      "executable": "Game.app/Contents/MacOS/Game",
      "folderName": "game-macos",
      "sizeMb": 520
    }
  }
}
```

Jeśli gra nie ma pliku dla danego systemu, launcher pokaże ją jako niedostępną dla tej platformy.

## Ukryte moduły Discord i opinii

Panel Discord i sekcja opinii są teraz ukryte w UI.

Kod został zostawiony w projekcie, więc później można je przywrócić bez przepisywania funkcji.

## Jak przeportować launcher na Linux i macOS

Launcher jest w Electronie, więc sam interfejs można budować na Windows, Linux i macOS. Najważniejsze są jednak gry:

1. **Zbuduj osobną wersję gry dla każdego systemu**
   - Windows: `.exe`
   - Linux: plik wykonywalny, np. `Game.x86_64`
   - macOS: zwykle `.app`

2. **Spakuj każdą wersję gry do osobnego ZIP-a**
   - `game-windows.zip`
   - `game-linux.zip`
   - `game-macos.zip`

3. **Dodaj linki do Firestore**
   - `downloadUrlWindows`
   - `downloadUrlLinux`
   - `downloadUrlMac`

4. **Ustaw poprawne pliki startowe**
   - Windows: `Game.exe`
   - Linux: `Game.x86_64`
   - macOS: `Game.app/Contents/MacOS/Game`

5. **macOS**
   - Do normalnej dystrybucji poza Twoim komputerem potrzebne jest podpisanie i notarization aplikacji.
   - Bez tego macOS Gatekeeper może blokować uruchamianie.

6. **Linux**
   - Najprościej dystrybuować jako AppImage albo archiwum.
   - Plik gry po rozpakowaniu musi mieć prawa wykonywania. Launcher próbuje automatycznie ustawić `chmod +x`.

## Budowanie launchera dla innych systemów

W `package.json` możesz dodać targety:

```json
"dist:win": "electron-builder --win nsis",
"dist:linux": "electron-builder --linux AppImage",
"dist:mac": "electron-builder --mac dmg"
```

Przykładowe komendy:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Najpewniejsza zasada: buduj dany system na tym samym systemie:
- Windows build na Windows,
- Linux build na Linux,
- macOS build na macOS.


## Widoczność Discorda i opinii

Panel Discord oraz sekcja opinii są widoczne tylko wtedy, gdy spełnione są oba warunki:

```text
lokalna wersja launchera = 2.0.0
launcher/latest.version w bazie = 2.0.0
```

Jeśli lokalna wersja albo wersja na serwerze jest inna, moduły są ukryte.

## Minimalna wersja launchera w bibliotece

Kafelek gry w bibliotece pokazuje teraz informację:

```text
Wymaga launchera X.Y.Z
```

jeśli w dokumencie gry ustawiono:

```json
"minLauncherVersion": "1.2.0"
```


## Aktualizacje launchera dla Windows, Linux i macOS

Dokument `launcher/latest` obsługuje osobne instalatory dla systemów:

```json
{
  "version": "2.0.0",
  "changelog": "Nowa wersja launchera.",
  "mandatory": false,
  "active": true,
  "downloadUrlWindows": "https://example.com/UPA-Games-Launcher-Setup-2.0.0.exe",
  "downloadUrlLinux": "https://example.com/UPA-Games-Launcher-2.0.0.AppImage",
  "downloadUrlMac": "https://example.com/UPA-Games-Launcher-2.0.0.dmg"
}
```

Możesz też użyć `platforms.windows/linux/mac.downloadUrl`.

`downloadUrl` nadal działa jako fallback.

Zachowanie:
- Windows: pobiera i uruchamia `.exe`.
- Linux: pobiera `.AppImage`, ustawia `chmod +x` i uruchamia.
- macOS: dla `.dmg` otwiera instalator przez system i zamyka launcher.


## Poprawka ikon przy budowaniu Linux AppImage

Folder `icons/` w projekcie służy do ikon skrótów gier, nie do ikony aplikacji.

Ikony aplikacji są teraz ustawione tak:

```json
"build": {
  "icon": "build/icon.png",
  "win": {
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": ["AppImage"],
    "icon": "build/icon.png",
    "category": "Game"
  },
  "mac": {
    "target": ["dmg"],
    "icon": "build/icon.png",
    "category": "public.app-category.games"
  }
}
```

Do budowania Linuxa użyj:

```bash
npm run dist:linux
```
