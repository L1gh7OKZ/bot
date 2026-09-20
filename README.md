# NOVA — IA sans limite

Une interface de chat moderne en français, pensée comme un espace de travail créatif : conversations, modèles, suggestions et composer réactif.

## Lancer le projet

Le projet est volontairement sans dépendance ni build step. Depuis la racine :

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Puis ouvrir `http://localhost:4173`.

## Inclus

- Interface responsive desktop et mobile
- Nouvelle conversation et raccourci `⌘ K` / `Ctrl K`
- Réponses de démonstration locales pour tester le flux de conversation
- Sélection de modèles NOVA Infinity, Reason et Create
- Ajout de fichier, mode vocal placeholder, copie de réponse et partage placeholder
- Thème clair/sombre mémorisé localement
- Aucun backend ni clé API requis pour la démo

Les réponses sont simulées dans `app.js`. Pour connecter un vrai modèle, remplacez `responseFor()` par un appel à votre backend (en conservant la clé API côté serveur).
