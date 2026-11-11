# Cahier des charges — changements v1.1 et v1.2

> **Source :** retours de la Direction sur le CDC détaillé V1.
> **Portée :** ce document **remplace** le CDC V1 partout où il le contredit.
> **Implémentation :** prototype web Next.js de ce dépôt (données stockées dans le navigateur, pas de backend). La colonne « Prototype » des tableaux indique l'équivalent retenu pour chaque élément backend.

## Changements v1.2 — retours de la Direction

> Ces points **remplacent** la v1.1 et le CDC V1 partout où ils les contredisent.

| # | Changement | En bref |
|---|---|---|
| 1 | **Aucune notion d'argent** | Plus de prix ni de devise sur le cahier des charges, plus d'écart de prix dans la comparaison, plus de montant sur les abonnements. ~~RG-02 « prix proposé »~~, ~~Q8 devise~~, ~~matrice « prix masqués »~~ : **supprimés v1.2**. |
| 2 | **Client saisi librement** | Aucun lien avec l'ERP ni le CRM : le nom du client est un champ texte (`Project.client_name`), avec suggestion des clients déjà saisis. ~~Q1~~, ~~RG-03 « clients partagés »~~ et l'app `core` (Client) : **supprimés v1.2**. |
| 3 | **Projets de développement uniquement** | Type **mobile** ou **web**. ~~Département~~, ~~`is_major`~~, ~~RG-01 / `PROJECT_NOT_ELIGIBLE`~~ : **supprimés v1.2**. |
| 4 | **Cahier des charges à la création** | Le formulaire de création propose de déposer le cahier des charges (PDF / DOCX). Il devient la version 1, en brouillon ou déjà validée par le client ; le délai est calculé à partir des dates du projet. L'onglet s'appelle désormais « Cahier des charges ». |
| 5 | **Le responsable se voit tout de suite** | Bandeau doré « Vous êtes responsable » et contour sur ses cartes de projet (cartes, kanban, liste), projets en tête de liste, filtre « Je suis responsable », bandeau dans l'en-tête du projet, et notification au moment où il est désigné. |
| 6 | **Onglet Retours** | Nouvel onglet du projet : retours texte et photos (6 max) sur l'application ou sur un livrable précis, notés par l'équipe ou transmis par le client (canal + personne). Le responsable est notifié. Statuts, conversion en tâches et « nécessite une nouvelle version » (CDC-05, CDC-06) passent dans cet onglet. |

**Droits :** tout membre du projet et l'admin publient un retour ; l'admin et le responsable le traitent (prendre en compte, refuser, convertir en tâches, marquer traité).

**Migration des données (v1.1 → v1.2) :** `migrateV2toV3` remplace la référence au client par son nom, ramène les types à mobile ou web, supprime département, « grand projet », prix, devise et montants, et rattache les anciens retours à l'application.

**Prototype :** les photos sont redimensionnées (1280 px, JPEG) et stockées dans le navigateur. Le backend les stockera dans le stockage objet (Q2).

---

## Changements v1.1 — résumé

