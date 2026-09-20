#!/usr/bin/env python3
"""Lanceur simple pour Dark Light.

Double-cliquez sur ce fichier pour ouvrir l'interface web locale dans le navigateur.
Les commandes `download`, `key` et `serve` sont également disponibles depuis ce fichier.
"""

from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from nova import main as cli_main

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 4173


class QuietWebHandler(SimpleHTTPRequestHandler):
    """Serveur statique local sans logs d'accès."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, _format: str, *_args) -> None:
        return


def open_web_app(port: int = DEFAULT_PORT) -> int:
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), QuietWebHandler)
    except OSError:
        # Un autre serveur utilise déjà le port : laisser le système choisir un port libre.
        server = ThreadingHTTPServer(("127.0.0.1", 0), QuietWebHandler)

    actual_port = server.server_address[1]
    url = f"http://127.0.0.1:{actual_port}/"
    print(f"Dark Light est ouvert sur {url}")
    print("Fermez cette fenêtre ou utilisez Ctrl+C pour arrêter Dark Light.")
    threading.Timer(0.35, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDark Light arrêté.")
    finally:
        server.server_close()
    return 0


def launcher_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--web-port", type=int, default=DEFAULT_PORT)
    return parser


def main() -> int:
    # Sans argument, le double-clic ouvre directement l'interface.
    if len(sys.argv) == 1:
        return open_web_app()

    if sys.argv[1] in {"web", "--web"}:
        parser = launcher_parser()
        args, unknown = parser.parse_known_args(sys.argv[2:])
        if unknown:
            parser.error(f"arguments inconnus: {' '.join(unknown)}")
        return open_web_app(args.web_port)

    # Les commandes Python existantes restent utilisables avec le fichier Dark Light.
    return cli_main()


if __name__ == "__main__":
    raise SystemExit(main())
