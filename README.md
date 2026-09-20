# DARK LIGHT — IA locale, gratuite et privée

DARK LIGHT est divisé en deux outils clairs :

- `dark_light.py` : l'IA, le téléchargement du modèle, l'interface web et l'API locale ;
- `dark_light_keys.py` : la gestion séparée des clés d'accès.

Les secrets ne sont jamais mélangés au code de l'IA. Ils sont stockés séparément dans `private/dark_light_keys.db`, uniquement sous forme de hash.

La démo ne journalise pas les requêtes et ne sauvegarde pas les conversations. Les services écoutent sur `127.0.0.1` par défaut.

## Ouvrir Dark Light avec un fichier

Double-cliquez sur :

```text
dark_light.py
```

Le navigateur ouvre automatiquement l'interface Dark Light locale.

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

`llama-cpp-python` peut nécessiter un compilateur sur certaines machines. La gestion des clés fonctionne avec la bibliothèque standard Python.

## Télécharger le modèle

Le modèle par défaut est un petit modèle GGUF Qwen public, adapté aux tests locaux :

```bash
python dark_light.py download
```

Le modèle est placé dans `models/`, qui est ignoré par Git. Aucun token Hugging Face n'est écrit sur disque ; pour un dépôt privé, utiliser `HF_TOKEN` ou `--token`.

## Outil séparé de gestion des clés

Créer une clé. Le secret complet est affiché une seule fois :

```bash
python dark_light_keys.py create --name "mon application" --expires-days 30
```

Lister les clés sans afficher les secrets :

```bash
python dark_light_keys.py list
```

Révoquer une clé avec son ID :

```bash
python dark_light_keys.py revoke ID_DE_LA_CLE
```

La base séparée est créée automatiquement ici :

```text
private/dark_light_keys.db
```

Elle ne contient pas les clés en clair. Le dossier `private/` et les modèles sont ignorés par Git.

## Démarrer l'API Dark Light

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

`dark_light.py` ne conserve pas les prompts, les réponses, les adresses IP ou les tokens en clair. `dark_light_keys.py` s'occupe uniquement des clés et ne démarre pas l'IA.

## Note de sécurité

- Garder le dossier `private/` privé.
- Ne pas lancer `--host 0.0.0.0` sur Internet sans HTTPS, pare-feu et authentification adaptée.
- Ne jamais placer une clé API dans le code frontend ou dans Git.
- Le mode direct de l'interface règle le style de réponse ; il ne désactive pas les protections de sécurité propres au modèle.
