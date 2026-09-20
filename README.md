# DARK LIGHT — fichier unique

DARK LIGHT est maintenant livré dans un seul fichier téléchargeable :

```text
dark_light.py
```

Ce fichier contient toute l'application :

- interface web dark ;
- téléchargement du modèle ;
- serveur local ;
- API de chat ;
- création et révocation des clés d'accès.

Les clés restent séparées du code : elles sont enregistrées dans `private/dark_light_keys.db`, uniquement sous forme de hash SHA-256. Le fichier des clés est créé automatiquement et n'est pas versionné.

## Ouvrir l'application

Double-cliquez sur `dark_light.py` : le navigateur ouvre automatiquement l'interface Dark Light locale.

Ou depuis un terminal :

```bash
python dark_light.py
```

Pour choisir le port de l'interface :

```bash
python dark_light.py web --web-port 4173
```

## Installer les dépendances

Python 3.10 ou plus récent est recommandé :

```bash
python3 -m venv .venv
. .venv/bin/activate       # Windows : .venv\\Scripts\\activate
pip install -r requirements.txt
```

La gestion des clés fonctionne avec la bibliothèque standard Python. `llama-cpp-python` peut nécessiter un compilateur sur certaines machines.

## Télécharger le modèle

Le modèle par défaut est un petit modèle GGUF Qwen public, adapté aux tests locaux :

```bash
python dark_light.py download
```

Le modèle est placé dans `models/`, qui est ignoré par Git.

## Gérer les clés depuis le même fichier

Créer une clé. Le secret complet est affiché une seule fois :

```bash
python dark_light.py key create --name "mon application" --expires-days 30
```

Lister les clés sans afficher les secrets :

```bash
python dark_light.py key list
```

Révoquer une clé avec son ID :

```bash
python dark_light.py key revoke ID_DE_LA_CLE
```

Les clés sont séparées du code dans :

```text
private/dark_light_keys.db
```

## Démarrer l'API

Après le téléchargement du modèle et la création d'une clé :

```bash
python dark_light.py serve
```

L'API est disponible en local sur `http://127.0.0.1:8787`.

Tester la santé du service :

```bash
curl http://127.0.0.1:8787/health
```

Appeler l'IA avec une clé :

```bash
curl http://127.0.0.1:8787/v1/chat \\
  -H "Authorization: Bearer darklight_ID_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Bonjour Dark Light"}]}'
```

L'API ne conserve pas les prompts, les réponses, les adresses IP ou les tokens en clair.

## Sécurité

- Garder le dossier `private/` privé.
- Ne pas lancer `--host 0.0.0.0` sur Internet sans HTTPS, pare-feu et authentification adaptée.
- Ne jamais placer une clé API dans le frontend ou dans Git.
- Le mode direct règle le style de réponse ; il ne désactive pas les protections propres au modèle.
