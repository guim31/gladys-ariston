# Ariston NET

Pilotez depuis Gladys les **chaudières, pompes à chaleur et chauffe-eau du groupe Ariston**
(Ariston, Chaffoteaux, Elco) déjà connectés à l'appli **Ariston NET** ou **Chaffoteaux** : températures,
consignes, modes, eau chaude, défauts et, si l'appareil la mesure, consommation de gaz et d'électricité.

L'intégration passe par le cloud Ariston NET (remotethermo), comme les applis officielles : il faut un
compte et une connexion internet. Elle n'est pas affiliée à Ariston Group.

> Développée sans le matériel : vos retours sont les bienvenus (forum Gladys ou issue GitHub).

## Prérequis

- Gladys 5.1.0 ou plus récent.
- Un appareil déjà installé et visible dans l'appli Ariston NET (ou Chaffoteaux), avec le compte
  (e-mail et mot de passe) de cette appli.
- Appareils visés :
  - chaudières et pompes à chaleur avec thermostat connecté (système « Galevo ») : Genus One, Alteas One,
    Nimbus, Chaffoteaux INOA, Thision S… ;
  - chauffe-eau Velis Evo, Velis Lux / Lux 2, Lydos (Wi-Fi), Lydos Hybrid, Nuos Split, Andris 2.

## Configuration

Dans **Intégrations → Ariston NET → Configuration** :

| Champ                          | Rôle                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| E-mail, Mot de passe           | Le compte de l'appli Ariston NET. Le mot de passe est un secret : Gladys ne le réaffiche jamais. |
| Langue des noms                | Langue des noms d'appareils et de fonctionnalités (français par défaut), fixée à leur ajout.     |
| Intervalle de rafraîchissement | 3, 5 (par défaut), 10, 15 ou 30 minutes.                                                         |
| Lire les défauts               | Codes de défaut, lus toutes les 30 minutes (activé par défaut).                                  |
| Lire la consommation           | Gaz et électricité du mois dernier, lus toutes les 6 heures (désactivé par défaut).              |

Le bouton **Tester la connexion** se reconnecte, liste les appareils du compte (et ceux non pris en charge)
et met à jour l'onglet **Découverte**. Ajoutez ensuite les appareils voulus depuis cet onglet.

## Appareils

### Chaudière ou pompe à chaleur

Un appareil par installation, avec ce que l'installation signale :

- **Mode de l'installation** (sélection, pilotable) : été (eau chaude seule), hiver, chauffage seul,
  rafraîchissement, arrêt, vacances… seulement les modes que l'installation propose ;
