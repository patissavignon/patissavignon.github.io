# Trompe l'Œil Event · Carte de commande professionnelle

Site de commande pour les boulangeries, restaurants et traiteurs :

- **`index.html`** : la carte que vous partagez à vos clients (trompe-l'œil avec prix dégressif, cupcakes floraux, panier, envoi de la commande).
- **`admin.html`** : votre espace propriétaire, protégé par un mot de passe (commandes, produits, prix, photos).

Le site est fait de fichiers simples (HTML, CSS, JavaScript), sans installation ni compilation. Il est hébergé gratuitement sur **GitHub Pages**, et les données (produits, prix, commandes, photos) sont dans **Supabase**.

---

## Organisation des fichiers

```
trompe-loeil-event/
├── index.html            Carte client
├── admin.html            Espace propriétaire (connexion + tableau de bord)
├── css/
│   ├── style.css         Couleurs, polices, mise en page de la carte
│   └── admin.css         Mise en page du tableau de bord
├── js/
│   ├── config.js         ← LE SEUL fichier à remplir (adresse + clé Supabase)
│   ├── common.js         Outils partagés (connexion, calcul des prix…)
│   ├── carte.js          Fonctionnement de la carte client
│   └── admin.js          Fonctionnement du tableau de bord
├── img/favicon.svg       Petite icône de l'onglet
├── supabase/schema.sql   Base de données à coller dans Supabase
└── .nojekyll             Fichier technique pour GitHub Pages (ne pas supprimer)
```

**Mode démo :** tant que `js/config.js` est vide, double-cliquez sur `index.html` pour tester la carte sur votre ordinateur. Aucune commande n'est envoyée.

---

## Mise en ligne : 3 étapes (environ 20 minutes)

### Étape 1 · Supabase (la base de données)

1. Allez sur **supabase.com**, puis connectez-vous.
2. Cliquez sur **New project**. Nom : `trompe-loeil-event`, région : **Paris (eu-west-3)**. Choisissez un mot de passe de base de données et notez-le.
   - Le plan gratuit accepte **2 projets actifs**. Si Supabase refuse, mettez en pause un ancien projet (Settings › General › Pause project).
3. Attendez environ 2 minutes que le projet soit prêt.
4. Ouvrez le fichier `supabase/schema.sql` avec le Bloc-notes et **remplacez `votre-email@exemple.com`** par votre adresse email.
5. Dans Supabase, ouvrez **SQL Editor** puis **New query**. Collez **tout** le contenu du fichier et cliquez sur **Run**. Le message `Success` doit s'afficher.
6. Créez votre compte propriétaire : **Authentication › Users › Add user › Create new user**.
   - Email : **le même** qu'à l'étape 4.
   - Mot de passe : votre choix.
   - Cochez **Auto Confirm User**.
7. Fermez les inscriptions publiques : **Authentication › Sign In / Providers › Email**, puis **désactivez « Allow new users to sign up »**.
8. Récupérez vos 2 valeurs avec le bouton **Connect** (ou Project Settings › API Keys) :
   - **Project URL**, qui ressemble à `https://abcdefgh.supabase.co` ;
   - **Publishable key**, qui commence par `sb_publishable_…` (ou bien l'ancienne clé « anon public »).
9. Collez-les dans `js/config.js` :

```js
window.TLE_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxx'
};
```

> ⚠️ N'utilisez jamais la clé **secret** ou **service_role** : elle donne tous les droits.

### Étape 2 · GitHub (l'hébergement)

1. Sur **github.com**, cliquez sur **+** puis **New repository**.
   - Nom : `trompe-loeil-event`.
   - Visibilité : **Public**. C'est obligatoire pour l'hébergement gratuit, et c'est sans risque : seule la clé publique est dans le code.
2. Cliquez sur **uploading an existing file**, puis glissez **tout le contenu** du dossier (les dossiers `css`, `js`, `img`, `supabase`, les fichiers `index.html`, `admin.html`, `README.md`, `.nojekyll`). Cliquez ensuite sur **Commit changes**.
   - Windows masque parfois `.nojekyll`. S'il manque, créez-le sur GitHub avec **Add file › Create new file**, nommez-le `.nojekyll` et laissez-le vide.
3. Allez dans **Settings › Pages**. Dans « Build and deployment », choisissez **Deploy from a branch**, puis **main** et **/ (root)**, et cliquez sur **Save**.
4. Après 1 à 2 minutes, votre site est en ligne :
   - Carte client : `https://VOTRE-NOM.github.io/trompe-loeil-event/`
   - Espace propriétaire : `https://VOTRE-NOM.github.io/trompe-loeil-event/admin.html`

### Étape 3 · Derniers réglages Supabase

Dans **Authentication › URL Configuration**, mettez dans **Site URL** l'adresse de votre carte. Ajoutez aussi l'adresse de `admin.html` dans **Redirect URLs**. Sans ce réglage, le lien « Mot de passe oublié » ne marche pas.

---

## Vérifier que tout fonctionne

1. Ouvrez la carte : les produits s'affichent et le bandeau « Mode démo » a disparu.
2. Passez une petite commande de test.
3. Ouvrez `admin.html`, puis connectez-vous : la commande apparaît dans **Commandes**.
4. Dans **Photos**, ajoutez une photo trompe-l'œil, puis rechargez la carte : la photo apparaît sous l'en-tête.
5. Supprimez la commande de test.

## Utiliser le tableau de bord

| Onglet | Ce que vous pouvez faire |
|---|---|
| **Commandes** | Voir les commandes (établissement, téléphone cliquable, date souhaitée, détail), changer le statut (Nouvelle › Confirmée › Livrée ou Annulée), ajouter une note interne, supprimer. Actualisation automatique chaque minute. |
| **Produits** | Ajouter un goût, le renommer, changer sa couleur ou son ordre, ajouter ou retirer sa photo. Pour masquer un goût sans le supprimer, décochez « Visible ». |
| **Prix & offre** | Paliers du prix dégressif (vous pouvez en ajouter), prix et minimum des cupcakes, offre bouquet (activer ou désactiver, titre, taille, prix), limites du bouquet sur mesure, textes de la carte. |
| **Photos** | Photo sous le titre trompe-l'œil et photo sous « Cupcakes floraux ». Vous pouvez les ajouter, les changer ou les retirer. |

Les photos sont réduites automatiquement avant l'envoi : une photo prise au téléphone convient très bien.

## Sécurité

- Les prix sont **recalculés par la base de données** à chaque commande (fonction `place_order`). Un client ne peut pas modifier les prix depuis son navigateur.
- Les clients peuvent seulement **lire la carte** et **envoyer une commande**. Ils ne voient jamais les commandes des autres.
- Seuls les emails listés dans la table `admins` peuvent modifier quoi que ce soit. Pour ajouter une personne, ajoutez son email dans cette table (Table Editor › admins) et créez-lui un compte dans Authentication.

## Pourquoi Supabase plutôt que Firebase ?

Les deux conviennent. Supabase est plus adapté ici pour trois raisons :

- Les commandes, les produits et les prix forment des **tableaux reliés entre eux**. C'est exactement ce que fait Supabase, avec une base PostgreSQL.
- Vous pouvez **voir et modifier vos commandes comme dans un tableur** (Table Editor), sans rien coder.
- Le **calcul sécurisé des prix** tient dans une fonction de la base. Avec Firebase, il faudrait des « Cloud Functions », qui demandent le forfait payant Blaze.

## Modifier le site plus tard

- **Prix, produits, photos, textes :** depuis `admin.html`, rien à toucher dans le code.
- **Couleurs et polices :** début du fichier `css/style.css` (section `:root`).
- Après une modification de fichier, renvoyez-le sur GitHub (glisser-déposer au même endroit). Le site se met à jour en 1 à 2 minutes.
