#!/usr/bin/env python3
"""Dark Light local — téléchargement d'un modèle et API privée à clés.

Le serveur ne journalise pas les requêtes et ne sauvegarde pas les messages.
Les clés API sont stockées sous forme de hash SHA-256 uniquement.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
import threading
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

APP_NAME = "Dark Light local"
APP_DIR = Path(__file__).resolve().parent
DEFAULT_DB = APP_DIR / "private/dark_light_keys.db"
DEFAULT_MODEL_DIR = APP_DIR / "models/dark-light-qwen"
DEFAULT_REPO_ID = "Qwen/Qwen2.5-0.5B-Instruct-GGUF"
DEFAULT_FILENAME = "qwen2.5-0.5b-instruct-q4_k_m.gguf"
MAX_BODY_BYTES = 2_000_000
MAX_MESSAGES = 64
MAX_MESSAGE_CHARS = 20_000



def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="seconds")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def format_expiry(expires_days: int | None) -> str | None:
    if expires_days is None:
        return None
    if expires_days < 1:
        raise ValueError("--expires-days doit être supérieur ou égal à 1")
    return (utc_now() + timedelta(days=expires_days)).isoformat(timespec="seconds")


class KeyStore:
    """Base séparée des clés : aucun secret brut n'est écrit dans SQLite."""

    def __init__(self, path: Path = DEFAULT_DB):
        self.path = path.expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    key_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    secret_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT,
                    revoked_at TEXT
                )
                """
            )

    def create(self, name: str, expires_days: int | None = None) -> tuple[str, str, str | None]:
        clean_name = " ".join(name.strip().split())[:80]
        if not clean_name:
            raise ValueError("Le nom de la clé ne peut pas être vide")

        key_id = secrets.token_hex(6)
        secret = secrets.token_urlsafe(32)
        token = f"darklight_{key_id}_{secret}"
        expires_at = format_expiry(expires_days)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO api_keys (key_id, name, secret_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                (key_id, clean_name, token_hash(token), iso_now(), expires_at),
            )
        return key_id, token, expires_at

    def list(self) -> list[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(
                "SELECT key_id, name, created_at, expires_at, revoked_at FROM api_keys ORDER BY created_at DESC"
            ).fetchall()

    def revoke(self, key_id: str) -> bool:
        with self._connect() as connection:
            result = connection.execute(
                "UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE key_id = ?",
                (iso_now(), key_id),
            )
            return result.rowcount == 1

    def valid(self, token: str) -> bool:
        if not token or len(token) > 300:
            return False
        digest = token_hash(token)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT secret_hash, expires_at, revoked_at FROM api_keys WHERE secret_hash = ?",
                (digest,),
            ).fetchone()
        if row is None or not hmac.compare_digest(row["secret_hash"], digest):
            return False
        if row["revoked_at"]:
            return False
        if row["expires_at"]:
            try:
                expiry = datetime.fromisoformat(row["expires_at"])
            except ValueError:
                return False
            if utc_now() >= expiry:
                return False
        return True


class LocalModel:
    """Adaptateur minimal pour un modèle GGUF via llama-cpp-python."""

    def __init__(self, model_path: Path, context_size: int = 4096):
        try:
            from llama_cpp import Llama  # type: ignore
        except ImportError as error:
            raise RuntimeError(
                "llama-cpp-python n'est pas installé. Lancez: pip install llama-cpp-python"
            ) from error

        if not model_path.is_file():
            raise FileNotFoundError(f"Modèle introuvable: {model_path}")

        self.path = model_path
        self._llama = Llama(
            model_path=str(model_path),
            n_ctx=context_size,
            verbose=False,
        )

    def chat(self, messages: list[dict[str, str]], max_tokens: int, temperature: float) -> str:
        result = self._llama.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        choices = result.get("choices") or []
        if not choices:
            raise RuntimeError("Le modèle n'a renvoyé aucune réponse")
        content = choices[0].get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Le modèle a renvoyé une réponse vide")
        return content.strip()


def download_model(repo_id: str, filename: str, local_dir: Path, revision: str, token: str | None) -> Path:
    try:
        from huggingface_hub import snapshot_download  # type: ignore
    except ImportError as error:
        raise RuntimeError(
            "huggingface-hub n'est pas installé. Lancez: pip install huggingface-hub"
        ) from error

    local_dir.mkdir(parents=True, exist_ok=True)
    downloaded_dir = snapshot_download(
        repo_id=repo_id,
        revision=revision,
        local_dir=str(local_dir),
        allow_patterns=[filename],
        token=token or None,
    )
    model_path = Path(downloaded_dir) / filename
    if not model_path.is_file():
        raise FileNotFoundError(
            f"Le fichier {filename!r} n'a pas été trouvé dans le dépôt {repo_id!r}. "
            "Utilisez --filename pour choisir un fichier GGUF."
        )
    return model_path


def validate_messages(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value or len(value) > MAX_MESSAGES:
        raise ValueError(f"messages doit être une liste de 1 à {MAX_MESSAGES} éléments")

    allowed_roles = {"system", "user", "assistant"}
    messages: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("Chaque message doit être un objet")
        role = item.get("role")
        content = item.get("content")
        if role not in allowed_roles or not isinstance(content, str) or not content.strip():
            raise ValueError("Chaque message doit avoir un role valide et un content non vide")
        if len(content) > MAX_MESSAGE_CHARS:
            raise ValueError(f"Chaque message est limité à {MAX_MESSAGE_CHARS} caractères")
        messages.append({"role": role, "content": content})
    return messages


class DarkLightHandler(BaseHTTPRequestHandler):
    """API HTTP sans journal de requêtes ni stockage des conversations."""

    server_version = "DARK-LIGHT/1.0"
    sys_version = ""

    @property
    def dark_light_server(self) -> "DarkLightServer":
        return self.server  # type: ignore[return-value]

    def log_message(self, _format: str, *_args: Any) -> None:
        # Aucun log d'accès : ne pas écrire de token, de corps de requête ou d'adresse IP.
        return

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def _bearer_token(self) -> str | None:
        value = self.headers.get("Authorization", "")
        scheme, _, token = value.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        return token.strip()

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._send_json(404, {"error": "not_found"})
            return
        self._send_json(200, {"ok": True, "model": self.dark_light_server.model_name})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/chat":
            self._send_json(404, {"error": "not_found"})
            return
        if not self.dark_light_server.keys.valid(self._bearer_token() or ""):
            self._send_json(401, {"error": "invalid_api_key"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "invalid_content_length"})
            return
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._send_json(413, {"error": "request_too_large"})
            return

        try:
            body = json.loads(self.rfile.read(content_length))
            messages = validate_messages(body.get("messages"))
            max_tokens = min(max(int(body.get("max_tokens", 512)), 1), 4096)
            temperature = min(max(float(body.get("temperature", 0.7)), 0.0), 2.0)
            answer = self.dark_light_server.model.chat(messages, max_tokens, temperature)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": "invalid_request", "detail": str(error)})
            return
        except Exception:
            # Ne pas exposer de chemin, de token ou de trace interne dans la réponse.
            self._send_json(500, {"error": "model_error"})
            return

        self._send_json(200, {
            "id": f"chat_{secrets.token_hex(12)}",
            "object": "chat.completion",
            "model": self.dark_light_server.model_name,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}}],
        })


class DarkLightServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], keys: KeyStore, model: LocalModel, model_name: str):
        super().__init__(address, DarkLightHandler)
        self.keys = keys
        self.model = model
        self.model_name = model_name


def command_download(args: argparse.Namespace) -> int:
    token = args.token or os.environ.get("HF_TOKEN")
    try:
        path = download_model(args.repo_id, args.filename, Path(args.local_dir), args.revision, token)
    except Exception as error:
        print(f"Erreur de téléchargement: {error}", file=sys.stderr)
        return 1
    print(f"Modèle téléchargé dans: {path}")
    print("Aucun token Hugging Face n'a été écrit sur disque.")
    return 0


def command_create(args: argparse.Namespace) -> int:
    try:
        key_id, token, expires_at = KeyStore(Path(args.db)).create(args.name, args.expires_days)
    except Exception as error:
        print(f"Erreur de création: {error}", file=sys.stderr)
        return 1
    print("Clé créée. Copiez-la maintenant : elle ne sera plus affichée ensuite.")
    print(f"ID       : {key_id}")
    print(f"Nom      : {args.name}")
    print(f"Expire   : {expires_at or 'jamais'}")
    print(f"API key  : {token}")
    return 0


def command_list(args: argparse.Namespace) -> int:
    rows = KeyStore(Path(args.db)).list()
    if not rows:
        print("Aucune clé.")
        return 0
    print(f"{'ID':14} {'NOM':24} {'STATUT':10} {'CRÉÉE':25} EXPIRATION")
    for row in rows:
        status = "révoquée" if row["revoked_at"] else "active"
        expiry = row["expires_at"] or "jamais"
        print(f"{row['key_id']:14} {row['name'][:24]:24} {status:10} {row['created_at']:25} {expiry}")
    return 0


def command_revoke(args: argparse.Namespace) -> int:
    if KeyStore(Path(args.db)).revoke(args.key_id):
        print(f"Clé révoquée: {args.key_id}")
        return 0
    print(f"Clé introuvable: {args.key_id}", file=sys.stderr)
    return 1


def find_default_model() -> Path | None:
    path = DEFAULT_MODEL_DIR / DEFAULT_FILENAME
    return path if path.is_file() else None


def command_serve(args: argparse.Namespace) -> int:
    model_path = Path(args.model) if args.model else find_default_model()
    if model_path is None:
        print(
            "Modèle introuvable. Lancez d'abord `python dark_light.py download` "
            "ou utilisez `--model chemin/vers/model.gguf`.",
            file=sys.stderr,
        )
        return 1
    try:
        model = LocalModel(model_path, args.context)
        keys = KeyStore(Path(args.db))
        server = DarkLightServer((args.host, args.port), keys, model, model_path.name)
    except Exception as error:
        print(f"Impossible de démarrer Dark Light: {error}", file=sys.stderr)
        return 1

    print(f"Dark Light est disponible sur http://{args.host}:{args.port}")
    print("Aucun log de requête et aucun message sauvegardé.")
    print("Arrêt: Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDark Light arrêté.")
    finally:
        server.server_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=Path(sys.argv[0]).name,
        description="Fichier unique pour télécharger, servir et gérer Dark Light.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    download = subparsers.add_parser("download", help="Télécharger un modèle depuis Hugging Face")
    download.add_argument("--repo-id", default=DEFAULT_REPO_ID)
    download.add_argument("--filename", default=DEFAULT_FILENAME)
    download.add_argument("--local-dir", default=str(DEFAULT_MODEL_DIR))
    download.add_argument("--revision", default="main")
    download.add_argument("--token", help="Token HF optionnel; HF_TOKEN est utilisé par défaut")
    download.set_defaults(func=command_download)

    key = subparsers.add_parser("key", help="Gérer les clés d'accès séparément du modèle")
    key_subparsers = key.add_subparsers(dest="key_command", required=True)

    create = key_subparsers.add_parser("create", help="Créer une clé")
    create.add_argument("--name", required=True, help="Nom interne de la clé")
    create.add_argument("--expires-days", type=int, help="Durée de validité; par défaut sans expiration")
    create.add_argument("--db", default=str(DEFAULT_DB))
    create.set_defaults(func=command_create)

    list_keys = key_subparsers.add_parser("list", help="Lister les clés sans afficher les secrets")
    list_keys.add_argument("--db", default=str(DEFAULT_DB))
    list_keys.set_defaults(func=command_list)

    revoke = key_subparsers.add_parser("revoke", help="Révoquer une clé")
    revoke.add_argument("key_id")
    revoke.add_argument("--db", default=str(DEFAULT_DB))
    revoke.set_defaults(func=command_revoke)

    serve = subparsers.add_parser("serve", help="Démarrer l'API locale")
    serve.add_argument("--model", help="Chemin vers un fichier .gguf")
    serve.add_argument("--host", default="127.0.0.1", help="127.0.0.1 par défaut pour rester local")
    serve.add_argument("--port", type=int, default=8787)
    serve.add_argument("--context", type=int, default=4096)
    serve.add_argument("--db", default=str(DEFAULT_DB))
    serve.set_defaults(func=command_serve)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\nInterrompu.", file=sys.stderr)
        return 130




class QuietWebHandler(SimpleHTTPRequestHandler):
    """Serveur web de Dark Light sans logs d'accès."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parent), **kwargs)

    def log_message(self, _format: str, *_args: Any) -> None:
        return


def open_web_app(port: int = 4173) -> int:
    """Ouvre l'interface web locale, sans dépendance externe."""
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), QuietWebHandler)
    except OSError:
        server = ThreadingHTTPServer(("127.0.0.1", 0), QuietWebHandler)

    actual_port = server.server_address[1]
    url = f"http://127.0.0.1:{actual_port}/"
    print(f"Dark Light est ouvert sur {url}", flush=True)
    print("Fermez cette fenêtre ou utilisez Ctrl+C pour arrêter Dark Light.", flush=True)
    threading.Timer(0.35, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDark Light arrêté.")
    finally:
        server.server_close()
    return 0


def run_as_file() -> int:
    """Double-clic = interface web ; sous-commandes = téléchargement/API/clés."""
    if len(sys.argv) == 1:
        return open_web_app()
    if sys.argv[1] in {"web", "--web"}:
        web_parser = argparse.ArgumentParser(description="Ouvrir l'interface Dark Light")
        web_parser.add_argument("--web-port", type=int, default=4173)
        args = web_parser.parse_args(sys.argv[2:])
        return open_web_app(args.web_port)
    return main()


if __name__ == "__main__":
    raise SystemExit(run_as_file())
