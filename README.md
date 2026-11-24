# Frame Art Studio

**Frame Art Studio** is een custom integration voor **Home Assistant** waarmee je rechtstreeks vanuit de zijbalk 4K-kunstwerken met passe-partout en realistische omgevingslicht-simulatie maakt en naar je **Samsung The Frame** stuurt — zonder aparte webserver of externe tools.

## Belangrijkste functies

- **Volledige studio in Home Assistant** — werkt op desktop, tablet en in de Home Assistant Companion App, direct achter je bestaande Home Assistant-login.
- **Haarscherpe 4K-rendering in de browser** — stapsgewijze downscaling voor grote bronfoto's, 32-bit float licht- en dimberekening met dithering en export als verliesvrije 4K PNG of hoge kwaliteit JPEG.
- **Aparte Dag- en Avond-profielen** — één gedeelde uitsnede en passe-partout met afzonderlijke lichtinstellingen voor overdag en 's avonds, in één klik naar je tv te sturen.
- **TV-galerij & slot-koppeling** — bekijk je geüploade kunstwerken op de tv, ruim oude versies in bulk op (het actieve kunstwerk is beschermd) of koppel bestaande foto's op je tv direct als **Dag**- of **Avond**-versie.
- **Automatisch vervangen** — bij een nieuwe upload wordt desgewenst de vorige Dag- of Avond-upload op de tv opgeruimd.
- **Werkt samen met `samsungtv_smart`** — gebruikt een eigen clientnaam (`Frame Art Studio`) en aparte token-opslag zodat bestaande Samsung TV-integraties niet worden verstoord.

## Entiteiten & services

Voor elke toegevoegde Samsung The Frame maakt de integratie automatisch een apparaat aan met:

| Entiteit / Service | Beschrijving |
| --- | --- |
| `select.<tv>_art_modus` | Schakelt Art Mode direct tussen **Dag** en **Avond**. |
| `sensor.<tv>_actief_kunstwerk` | Toont het `content_id` dat momenteel op de tv wordt weergegeven (inclusief bereikbaarheid en actieve modus als attributen). |
| `sensor.<tv>_dag_content_id` | Het gekoppelde `content_id` voor de Dag-versie (bijv. `MY_F0041`). |
| `sensor.<tv>_avond_content_id` | Het gekoppelde `content_id` voor de Avond-versie (bijv. `MY_F0042`). |
| `frame_art_studio.select_mode` | Service om via automatiseringen naar `day` of `evening` te schakelen (optioneel per `host` bij meerdere tv's). |

## Vereisten

- Home Assistant `2024.7` of nieuwer
- Een Samsung The Frame tv met Art Mode-ondersteuning op hetzelfde lokale netwerk

## Installatie via Home Assistant Marketplace

1. Open in Home Assistant **Marketplace** → menu rechtsboven (`⋮`) → **Aangepaste repositories** (*Custom repositories*).
2. Voeg `https://github.com/possm/ha-frame-art-studio` toe als categorie **Integratie** (*Integration*).
3. Zoek **Frame Art Studio** op, klik op **Downloaden** en herstart Home Assistant.
4. Ga naar **Instellingen → Apparaten & diensten → Integratie toevoegen** en kies **Frame Art Studio**.
5. Vul het lokale IP-adres van je Samsung The Frame in (bijvoorbeeld `192.168.1.100`) en geef je tv een herkenbare naam.

## Aan de slag

1. Open **Frame Art Studio** in de zijbalk van Home Assistant.
2. Sleep een afbeelding naar het voorbeeld of kies een foto vanaf je apparaat, stel de uitsnede, passe-partout en lichtsimulatie voor **Dag** en **Avond** af.
3. Klik op **Stuur Dag + Avond naar TV**. Bevestig bij de allereerste verbinding even op je tv-scherm met **Toestaan**.
4. Staan je favoriete kunstwerken al op de tv? Klik dan op **Beheer foto's op tv** en gebruik **Als Dag** / **Als Avond** om ze direct aan je Home Assistant-entiteiten te koppelen.

## Voorbeeld-automatisering (Dag / Avond)

Schakel je tv automatisch naar de Avond-versie bij zonsondergang — zonder ooit handmatig `content_id`'s bij te werken:

```yaml
alias: The Frame naar Avond-versie bij zonsondergang
triggers:
  - trigger: sun
    event: sunset
actions:
  - action: select.select_option
    target:
      entity_id: select.the_frame_art_modus
    data:
      option: "Avond"
```

Gebruik je liever een eigen service (bijvoorbeeld via `samsungtv_smart`)? Dan kun je het nieuwste `content_id` direct uit de sensor lezen:

```yaml
data:
  content_id: "{{ states('sensor.the_frame_avond_content_id') }}"
```

## Licentie

Uitgebracht onder de [MIT-licentie](LICENSE).
