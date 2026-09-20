# NOVA — IA locale, gratuite et privée

Une interface de chat moderne en français, pensée comme un espace de travail créatif. Cette version de démonstration fonctionne entièrement dans le navigateur : les réponses sont locales, les conversations restent en mémoire dans l’onglet et disparaissent au rechargement.

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
- Thème sombre rouge par défaut avec option de contraste clair
- Mode direct activable pour un ton plus franc et moins verbeux
- Changement de conversation réellement fonctionnel, avec annulation propre d'une génération en cours
- Aucun compte, aucun analytics, aucun cookie et aucune dépendance distante
- Police système locale et Content Security Policy qui bloque les connexions sortantes de la démo

## Confidentialité et modèle réel

La démo n’envoie et n’enregistre aucun message : aucun backend n’est appelé et le contenu disparaît au rechargement. Le serveur HTTP de développement peut toutefois afficher les requêtes techniques de fichiers dans son terminal, sans contenu de conversation.

Les réponses sont simulées dans `app.js`. Pour connecter un vrai modèle, remplacez `responseFor()` par un appel à votre backend. Dans ce cas, la confidentialité dépendra de l’hébergeur et du modèle choisi. Le mode direct concerne le style de réponse ; il ne désactive pas les protections de sécurité du modèle connecté.
