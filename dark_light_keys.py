#!/usr/bin/env python3
"""Outil séparé de gestion des clés d'accès Dark Light.

Les secrets sont affichés une seule fois et la base ne conserve que leur hash.
Ce fichier ne démarre pas l'IA et ne contient aucun modèle.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import secrets
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
DEFAULT_DB = APP_DIR / "private/dark_light_keys.db"


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog=Path(sys.argv[0]).name,
        description="Outil Dark Light pour créer et révoquer les clés d'accès séparément de l'IA.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Créer une clé")
    create.add_argument("--name", required=True, help="Nom interne de la clé")
    create.add_argument("--expires-days", type=int, help="Durée de validité; par défaut sans expiration")
    create.add_argument("--db", default=str(DEFAULT_DB))
    create.set_defaults(func=command_create)

    list_keys = subparsers.add_parser("list", help="Lister les clés sans afficher les secrets")
    list_keys.add_argument("--db", default=str(DEFAULT_DB))
    list_keys.set_defaults(func=command_list)

    revoke = subparsers.add_parser("revoke", help="Révoquer une clé")
    revoke.add_argument("key_id")
    revoke.add_argument("--db", default=str(DEFAULT_DB))
    revoke.set_defaults(func=command_revoke)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\nInterrompu.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
