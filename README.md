# DARK LIGHT — IA locale, gratuite et privée

DARK LIGHT contient maintenant :

- une interface web dark en français ;
- un script Python pour télécharger un modèle open source ;
- une API locale de chat protégée par clés d'accès ;
- un gestionnaire de clés intégré, sans stockage des secrets en clair.

La démo ne journalise pas les requêtes et ne sauvegarde pas les conversations. Le script Python écoute sur `127.0.0.1` par défaut.

## Interface web

Le projet web est sans build step :

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Puis ouvrir `http://localhost:4173`.

## Ouvrir avec un seul fichier

Double-cliquez sur `dark_light.py` : le navigateur ouvre automatiquement l'interface Dark Light locale.

Ou depuis un terminal :

```bash
python dark_light.py
```

Pour ouvrir l'interface sur un port précis :

```bash
python dark_light.py web --web-port 4173
```

## Installer le logiciel Python

Python 3.10 ou plus récent est recommandé. Pour créer un environnement isolé :

```bash
python3 -m venv .venv
. .venv/bin/activate       # Windows : .venv\\Scripts\\activate
pip install -r requirements.txt
```

`llama-cpp-python` peut nécessiter un compilateur sur certaines machines. La commande `key` fonctionne avec la bibliothèque standard Python, sans dépendance supplémentaire.

## Télécharger le modèle

Le modèle par défaut est un petit modèle GGUF Qwen public, adapté aux tests locaux :

```bash
python dark_light.py download
```

Le téléchargement utilise le cache Hugging Face. Aucun token Hugging Face n'est écrit par DARK LIGHT ; pour un dépôt privé, fournir le token uniquement via la variable d'environnement `HF_TOKEN` ou `--token`.

Pour choisir un autre dépôt ou un autre fichier GGUF :

```bash
python dark_light.py download \
  --repo-id Qwen/Qwen2.5-0.5B-Instruct-GGUF \
  --filename qwen2.5-0.5b-instruct-q4_k_m.gguf
```

## Créer des clés d'accès

Créer une clé. Le secret complet n'est affiché qu'une seule fois :

```bash
python dark_light.py key create --name "mon application" --expires-days 30
```

Lister les clés sans révéler les secrets :

```bash
python dark_light.py key list
```

Révoquer une clé avec son ID :

```bash
python dark_light.py key revoke ID_DE_LA_CLE
```

Les clés sont stockées dans `dark_light_keys.db` sous forme de hash SHA-256. La base et les modèles sont ignorés par Git.

## Démarrer l'API privée

Après le téléchargement et la création d'une clé :

```bash
python dark_light.py serve
```

L'API est disponible en local sur `http://127.0.0.1:8787`.

Tester la santé du service :

```bash
curl http://127.0.0.1:8787/health
```

Appeler le modèle avec une clé :

```bash
curl http://127.0.0.1:8787/v1/chat \\
  -H "Authorization: Bearer darklight_ID_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Bonjour Dark Light"}]}'
```

L'API ne conserve pas les prompts, les réponses, les adresses IP ou les tokens en clair. `dark_light.py` n'ajoute pas de filtre applicatif de contenu ; le comportement et les protections dépendent du modèle open source choisi.

## Note de sécurité

- Garder `dark_light_keys.db` privé.
- Ne pas lancer `--host 0.0.0.0` sur Internet sans HTTPS, pare-feu et authentification adaptée.
- Ne jamais placer une clé API dans le code frontend ou dans Git.
- Le mode direct de l'interface règle le style de réponse ; il ne désactive pas les protections de sécurité propres au modèle.