| # | Changement | En bref |
|---|---|---|
| 1 | **Deux rôles globaux : `ADMIN` et `DEV`** | `DIRECTION` devient `ADMIN`. `PM`, `MEMBER` et `PRODUCTION` deviennent `DEV`. Le rôle global « chef de projet » disparaît. |
| 2 | **Responsable du projet** | Rôle *dans* un projet (`HEAD`), optionnel, un seul par projet, désigné par l'admin. Il reprend tous les droits de l'ancien « PM / LEAD » sur son projet. |
| 3 | **Navigation selon le rôle** | Admin : Tableau de bord · Projets · Serveurs · Administration · Profil. Dev : Accueil · Projets · Mes tâches · Agenda · Profil. Les notifications passent sur une cloche dans l'en-tête. |
| 4 | **Projets en Liste ou Kanban** | Choix mémorisé par utilisateur. Kanban à 5 colonnes de statut (archivés masqués). Seul l'admin peut glisser une carte. |
| 5 | **Fusion Tâches + Sprints** | Un seul onglet `Sprints` sur deux niveaux : tableau des sprints, puis kanban des tâches d'un sprint. Les vues Liste et Calendrier des tâches du projet sont supprimées. |
| 6 | **Agenda des devs** | Nouvel écran réservé au rôle DEV, en vue mois ou semaine : tâches assignées, et pour les projets dont le dev est responsable, échéances des livrables et fins de sprint. |
| 7 | **Serveurs réservés à l'admin** | Serveurs, domaines, SSL, abonnements et échéances : admin seul. L'onglet Serveurs de la fiche projet est supprimé. |
| 8 | **Livrables : « Copier le lien »** | Un lien par version de livrable. L'ouvrir lance directement le téléchargement. Plus de mot de passe, plus de page intermédiaire, plus de limite de téléchargements. Les robots d'aperçu reçoivent une page Open Graph. |
| 9 | **Suppression du brainstorming** | Post-its, votes et conversion en tâche supprimés. Les notes de projet restent. |

---

## 0. Hypothèses — mises à jour v1.1

| # | V1 | v1.1 |
|---|---|---|
| Q5 | Comptes créés par la Direction | Comptes créés **par l'admin** : invitation par lien ou mot de passe temporaire, changement forcé à la première connexion. |
| Q7 | Mur de post-its (P0), canevas (P2) | ~~Mur de post-its, canevas~~ — **supprimé v1.1** |

## 1. Rôles (§3.1 et §3.2 réécrits) — `v1.1`

### 1.1 Rôles globaux

| Rôle | Code | Ce qu'il fait |
|---|---|---|
| Admin | `ADMIN` | Voit et gère tout : projets, comptes, serveurs, coffre-fort, journal d'audit. Seul à créer et archiver un projet, à changer son statut et à désigner son responsable. |
| Dev | `DEV` | Voit uniquement les projets dont il est membre. Ses droits dépendent de son rôle dans chaque projet. |

### 1.2 Rôle dans un projet

- `ProjectMembership.project_role` : **`HEAD`** (responsable) ou **`CONTRIBUTOR`**. `HEAD` remplace `LEAD`.
- **Un seul `HEAD` par projet** (contrainte unique conditionnelle). Désigner un nouveau responsable rétrograde l'ancien en `CONTRIBUTOR`.
- Le responsable est optionnel. Un projet **sans responsable** est géré directement par l'admin.
- Le responsable peut être un `DEV` ou un `ADMIN`.
- `Project.lead` devient `Project.head` (nullable) et reste cohérent avec la membership. *Prototype : la membership `HEAD` est la seule source de vérité, lue par un helper `projectHead(project)`.*

### 1.3 Migration des données

| Avant | Après |
|---|---|
| `DIRECTION` | `ADMIN` |
| `PM`, `MEMBER` | `DEV` |
| `PRODUCTION` | `DEV` **désactivé**, à vérifier par l'admin |
| `lead` du projet (1er `LEAD`) | `HEAD` |
| autres `LEAD` | `CONTRIBUTOR` |

**Comptes `PRODUCTION` migrés, à vérifier :**

| Nom | E-mail | Résultat |
|---|---|---|
| Riad Saidi | riad@zidny.dz | `DEV`, compte désactivé |

*Prototype : la migration s'applique aussi aux données déjà enregistrées dans un navigateur (clé `zidny-state-v1` → `zidny-state-v2`) et ajoute une entrée `ROLE_MIGRATION` au journal d'audit.*

## 2. Matrice des droits (§3.3 réécrite) — `v1.1`

✅ autorisé · 👁 lecture · ⛔ interdit. « Son projet » = le projet dont il est responsable ou membre.

