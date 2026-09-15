// Ces fonctions ont déménagé dans lib/commun/planification.js à la revision 55,
// quand les rappels de l'Ordre du jour en ont eu besoin à leur tour. Elles
// n'avaient rien de propre au Défi Strava.
//
// Ce fichier reste comme passerelle : trois routes du Défi Strava importent
// encore d'ici, et les faire toutes pointer ailleurs dans la même livraison
// aurait multiplié les occasions de se tromper sans rien améliorer.
//
// Une seule définition de « quelle heure est-il ici », partagée par les deux
// apps — c'est ce qui compte.
export {
  heureActuelleEst,
  dateDuJourEst,
  jourDuMoisEst,
  jourDeSemaineEst,
  LUNDI,
} from '../commun/planification';
