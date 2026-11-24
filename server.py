import base64
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import IPv4Address, IPv4Network
import json
from pathlib import Path
import re
import socket
import threading
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent
ORIGIN = "http://127.0.0.1:8765"
LAN_NETWORKS = tuple(map(IPv4Network, ("192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12")))
MAX_IMAGE_SIZE = 28 * 1024 * 1024
MAX_BATCH_SIZE = 72 * 1024 * 1024
MY_PHOTOS_CATEGORY = "MY-C0002"
CONTENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SLOTS_FILE = ROOT / ".frame-runtime" / "tv_slots.json"
TV_LOCK = threading.Lock()


def parse_lan_address(raw_address):
    address = IPv4Address((raw_address or "").strip())
    if not any(address in network for network in LAN_NETWORKS):
        raise ValueError("Geen lokaal IPv4-adres.")
    return str(address)


def validate_content_id(cid):
    if not isinstance(cid, str) or not CONTENT_ID_RE.fullmatch(cid):
        raise ValueError("Ongeldig content_id.")
    return cid


def load_all_slots():
    try:
        if SLOTS_FILE.is_file():
            data = json.loads(SLOTS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def get_tv_slots(address):
    entry = load_all_slots().get(address, {})
    if not isinstance(entry, dict):
        return {"day": None, "evening": None}
    return {
        "day": entry.get("day") if isinstance(entry.get("day"), str) else None,
        "evening": entry.get("evening") if isinstance(entry.get("evening"), str) else None,
        "updatedAt": entry.get("updatedAt"),
    }


def save_tv_slots(address, updates):
    data = load_all_slots()
    current = data.get(address, {}) if isinstance(data.get(address), dict) else {}
    for slot in ("day", "evening"):
        if slot in updates:
            current[slot] = updates[slot]
    current["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    data[address] = current
    SLOTS_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    SLOTS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return get_tv_slots(address)


def check_tv_reachable(address, port=8002, timeout=3.5):
    try:
        with socket.create_connection((address, port), timeout=timeout):
            return
    except OSError as exc:
        raise ConnectionError(
            f"Geen verbinding met {address}:{port}. Controleer of de tv aan of in Art Mode staat en of het IP-adres nog klopt."
        ) from exc


def open_tv_art(address):
    from samsungtvws import SamsungTVArt

    check_tv_reachable(address, port=8002, timeout=3.5)
    token_dir = ROOT / ".frame-runtime" / "tokens"
    token_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    return SamsungTVArt(
        address,
        port=8002,
        timeout=25,
        name="The Frame Generator",
        token_file=str(token_dir / address),
    )


def send_art(address, image, select=True):
    with open_tv_art(address) as art:
        content_id = art.upload(image, file_type="jpg", matte="none", portrait_matte="none")
        if not content_id:
            raise RuntimeError("De tv gaf geen bevestiging voor de upload.")
        if not select:
            return "De foto is naar de tv gestuurd.", content_id
        try:
            art.select_image(content_id, show=True)
        except Exception:
            return "De foto staat op de tv. Open hem in Art Mode bij Mijn foto's.", content_id
    return "De foto is naar de tv gestuurd en geselecteerd in Art Mode.", content_id


def send_art_batch(address, items, replace_previous=True):
    previous = get_tv_slots(address)
    old_ids = []
    if replace_previous:
        for item in items:
            old_id = previous.get(item["slot"])
            if old_id and old_id not in old_ids:
                old_ids.append(old_id)

    uploaded = {}
    selected_id = None
    deleted_ids = []

    with open_tv_art(address) as art:
        for item in items:
            cid = art.upload(
                item["bytes"],
                file_type=item.get("fileType", "jpg"),
                matte="none",
                portrait_matte="none",
            )
            if not cid:
                raise RuntimeError("De tv gaf geen bevestiging voor de upload.")
            uploaded[item["slot"]] = cid
            if item.get("select"):
                selected_id = cid

        if selected_id:
            try:
                art.select_image(selected_id, show=True)
            except Exception:
                pass

        # Only delete previous IDs after new uploads & selection succeeded
        new_ids = set(uploaded.values())
        to_delete = [cid for cid in old_ids if cid not in new_ids]
        if to_delete:
            try:
                if art.delete_list(to_delete):
                    deleted_ids = to_delete
                else:
                    # Fallback to deleting one by one in case one old ID was already removed on TV
                    for cid in to_delete:
                        try:
                            if art.delete(cid):
                                deleted_ids.append(cid)
                        except Exception:
                            pass
            except Exception:
                pass

    slots = save_tv_slots(address, uploaded)
    return uploaded, deleted_ids, slots


def list_tv_library(address):
    slots = get_tv_slots(address)
    with open_tv_art(address) as art:
        items = []
        try:
            items = art.available(MY_PHOTOS_CATEGORY) or []
        except Exception:
            items = []

        if not items:
            all_items = art.available() or []
            filtered = [
                it for it in all_items
                if isinstance(it, dict)
                and (
                    it.get("category_id") == MY_PHOTOS_CATEGORY
                    or str(it.get("category_id", "")).startswith("MY-")
                    or str(it.get("content_id", "")).startswith(("MY_", "MY-", "F"))
                )
            ]
            items = filtered or [it for it in all_items if isinstance(it, dict)]

        current_id = None
        try:
            current = art.get_current()
            if isinstance(current, dict):
                current_id = current.get("content_id")
        except Exception:
            pass

        content_ids = [it["content_id"] for it in items if isinstance(it, dict) and it.get("content_id")]
        thumbnails = {}
        # Fetch thumbnails in chunks so large galleries don't overwhelm the TV socket
        for i in range(0, len(content_ids), 15):
            chunk = content_ids[i : i + 15]
            try:
                raw_thumbs = art.get_thumbnail_list(chunk) or {}
                for raw_name, raw_bytes in raw_thumbs.items():
                    cid = str(raw_name).split(".")[0]
                    if raw_bytes:
                        mime = "image/png" if bytes(raw_bytes[:4]) == b"\x89PNG" else "image/jpeg"
                        b64 = base64.b64encode(bytes(raw_bytes)).decode("ascii")
                        thumbnails[cid] = f"data:{mime};base64,{b64}"
            except Exception:
                break

    formatted = []
    for it in items:
        if not isinstance(it, dict) or not it.get("content_id"):
            continue
        cid = it["content_id"]
        slot = None
        if cid == slots.get("day"):
            slot = "day"
        elif cid == slots.get("evening"):
            slot = "evening"
        formatted.append({
            "contentId": cid,
            "date": it.get("image_date") or "",
            "width": it.get("width"),
            "height": it.get("height"),
            "matteId": it.get("matte_id") or "",
            "isCurrent": cid == current_id,
            "slot": slot,
            "thumbnail": thumbnails.get(cid),
        })

    formatted.sort(key=lambda x: (x["date"], x["contentId"]), reverse=True)
    return formatted, current_id, slots


def select_tv_art(address, content_id):
    with open_tv_art(address) as art:
        art.select_image(content_id, show=True)


def delete_tv_art(address, content_ids):
    deleted = []
    skipped_current = None
    with open_tv_art(address) as art:
        current_id = None
        try:
            current = art.get_current()
            if isinstance(current, dict):
                current_id = current.get("content_id")
        except Exception:
            pass

        safe_ids = []
        for cid in content_ids:
            if cid == current_id:
                skipped_current = cid
            elif cid not in safe_ids:
                safe_ids.append(cid)

        for i in range(0, len(safe_ids), 20):
            chunk = safe_ids[i : i + 20]
            try:
                if art.delete_list(chunk):
                    deleted.extend(chunk)
                else:
                    for cid in chunk:
                        try:
                            if art.delete(cid):
                                deleted.append(cid)
                        except Exception:
                            pass
            except Exception:
                for cid in chunk:
                    try:
                        if art.delete(cid):
                            deleted.append(cid)
                    except Exception:
                        pass

    current_slots = get_tv_slots(address)
    updates = {}
    deleted_set = set(deleted)
    for slot in ("day", "evening"):
        if current_slots.get(slot) in deleted_set:
            updates[slot] = None
    slots = save_tv_slots(address, updates) if updates else current_slots
    return deleted, skipped_current, slots


class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def respond(self, status, message, **extra):
        payload = {"message": message, **extra}
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def check_local_post(self):
        return self.headers.get("Origin") == ORIGIN and self.headers.get("Host") == "127.0.0.1:8765"

    def read_json_body(self, max_size):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Ongeldige aanvraag.")
        if not 0 < length <= max_size:
            raise ValueError("Aanvraag is te groot of leeg.")
        self.connection.settimeout(30)
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise TimeoutError("Aanvraag is niet volledig ontvangen.")
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Ongeldig JSON-formaat.")
        return data

    def send_head(self):
        route = unquote(urlsplit(self.path).path)
        parts = route.strip("/").split("/")
        allowed = route in {"/", "/index.html", "/app.js", "/style.css"} or (
            len(parts) == 2
            and parts[0] in {"Shadow Overlays", "White Paper Textures"}
            and Path(parts[1]).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".avif"}
            and (ROOT / parts[0] / parts[1]).is_file()
        )
        if not allowed:
            self.send_error(404)
            return None
        return super().send_head()

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == "/api/ready":
            return self.respond(200, "The Frame Generator")

        if parsed.path == "/api/tv/slots":
            if self.headers.get("Host") != "127.0.0.1:8765":
                return self.respond(403, "Open de editor via het lokale startbestand.")
            params = parse_qs(parsed.query)
            try:
                address = parse_lan_address(params.get("address", [""])[0])
            except ValueError:
                return self.respond(400, "Vul het lokale IPv4-adres van de tv in.")
            return self.respond(200, "OK", slots=get_tv_slots(address))

        if parsed.path == "/api/tv/library":
            if self.headers.get("Host") != "127.0.0.1:8765":
                return self.respond(403, "Open de editor via het lokale startbestand.")
            params = parse_qs(parsed.query)
            try:
                address = parse_lan_address(params.get("address", [""])[0])
            except ValueError:
                return self.respond(400, "Vul het lokale IPv4-adres van de tv in.")
            if not TV_LOCK.acquire(blocking=False):
                return self.respond(409, "De tv is al bezig met een andere actie.")
            try:
                items, current_id, slots = list_tv_library(address)
                return self.respond(
                    200,
                    f"{len(items)} eigen foto's gevonden op de tv.",
                    items=items,
                    currentId=current_id,
                    slots=slots,
                )
            except ModuleNotFoundError:
                return self.respond(503, "De Art Mode-bibliotheek ontbreekt. Start de editor via het startbestand.")
            except ConnectionError as error:
                self.log_error("Art Mode library: %s", error)
                return self.respond(502, str(error))
            except Exception as error:
                self.log_error("Art Mode library: %s: %s", type(error).__name__, error)
                return self.respond(502, f"Kon de lijst op de tv niet ophalen ({type(error).__name__}). Controleer het IP-adres en of de tv aan of in Art Mode staat.")
            finally:
                TV_LOCK.release()

        return super().do_GET()

    def do_POST(self):
        if not self.check_local_post():
            return self.respond(403, "Open de editor via het lokale startbestand.")

        if self.path == "/api/art":
            return self.handle_single_art()
        if self.path == "/api/art/batch":
            return self.handle_batch_art()
        if self.path == "/api/tv/select":
            return self.handle_tv_select()
        if self.path == "/api/tv/delete":
            return self.handle_tv_delete()
        return self.respond(404, "Onbekende route.")

    def handle_single_art(self):
        try:
            address = parse_lan_address(self.headers.get("X-TV-Address", ""))
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.respond(400, "Vul het lokale IPv4-adres van de tv in.")
        if self.headers.get_content_type() != "image/jpeg" or not 0 < length <= MAX_IMAGE_SIZE:
            return self.respond(400, "De tv-upload verwacht een JPEG van maximaal 16 MB.")
        if not TV_LOCK.acquire(blocking=False):
            return self.respond(409, "De tv is al bezig met een andere actie.")
        try:
            self.connection.settimeout(15)
            try:
                image = self.rfile.read(length)
            except TimeoutError:
                return self.respond(408, "De lokale editor heeft de JPEG niet volledig ontvangen.")
            if len(image) != length or not image.startswith(b"\xff\xd8\xff") or not image.endswith(b"\xff\xd9"):
                return self.respond(400, "Het JPEG-bestand is onvolledig.")
            select = self.headers.get("X-TV-Select", "1").lower() not in {"0", "false", "no"}
            try:
                message, content_id = send_art(address, image, select=select)
            except ModuleNotFoundError:
                return self.respond(503, "De Art Mode-bibliotheek ontbreekt. Start de editor via het startbestand.")
            except Exception as error:
                self.log_error("Art Mode: %s", type(error).__name__)
                return self.respond(502, "De tv bevestigde de upload niet. Controleer het IP-adres en zet de tv in Art Mode. Bevestig een eventuele verbindingsmelding op de tv.")
            return self.respond(200, message, contentId=content_id)
        finally:
            TV_LOCK.release()

    def handle_batch_art(self):
        try:
            body = self.read_json_body(MAX_BATCH_SIZE)
            address = parse_lan_address(body.get("address", ""))
            raw_items = body.get("items")
            if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 2:
                raise ValueError("Geef 1 of 2 afbeeldingen mee.")
            items = []
            for raw in raw_items:
                if not isinstance(raw, dict):
                    raise ValueError("Ongeldig upload-item.")
                slot = raw.get("slot")
                if slot not in {"day", "evening"}:
                    raise ValueError("Ongeldig profielslot.")
                file_type = str(raw.get("fileType", "jpg")).lower()
                if file_type == "jpeg":
                    file_type = "jpg"
                if file_type not in {"jpg", "png"}:
                    raise ValueError("Ongeldig bestandstype (gebruik JPEG of PNG).")
                img_bytes = base64.b64decode(raw.get("imageBase64", ""), validate=True)
                if not 0 < len(img_bytes) <= MAX_IMAGE_SIZE:
                    raise ValueError("Het afbeeldingsbestand is leeg of groter dan 28 MB.")
                if file_type == "jpg":
                    if not img_bytes.startswith(b"\xff\xd8\xff") or not img_bytes.endswith(b"\xff\xd9"):
                        raise ValueError("Het JPEG-bestand is onvolledig.")
                else:
                    if not img_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
                        raise ValueError("Het PNG-bestand is onvolledig.")
                items.append({
                    "slot": slot,
                    "fileType": file_type,
                    "bytes": img_bytes,
                    "select": bool(raw.get("select", False)),
                })
            replace_previous = bool(body.get("replacePrevious", True))
        except TimeoutError as err:
            return self.respond(408, str(err))
        except Exception as err:
            return self.respond(400, str(err) if str(err) else "Ongeldige upload-aanvraag.")

        if not TV_LOCK.acquire(blocking=False):
            return self.respond(409, "De tv is al bezig met een andere actie.")
        try:
            uploaded, deleted, slots = send_art_batch(address, items, replace_previous=replace_previous)
            parts = []
            if "day" in uploaded:
                parts.append(f"Dag: {uploaded['day']}")
            if "evening" in uploaded:
                parts.append(f"Avond: {uploaded['evening']}")
            prefix = "Dag- en Avond-versie op de tv gezet" if len(uploaded) == 2 else "Foto op de tv gezet"
            removed = f" · {len(deleted)} vorige verwijderd" if deleted else ""
            msg = f"{prefix} ({' · '.join(parts)}{removed})."
            return self.respond(200, msg, uploaded=uploaded, deleted=deleted, slots=slots)
        except ModuleNotFoundError:
            return self.respond(503, "De Art Mode-bibliotheek ontbreekt. Start de editor via het startbestand.")
        except ConnectionError as error:
            self.log_error("Art Mode batch: %s", error)
            return self.respond(502, str(error))
        except Exception as error:
            self.log_error("Art Mode batch: %s: %s", type(error).__name__, error)
            return self.respond(502, "De tv bevestigde de upload niet. Controleer het IP-adres en zet de tv in Art Mode. Bevestig een eventuele verbindingsmelding op de tv.")
        finally:
            TV_LOCK.release()

    def handle_tv_select(self):
        try:
            body = self.read_json_body(64 * 1024)
            address = parse_lan_address(body.get("address", ""))
            content_id = validate_content_id(body.get("contentId"))
        except Exception as err:
            return self.respond(400, str(err) or "Ongeldige aanvraag.")

        if not TV_LOCK.acquire(blocking=False):
            return self.respond(409, "De tv is al bezig met een andere actie.")
        try:
            select_tv_art(address, content_id)
            return self.respond(200, f"{content_id} wordt nu getoond in Art Mode.", contentId=content_id)
        except ModuleNotFoundError:
            return self.respond(503, "De Art Mode-bibliotheek ontbreekt. Start de editor via het startbestand.")
        except Exception as error:
            self.log_error("Art Mode select: %s", type(error).__name__)
            return self.respond(502, f"Kon {content_id} niet selecteren op de tv.")
        finally:
            TV_LOCK.release()

    def handle_tv_delete(self):
        try:
            body = self.read_json_body(256 * 1024)
            address = parse_lan_address(body.get("address", ""))
            raw_ids = body.get("contentIds")
            if not isinstance(raw_ids, list) or not raw_ids:
                raise ValueError("Kies minstens één afbeelding om te verwijderen.")
            content_ids = [validate_content_id(cid) for cid in raw_ids]
        except Exception as err:
            return self.respond(400, str(err) or "Ongeldige aanvraag.")

        if not TV_LOCK.acquire(blocking=False):
            return self.respond(409, "De tv is al bezig met een andere actie.")
        try:
            deleted, skipped_current, slots = delete_tv_art(address, content_ids)
            if skipped_current and not deleted:
                return self.respond(
                    200,
                    f"{skipped_current} wordt nu op de tv getoond en is daarom overgeslagen.",
                    deleted=deleted,
                    skippedCurrent=skipped_current,
                    slots=slots,
                )
            extra = f" ({skipped_current} overgeslagen omdat die nu actief is)" if skipped_current else ""
            noun = "foto" if len(deleted) == 1 else "foto's"
            return self.respond(
                200,
                f"{len(deleted)} {noun} verwijderd van de tv{extra}.",
                deleted=deleted,
                skippedCurrent=skipped_current,
                slots=slots,
            )
        except ModuleNotFoundError:
            return self.respond(503, "De Art Mode-bibliotheek ontbreekt. Start de editor via het startbestand.")
        except Exception as error:
            self.log_error("Art Mode delete: %s", type(error).__name__)
            return self.respond(502, "Verwijderen op de tv is niet gelukt. Controleer de verbinding met de tv.")
        finally:
            TV_LOCK.release()


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 8765), EditorHandler) as server:
        server.serve_forever()