| Action | Admin | Responsable du projet | Dev membre du projet |
|---|---|---|---|
| Voir la liste des projets | ✅ tous | ✅ les siens | ✅ les siens |
| Créer / archiver un projet | ✅ | ⛔ | ⛔ |
| Changer le statut d'un projet (kanban, fiche) | ✅ | ⛔ | ⛔ |
| Désigner / changer / retirer le responsable | ✅ | ⛔ | ⛔ |
| Gérer l'équipe (ajouter / retirer des membres) | ✅ | ✅ | ⛔ |
| Créer / modifier / clôturer les sprints | ✅ | ✅ | 👁 |
| Créer / modifier les jalons | ✅ | ✅ | 👁 |
| Planifier les tâches (backlog ↔ sprints) | ✅ | ✅ | ⛔ |
| Créer / modifier / supprimer / assigner une tâche | ✅ | ✅ | ✅ sous-tâches de ses tâches |
| Mettre à jour statut / avancement d'une tâche | ✅ | ✅ | ✅ tâches assignées |
| Saisir du temps | ✅ | ✅ | ✅ sur ses tâches |
| Versions de CDC et prix | ✅ | ✅ | 👁 **sans prix** |
| Retours / demandes du client | ✅ | ✅ | 👁 + commenter |
| Livrables : voir et déposer | ✅ | ✅ | ✅ |
| Livrables : fixer l'échéance (`due_date`) | ✅ | ✅ | ⛔ |
| Livrables : copier / partager le lien, révoquer | ✅ | ✅ | ⛔ |
| Serveurs, domaines, SSL, abonnements, échéances | ✅ | ⛔ | ⛔ |
| Affecter des serveurs à un projet | ✅ | ⛔ | ⛔ |
| Coffre-fort : voir la liste (métadonnées) | ✅ tout | ✅ entrées du projet | ✅ entrées partagées avec lui |
| Coffre-fort : révéler un secret | ✅ | ✅ | ✅ si accès explicite |
| Coffre-fort : créer / modifier / partager | ✅ | ✅ | ⛔ |
| Coffre-fort : champ « serveur lié » | ✅ | ⛔ masqué | ⛔ masqué |
| Journal d'audit | ✅ | 👁 accès au coffre de son projet | ⛔ |
| Notes de projet | ✅ (y compris les notes ciblées) | ✅ | ✅ |
| Réunions (comptes rendus) | ✅ | ✅ | ✅ |
| Tableau de bord admin (DSH-01) | ✅ | ⛔ | ⛔ |
| Agenda | ⛔ | ✅ | ✅ |
| Mes tâches | ⛔ | ✅ | ✅ |
| Gérer les comptes et invitations | ✅ | ⛔ | ⛔ |

**Prix masqués :** pour un dev qui n'est pas responsable du projet, `proposed_price`, `currency` et les écarts de prix sont omis par le serializer. *Prototype : retirés par la fonction de sérialisation, pas seulement masqués à l'écran.*

## 3. Navigation (`v1.1`)

| Rôle | Onglets |
|---|---|
| Admin | Tableau de bord · Projets · Serveurs · Administration · Profil |
| Dev | Accueil · Projets · Mes tâches · Agenda · Profil |

- **Notifications :** icône cloche avec badge dans l'en-tête, pour tous les rôles. L'écran Notifications (M-49) est conservé et s'ouvre depuis la cloche. Chaque notification a une audience : tous, admins, ou une liste d'utilisateurs.
- **Accueil dev :** DSH-03, plus un bloc « Mes projets » (avancement, sprint actif, prochain jalon) quand le dev est responsable d'au moins un projet.
- **Tableau de bord admin :** DSH-01, inchangé.
- **Accès direct refusé :** `/tasks` et `/agenda` renvoient l'admin vers son tableau de bord. `/servers` et `/admin` sont refusés au dev.

