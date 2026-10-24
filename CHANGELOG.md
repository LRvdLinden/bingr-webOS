# Changelog · LG TV (webOS)

Alle versies van Bingr voor LG-tv's met webOS. iPhone, iPad, Apple TV en Mac: [iptv-ios-appletv](https://github.com/LRvdLinden/iptv-ios-appletv/blob/main/CHANGELOG.md) · Android en Samsung TV: [bingr-android](https://github.com/LRvdLinden/bingr-android/blob/main/CHANGELOG.md) · alles: [bingr.online/changelog](https://bingr.online/changelog/).

Per build, ingedeeld per apparaatsoort: **Nieuw**, **Verbeterd** en **Opgelost**.

## Versie 1.0.1 · Build 147
_24 oktober 2026_

### Alle apps en de website

**Verbeterd**

- De startdiagnose toont bovenaan of de start goed, traag of vastgelopen was, met app-tijd los van wachten op jou en de vorige start
- Een diagnose naar support bevat altijd de startdiagnose van deze en de vorige start

### LG TV (webOS)

**Nieuw**

- Bingr voor LG-tv's met webOS: dezelfde app als op Samsung TV, met de gewone afstandsbediening of de Magic Remote (wijzen, klikken en scrollen)
- Speler met de eigen video van de tv voor HLS en MP4; TS-streams die de tv niet zelf speelt gaan via een extra speler
- Support en diagnose met het model, de webOS-versie en het netwerk van de tv

### Website en Server

**Verbeterd**

- Statuspagina: een mislukte build geeft niet meer meteen een grote storing; alleen de echte build telt, en pas na twee mislukte builds op rij (of na 2 uur) is het een storing

### Server

**Nieuw**

- De server kent de LG TV-app (webOS)

**Verbeterd**

- Support: de diagnose uit de app is uitgebreider en adressen en servernamen worden er beter uit gehaald