- **Consigne eau chaude** (pilotable, dans les bornes de l'appareil) et **Température eau chaude** si une
  sonde de ballon est présente ;
- **Brûleur allumé**, **Pompe à chaleur en marche**, **Pression du circuit** (bar),
  **Température extérieure**, **Température de départ** ;
- **Défauts** : « Aucun défaut » ou la liste des codes avec leur description ;
- consommation du **mois dernier** (kWh) : gaz et électricité, chauffage et eau chaude, si l'option est
  active et que l'appareil la mesure.

### Zones de chauffage

Un appareil par zone (« Chaudière – Zone 1 », ou le nom donné dans l'appli) :

- **Température** mesurée dans la pièce ;
- **Consigne** (pilotable) : la consigne de confort, arrondie au pas de l'appareil (souvent 0,5 °C) et
  refusée hors de ses bornes ;
- **Mode** (pilotable) : Arrêt, Chauffage (manuel), Rafraîchissement sur une PAC réversible, Auto
  (= le programme horaire de l'appli Ariston) ;
- **Demande de chauffe** : en chauffe, en rafraîchissement ou au repos.

### Chauffe-eau

- **Marche** (pilotable) ;
- **Température de l'eau** ;
- **Consigne** (pilotable, de 40 °C au maximum réglé dans l'appareil) — sauf sur le Velis Evo, qui se règle
  en nombre de douches dans l'appli ;
- **Mode** (pilotable), traduit dans les modes de Gladys : iMemory = Auto, Green = Éco, Programme,
  Boost, Manuel ; sur le Velis Evo, le mode Nuit (heures creuses) apparaît comme Éco ; sur le Nuos Split,
  Comfort = Manuel et Fast = Boost ;
- **Chauffe en cours** et **Douches disponibles** quand le modèle les fournit ;
- **Défauts**.

## Widget

Le widget **Ariston** du tableau de bord affiche un appareil choisi dans ses réglages :

- une zone : température, consigne, mode, demande de chauffe, mode de l'installation, défauts ; boutons
  **Baisser** / **Monter** (d'un pas) et **Programme** / **Manuel** (le mode en cours porte une coche) ;
- la chaudière : eau chaude, consigne, pression, brûleur, défauts ; boutons de consigne eau chaude ;
- un chauffe-eau : température, consigne, douches, mode, chauffe, défauts ; boutons de consigne, **Boost**
  (si le modèle l'a) et marche/arrêt.

## Scènes

### Déclencheur

**Défaut Ariston détecté** : un appareil signale un code de défaut qu'il ne signalait pas à la lecture
précédente. Filtrez par appareil et par code ; les actions de la scène disposent de l'appareil, du code, de
la description et de l'indication « défaut bloquant ». Un défaut déjà présent au démarrage de l'intégration
ne déclenche rien (pas d'alerte à chaque redémarrage).

Les consignes et modes se pilotent avec l'action standard **Contrôler un appareil** de Gladys.

### Idées de scènes

- **Alerte panne** : « Défaut Ariston détecté » → envoyer un message « Chaudière en défaut {{code}} :
  {{description}} ».
- **Départ en vacances** : quand le dernier occupant quitte la maison → mode de l'installation sur
  Vacances et chauffe-eau en Éco.
- **Heures creuses** : à 22 h 30 → chauffe-eau en Boost ; à 6 h → retour en Auto.
- **Fenêtre ouverte** : capteur d'ouverture ouvert plus de 5 minutes → zone en Arrêt ; refermée → Auto.

## Rafraîchissement et limites du service

Ariston NET n'a pas d'API publique documentée : l'intégration utilise celle des applis, comme
l'intégration Home Assistant. Depuis 2024, le cloud répond « Requests are blocked for N seconds » (HTTP 429)
aux comptes qui interrogent trop souvent, et le support Ariston indique ne pas prendre en charge l'usage de
son API par des logiciels tiers. L'intégration reste donc sobre :

- une seule requête par appareil et par rafraîchissement (zones et eau chaude comprises), toutes les
  5 minutes par défaut, jamais plus souvent que toutes les 3 minutes ;
- défauts toutes les 30 minutes, réglages des chauffe-eau et consommation toutes les 6 heures ;
- une requête à la fois, au moins une seconde d'écart ;
- en cas de blocage, plus aucune requête jusqu'à la fin du délai annoncé par Ariston ;
- seuls les appareils ajoutés à Gladys sont lus ;
- le jeton de connexion est conservé dans `/data` pour ne pas se reconnecter à chaque redémarrage.

N'utilisez pas en même temps une autre domotique sur le même compte : les requêtes s'additionnent.

## Dépannage

- **« Ariston NET refuse l'e-mail ou le mot de passe »** : vérifiez-les dans l'appli Ariston NET ; un mot de
  passe changé dans l'appli doit l'être aussi dans Gladys.
- **« Ariston NET limite les requêtes »** : l'intégration attend et reprend seule. Si cela revient souvent,
  augmentez l'intervalle de rafraîchissement ou arrêtez les autres outils branchés sur le même compte.
- **Un appareil n'apparaît pas** : cliquez sur **Tester la connexion** ; le message liste aussi les appareils
  non pris en charge.
- **Une valeur reste vide** : l'appareil ne la fournit pas au cloud, ou n'a pas encore été lu (attendez un
  rafraîchissement).
- **Une commande revient en arrière** : le cloud confirme parfois avant l'appareil ; la lecture suivante
  affiche la valeur réelle.
- Journaux détaillés : variable d'environnement `LOG_LEVEL=debug` sur le conteneur.

## Limites

- Développée et testée sans le matériel ni un compte réel : comportement vérifié sur des réponses
  reconstituées d'après la bibliothèque de référence.
- Les pompes à chaleur Elco / Remocon du système « BSB » ne sont pas encore prises en charge (elles sont
  signalées comme telles).
- Pas de programmation horaire depuis Gladys : le programme reste celui de l'appli ; le mode Auto le suit.
- Pas de réglage du nombre de douches du Velis Evo, ni des réglages avancés (anti-légionelle, mode nuit du
  Lydos Hybrid, courbe de chauffe).
- La consommation est celle du mois dernier telle que le cloud la publie, pas un compteur en temps réel.
- Dépend du cloud Ariston NET : sans internet ou en cas de panne du service, plus de lecture ni de commande.