| Exigence | Statut |
|---|---|
| DSH-01 Direction | conservée, renommée « Admin » — `v1.1` |
| ~~DSH-02 Chef de projet~~ | **supprimé v1.1** (remplacé par le bloc « Mes projets » de l'accueil dev) |
| DSH-03 Membre | conservée pour tous les devs — `v1.1` |
| ~~DSH-04 Production~~ | **supprimé v1.1** |

## 4. Modules fonctionnels — exigences modifiées

### 4.1 Projets

- **PRJ-01 `v1.1`** — seul l'admin crée un projet. Le responsable est optionnel à la création.
- **PRJ-02 `v1.1`** — seul l'admin effectue les transitions de statut. `ARCHIVED` reste accessible depuis tout statut, depuis la fiche projet.
- **PRJ-05 `v1.1`** — liste des projets (M-10) avec un sélecteur `Liste` / `Kanban`, mémorisé par utilisateur.
  - Kanban : une colonne par statut (`DRAFT`, `ACTIVE`, `ON_HOLD`, `DELIVERED`, `CLOSED`). Les projets archivés sont masqués.
  - Glisser une carte (admin seul) appelle `POST /projects/{id}/transition`. Passer en `ON_HOLD` ouvre la saisie du motif. Une transition invalide remet la carte à sa place et affiche le message d'erreur.
  - Les devs voient leurs projets dans les deux vues, en lecture seule, sans glisser.
- **PRJ-06 `v1.1`** — l'admin désigne le responsable. Le responsable ajoute et retire les membres.

### 4.2 Tâches et 4.3 Jalons / sprints — fusion `v1.1`

L'onglet **`Sprints`** de la fiche projet remplace les onglets `Tâches` et `Jalons/Sprints`.

| Niveau | Route | Contenu |
|---|---|---|
| 1 — Tableau des sprints | `/projects/[id]/sprints` | Kanban horizontal : `Backlog` d'abord, puis les sprints par date. Chaque colonne montre le nom, les dates, l'objectif, l'avancement et le nombre de tâches. Le sprint actif est mis en évidence, les sprints clôturés sont grisés et refusent les dépôts. Filtre par jalon. Le responsable ou l'admin glisse les tâches d'une colonne à l'autre, et crée, modifie, démarre et clôture les sprints. Les jalons se gèrent dans une modale « Jalons ». |
| 2 — Sprint ouvert | `/projects/[id]/sprints/[sprintId]` | Kanban des tâches du sprint par statut (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `BLOCKED`), sous-tâches dépliables, glisser selon TSK-07. |

- **TSK-07 `v1.1`** — dans la fiche projet, ~~vue liste~~ et ~~vue calendrier~~ sont **supprimées v1.1**. Le kanban par statut est conservé au niveau 2. L'écran transverse « Mes tâches » (TSK-08) reste inchangé, en liste et en kanban.
- **MIL-02, MIL-04, MIL-05** : inchangés, réalisés au niveau 1.
- **MIL-06** : la frise des jalons reste sur l'Aperçu du projet.
- **TSK-06** (calcul de l'avancement) : inchangé.
- Écrans **supprimés v1.1** : ~~M-14~~, ~~M-15~~, ~~M-16~~, ~~M-22~~ (liste, kanban et calendrier du projet, écran jalons/sprints). Ils sont remplacés par les deux niveaux ci-dessus.

### 4.5 Livrables `v1.1`

- **DLV-02 `v1.1`** — nouveau champ `Deliverable.due_date` (date, nullable, indexé), modifiable par l'admin et le responsable.
- **DLV-05 `v1.1`** — l'action principale d'un livrable devient **`Copier le lien`**. Elle crée le lien de la **version courante**, ou réutilise le lien actif, le copie dans le presse-papiers et affiche le toast « Lien copié ». Un appui long ouvre la feuille de partage native.
  - Un lien correspond à **une** `DeliverableVersion` (`ShareLinkItem` supprimé). Les anciens liens qui regroupaient plusieurs fichiers sont éclatés en un lien par livrable, sur sa version courante.
  - Conservés : expiration (14 jours par défaut, réglable, 90 jours max), révocation, journal d'accès, notification au créateur.
  - **Supprimés v1.1** : ~~mot de passe~~, ~~`/s/<token>/unlock`~~, ~~`max_downloads`~~, ~~liens multi-fichiers~~.
- **DLV-06 `v1.1`** — ouvrir le lien lance **directement le téléchargement**. La page intermédiaire W-01 est **supprimée v1.1**.
  - `GET /s/<token>` → `302` vers une URL présignée courte, avec `Content-Disposition: attachment; filename="<nom d'origine>"`.
  - Lien expiré, révoqué ou inexistant → la même petite page HTML « Lien indisponible » dans tous les cas.
  - **Robots d'aperçu** (WhatsApp, facebookexternalhit, TelegramBot, Slackbot, Twitterbot, LinkedInBot, Discordbot…) détectés par leur user agent → page HTML minimale avec balises Open Graph (nom du fichier, taille, « Zidny »), **sans** redirection, **sans** compter de téléchargement et **sans** notification.
- **DLV-07** : inchangé (liste des liens actifs, révocation, compteur).
- §5.2 « Liens publics » : ~~mot de passe haché (Argon2)~~ **supprimé v1.1**. Restent un token aléatoire de 32 octets et une expiration obligatoire.

### 4.6 Serveurs et accès — `v1.1`

- **INF-01 à INF-07** : **admin seul**. Pour tout autre utilisateur, les endpoints `infra` et `/expiries` renvoient `403`. L'admin choisit le ou les serveurs d'un projet, depuis la fiche serveur ou depuis l'Aperçu du projet (bloc visible par l'admin seul).
- **INF-02 et INF-06 `v1.1`** — les alertes de sauvegarde en retard et d'expiration sont envoyées **uniquement aux admins**. Le responsable ne les reçoit plus.
- Écran ~~M-35~~ (onglet Serveurs de la fiche projet) **supprimé v1.1**. M-36, M-37, M-38 et M-39 sont regroupés dans l'onglet admin `Serveurs`, avec les Échéances en segment.

### 4.7 Coffre-fort — `v1.1`

- **VLT-03 `v1.1`** — « LEAD » devient « responsable ». Le reste est inchangé.
- **VLT-01 `v1.1`** — le champ `server` d'une entrée n'est exposé qu'à l'admin.

### 4.8 Collaboration — `v1.1`

- **COL-01, COL-02** : notes de projet, conservées.
- ~~COL-03 Tableau de brainstorming~~ · ~~COL-04 Convertir un post-it en tâche~~ · ~~COL-05 Mise à jour quasi temps réel du tableau~~ · ~~COL-06 Canevas libre~~ — **supprimés v1.1**.
- Supprimés aussi : les modèles `Board`, `BoardColumn`, `BoardCard`, `BoardVote` (les tables sont supprimées), `Task.source_board_card`, les endpoints `/board/*`, l'écran M-48, l'onglet `Brainstorm`, les clés i18n, et la création d'un Board à la création d'un projet.

### 4.9 Notifications — `v1.1`

- **NTF-02 `v1.1`** — nouvel événement : « livrable dû demain », envoyé au responsable. Il est généré par la tâche Celery `due_reminders`. *Prototype : généré au chargement de l'application, une fois par jour.*
- Les alertes d'expiration, de sauvegarde en retard et de révélation bloquée vont aux admins.

### 4.12 Agenda (nouveau) — `v1.1`

- Écran **réservé au rôle DEV**, avec une vue mois, une vue semaine, et la liste des éléments du jour sélectionné.
- **Contenu :**
  - pour tous les devs : les échéances de **leurs** tâches et sous-tâches assignées ;
  - pour les projets dont le dev est **responsable**, en plus : les dates d'échéance des livrables et la date de fin de chaque sprint.
- Chaque type d'élément a sa propre pastille et sa propre icône (tâche, livrable, fin de sprint). Un appui ouvre l'élément.
- Endpoint `GET /me/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD`. Il renvoie `[{type: "TASK" | "DELIVERABLE" | "SPRINT_END", id, title, date, project: {id, code, name}, status}]`, la portée étant appliquée côté serveur. *Prototype : fonction `getMyAgenda(state, user, from, to)` avec la même signature et la même forme de réponse.*

## 5. Critères d'acceptation — ajouts v1.1

11. Un dev reçoit `403` sur tous les endpoints `infra` et `/expiries` (vérifié par appel direct).
12. Un dev qui n'est pas responsable ne voit ni échéance de livrable ni fin de sprint dans `/me/agenda`.
13. Un projet ne peut pas avoir deux `HEAD`.
14. `/s/<token>` redirige avec `Content-Disposition: attachment`.
15. Une requête avec le user agent WhatsApp ne compte pas de téléchargement et ne déclenche pas de notification.
16. Seul l'admin peut déplacer une carte du kanban des projets. Une transition invalide est refusée et la carte reprend sa place.

~~Critère 5 (partie « mot de passe »)~~ : il n'y a plus de mot de passe sur les liens.

## 6. Équivalences prototype ↔ backend

| Backend (CDC) | Prototype (ce dépôt) |
|---|---|
| Migrations de schéma et de données | `lib/migrations.ts`, fonction pure `migrateV1toV2` appliquée à l'état enregistré dans le navigateur |
| Endpoints `infra`, `/expiries` (`403`) | Sélecteurs `lib/access.ts` qui renvoient `{ ok: false, status: 403 }` aux non-admins |
| `GET /me/agenda` | `getMyAgenda(state, user, from, to)` |
| `POST /projects/{id}/transition` | Action `transitionProject` du store (vérifie rôle + transition) |
| `GET /s/<token>` + URL présignée | Route `app/s/[token]/route.ts` (détection des robots, `302`) puis page de téléchargement qui produit un fichier factice au nom d'origine |
| Celery `due_reminders` | Rappels générés au chargement, une fois par jour |
| Tests pytest | Tests `vitest` sur les fonctions pures (`npm test`) |

## 7. Limites connues du prototype

- **Sur le lien `/s`, le serveur n'a pas accès aux données**, qui vivent dans le navigateur. L'aperçu Open Graph affiche donc « Fichier partagé · Zidny », sans nom ni taille. Le téléchargement produit un fichier factice qui porte le nom d'origine, et il ne fonctionne que dans le navigateur qui contient les données.
- **Critère 14 vérifié en partie.** Les tests confirment que `/s/<token>` renvoie un `302` à un humain et une page Open Graph sans redirection à WhatsApp. L'en-tête `Content-Disposition: attachment` n'existe pas ici : le téléchargement est déclenché par la page `/s/<token>/get`, avec le nom d'origine du fichier. L'en-tête devra être testé sur le backend Django.
- **Rien n'est vérifié côté serveur.** Les `403` et les restrictions de portée sont appliqués par la couche d'accès du client. Le vrai contrôle devra se faire dans le backend Django.
- **Indisponibles ici :** `make openapi`, `schema-reviewer`, `cdc-guardian`, `seed_demo` (remplacé par le jeu de démonstration de `lib/mock-data.ts`) et les commits (pas de dépôt git).

## 8. Points tranchés pendant la conception

1. Routes en `/projects/...` (pluriel, comme l'existant) plutôt que `/project/...`.
2. Le changement de statut d'un projet depuis la fiche est réservé à l'admin, comme le kanban.
3. Seul l'admin peut retirer le responsable. Le responsable gère les autres membres.
4. Un admin responsable d'un projet gère ses tâches par l'onglet Sprints. Il n'a ni « Mes tâches » ni Agenda.
5. Les sprints clôturés restent visibles, grisés, au niveau 1, mais refusent les dépôts.
6. Les jalons se gèrent dans une modale « Jalons » du niveau 1.
7. L'onglet **Administration** (comptes, invitations, audit) est conservé pour l'admin, en plus des 4 onglets du point 3.
8. Les comptes `PRODUCTION` migrés sont désactivés.
9. Un dev membre dépose des livrables mais ne peut ni partager de lien ni fixer d'échéance. Il ne voit pas les prix.
