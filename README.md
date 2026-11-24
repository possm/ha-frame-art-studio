# Frame Art Studio (Home Assistant Integration)

Maak vanuit **Home Assistant** (zonder aparte webserver) 4K passe-partout kunstwerken voor **Samsung The Frame** met realistische **Dag**- en **Avond**-lichtsimulatie, automatische vervanging van oude uploads, tv-galerijbeheer en directe `content_id`-entiteiten voor je automatiseringen.

## Functies

- **Direct in de Home Assistant-zijbalk**: werkt op desktop, tablet en in de HA Companion App (beveiligd achter je HA-inlog).
- **100% client-side 4K-rendering**: stapsgewijze mipmap-downscaling (scherp ook bij 25+ MB bronfoto's), 32-bit float lichtverloop + dimming met TPDF-dithering en verliesvrije 4K PNG- of 0.99 JPEG-export.
- **Dag & Avond in één klik**: gedeelde uitsnede en 8 px passe-partout, met aparte gekalibreerde profielen voor overdag (daglicht van links) en avond (ledbalk van boven).
- **Slim tv-beheer**: vervangt optioneel automatisch je vorige Dag/Avond-upload op de tv en biedt een galerij-dialoog (*Beheer Mijn foto's op tv*) om oude uploads in bulk op te ruimen.
- **Werkt naast `samsungtv_smart`**: gebruikt een eigen clientnaam (`Frame Art Studio`) en aparte token-opslag in `/config/.storage/frame_art_studio_tokens/`.
- **Automatische HA-entiteiten**:
  - `sensor.<tv>_dag_content_id` — nieuwste Dag `content_id` (bijv. `MY_F0041`)
  - `sensor.<tv>_avond_content_id` — nieuwste Avond `content_id` (bijv. `MY_F0042`)
  - `select.<tv>_art_modus` (`Dag` / `Avond`) — schakelt The Frame direct tussen Dag en Avond
  - Service `frame_art_studio.select_mode` (`mode: day | evening`)

## Installatie via Home Assistant Marketplace

1. Maak op GitHub de publieke repository `https://github.com/possm/ha-frame-art-studio` aan, push deze map en maak een release aan met tag **`v1.0.0`** (gelijk aan `"version": "1.0.0"` in `custom_components/frame_art_studio/manifest.json`).
   *(Tip: `.gitignore` sluit `.frame-runtime/`, `White Paper Textures/` en `Shadow Overlays/` automatisch uit, zodat de repository licht blijft — < 100 KB.)*
2. Open in Home Assistant **Marketplace** → menu rechtsboven (`⋮`) → **Aangepaste repositories** (*Custom repositories*).
3. Voeg `https://github.com/possm/ha-frame-art-studio` toe met categorie **Integratie** (*Integration*) en installeer **Frame Art Studio**.
4. Herstart Home Assistant.
5. Ga naar **Instellingen → Apparaten & diensten → Integratie toevoegen → Frame Art Studio** en vul het lokale IP-adres van je tv in (bijv. `192.168.1.92`).
6. Open **Frame Art Studio** in de zijbalk van Home Assistant. Bevestig bij de eerste upload even op het tv-scherm met **Toestaan**.

## Voorbeeld voor je Dag/Avond-automatisering

Je hoeft nooit meer handmatig `content_id`'s bij te werken in je automatiseringen:

```yaml
# Bij zonsondergang naar Avond-versie schakelen
action: select.select_option
target:
  entity_id: select.the_frame_art_modus
data:
  option: "Avond"
```

Of via je bestaande `samsungtv_smart`-automatisering met de automatische sensor:

```yaml
data:
  content_id: "{{ states('sensor.the_frame_avond_content_id') }}"
```

## Lokale Mac-versie

De losse Mac-versie ([Start The Frame Generator.command](Start%20The%20Frame%20Generator.command) + [server.py](server.py)) blijft daarnaast ook gewoon werken.
