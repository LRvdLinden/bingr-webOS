# Bingr voor LG webOS TV

Dezelfde Bingr als op Samsung TV, Android TV en Apple TV, als app voor **LG-smart-tv's met webOS** (webOS 4.0 en nieuwer, 2018+), met dezelfde Netflix-look en bediening met de gewone afstandsbediening of de **Magic Remote**.
Je logt in met je Bingr-account (QR-code met je telefoon of een code op [bingr.online/koppelen](https://bingr.online/koppelen/)), en daarna staan je profielen, servers, Mijn lijst, voortgang, collecties en instellingen er gewoon: alles komt uit je account en synchroniseert met je andere apparaten.

Wat erin zit is gelijk aan de Samsung TV-app: zie [bingr-android/tizen](https://github.com/LRvdLinden/bingr-android/tree/main/tizen#wat-erin-zit). Wijzigingen per build: [CHANGELOG.md](CHANGELOG.md) en [bingr.online/changelog](https://bingr.online/changelog/).

## Hoe deze repo werkt

De app is een web-app (HTML5) en gebruikt de code van de Samsung TV-app, zodat functies en uiterlijk gelijk blijven:

- `tools/build_app.py` haalt `tizen/` uit de openbare repo [bingr-android](https://github.com/LRvdLinden/bingr-android) op **precies de commit** uit `upstream.properties` (anoniem, geen token), vult de platformlaag `B.platform` van de gedeelde code met `platform/webos-platform.js` (LG TV, `webos`, model en webOS-versie via Luna), past de paar vervangingen uit `platform/patches.json` toe (index.html, trailer-relay) en zet de rest van de platformlaag erbij;
- `platform/webos.js`: apparaatnaam *LG TV (model)*, platform `webos`, systeeminfo via de Luna-service, Magic Remote, de speler (eigen video van de tv met mpegts.js als terugval voor TS), afsluiten;
- `tools/package.sh` maakt er met de webOS CLI (`ares-package`) een `.ipk` van.

Zelf bouwen (Node 20+ en Python 3):

```sh
npm ci
python3 tools/build_app.py        # → build/app (de app-map met appinfo.json)
bash tools/package.sh             # → dist/Bingr-1.0.1-build147.ipk
node test/platform_test.js        # unittests van de platformlaag
python3 test/smoke.py build/smoke # rooktest in headless Chromium (pip install playwright pillow; playwright install chromium)
```

De `.ipk` hoort nooit in deze repo of op GitHub (zie [CLAUDE.md](CLAUDE.md)).

## Installeren op een LG-tv (ontwikkelaarsmodus)

Zolang Bingr niet in de LG Content Store staat, installeer je hem als ontwikkelaar:

1. Maak een (gratis) account op [webostv.developer.lge.com](https://webostv.developer.lge.com/) en log met dat account in op de tv in de app **Developer Mode** (te vinden in de LG Content Store).
2. Zet in Developer Mode **Dev Mode Status** aan; de tv herstart. Zet daarna **Key Server** aan en noteer het IP-adres en de passphrase. De ontwikkelaarsmodus verloopt na 50 uur; met *Extend* in de app verleng je hem.
3. Op je computer (Node 20+): `npm install -g @webos-tools/cli` (of gebruik `npx` in deze repo na `npm ci`).
4. Tv koppelen: `ares-setup-device` → *add*, naam bijv. `tv`, het IP-adres van de tv, poort `9922`, gebruiker `prisoner`. Daarna de sleutel ophalen: `ares-novacom --device tv --getkey` en de passphrase uit de Developer Mode-app invullen.
5. Installeren: `ares-install --device tv Bingr-1.0.1-build147.ipk` (de `.ipk` haal je via het beheer, tab Downloads). Starten: `ares-launch --device tv nl.lrvdlinden.bingr`, of gewoon via het startmenu van de tv.
6. Bijwerken: een nieuwere `.ipk` op dezelfde manier installeren; je gegevens blijven staan (zelfde app-id `nl.lrvdlinden.bingr`). Verwijderen: `ares-install --device tv --remove nl.lrvdlinden.bingr`.

Foutzoeken: `ares-inspect --device tv --app nl.lrvdlinden.bingr --open` opent de Web Inspector van de app; in Bingr zelf staan Instellingen → **Diagnose** en **Support**.

## LG Content Store

Publiceren in de LG Content Store is een aparte stap: via de [LG Seller Lounge](https://seller.lgappstv.com/) met een (zakelijk) verkopersaccount, een app-beschrijving, schermafbeeldingen en een privacyverklaring, waarna LG de app test en keurt (QA). Daarvoor is geen ondertekening in deze repo nodig: LG pakt de ingediende `.ipk` zelf in. `appinfo.json` vraagt de ACG-groepen `systemconfig.query` (model en webOS-versie) en `network.query` (soort netwerk voor de diagnose), zoals LG voor de Luna-aanroepen eist.

## Bediening

| Toets | Wat |
|---|---|
| Pijltjes, OK | navigeren en kiezen |
| Magic Remote | wijzen = kiezen (focus), klikken = OK, scrollwiel = omhoog/omlaag |
| Terug | terug; op het menu van Home: nogmaals drukken sluit Bingr |
| Afspelen, Pauze, Stop, ⏩ ⏪ | speler (⏩/⏪ springen 30 s; links/rechts 10 s) |
| CH+ / CH−, omhoog/omlaag | zappen tijdens live TV |
| Cijfers | zendernummer kiezen; pincode invoeren |
| Geel | zender als favoriet in Live TV; tegel weghalen in multiview |
| Blauw | tv-gids |
| Rood | intro en aftiteling markeren (tijdens een aflevering) |
| Groen | live kijken bij een herinnering in beeld |
| OK ingedrukt houden | contextmenu van een kaart (er is geen Tools-toets) |

## Speler en formaten

- **HLS** (`.m3u8`) en **MP4** speelt de tv zelf in `<video>`.
- **MPEG-TS** (`.ts`, Xtream-live): eerst de eigen video van de tv; lukt dat niet (of zegt de tv dat hij `video/mp2t` niet kent), dan [mpegts.js](https://github.com/xqq/mpegts.js) (Apache-2.0, via Media Source Extensions). Wat werkte, onthoudt de app per tv. Bij Xtream kun je ook *Live TV als HLS* aanzetten.
- Multiview: alle tegels spelen via `<video>` (geen AVPlay zoals op Samsung); hoeveel tegelijk lukt, hangt af van de tv.

## Secrets (GitHub)

| Secret | Waarvoor |
|---|---|
| `BINGR_INBOX_TOKEN` | Fine-grained token met alleen *Contents: Read and write* op de privé repo `LRvdLinden/bingr-inbox`. Zonder dit token bouwt en test de workflow wel, maar levert hij de `.ipk` niet aan (notice, groen). |

Er is geen ondertekencertificaat nodig: een webOS-`.ipk` wordt niet door de ontwikkelaar ondertekend.
