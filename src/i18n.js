// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations.
//
//   - NAMES   : feature and device names, one table per language, picked with
//               the `language` of the configuration (a device integration
//               does not receive the user's language: the names are fixed at
//               creation in the language configured then);
//   - LABELS  : option labels (plant modes, thermostat and water heater modes);
//   - TEXT    : fixed multi-language texts (statuses, widget);
//   - MESSAGES: texts built from a value.
//
// test/i18n.test.js checks that every entry carries the four languages.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** Feature and device names, by language. */
export const NAMES = {
  en: {
    plant_mode: 'System mode',
    pressure: 'Heating pressure',
    flame: 'Burner on',
    heat_pump: 'Heat pump running',
    outside_temperature: 'Outside temperature',
    flow_temperature: 'Flow temperature',
    dhw_temperature: 'Hot water temperature',
    dhw_target: 'Hot water setpoint',
    faults: 'Faults',
    energy_heating_gas: 'Heating gas (last month)',
    energy_heating_electricity: 'Heating electricity (last month)',
    energy_dhw_gas: 'Hot water gas (last month)',
    energy_dhw_electricity: 'Hot water electricity (last month)',
    temperature: 'Temperature',
    target: 'Setpoint',
    mode: 'Mode',
    heat_request: 'Heat demand',
    power: 'Power',
    water_temperature: 'Water temperature',
    heating: 'Heating',
    showers: 'Showers available',
    eco: 'Eco',
    remaining_time: 'Time left to heat',
    anti_legionella: 'Anti-legionella cycle',
    zone: 'Zone {n}',
  },
  fr: {
    plant_mode: "Mode de l'installation",
    pressure: 'Pression du circuit',
    flame: 'Brûleur allumé',
    heat_pump: 'Pompe à chaleur en marche',
    outside_temperature: 'Température extérieure',
    flow_temperature: 'Température de départ',
    dhw_temperature: 'Température eau chaude',
    dhw_target: 'Consigne eau chaude',
    faults: 'Défauts',
    energy_heating_gas: 'Gaz chauffage (mois dernier)',
    energy_heating_electricity: 'Électricité chauffage (mois dernier)',
    energy_dhw_gas: 'Gaz eau chaude (mois dernier)',
    energy_dhw_electricity: 'Électricité eau chaude (mois dernier)',
    temperature: 'Température',
    target: 'Consigne',
    mode: 'Mode',
    heat_request: 'Demande de chauffe',
    power: 'Marche',
    water_temperature: "Température de l'eau",
    heating: 'Chauffe en cours',
    showers: 'Douches disponibles',
    eco: 'Éco',
    remaining_time: 'Temps de chauffe restant',
    anti_legionella: 'Cycle anti-légionellose',
    zone: 'Zone {n}',
  },
  de: {
    plant_mode: 'Anlagenmodus',
    pressure: 'Heizkreisdruck',
    flame: 'Brenner an',
    heat_pump: 'Wärmepumpe läuft',
    outside_temperature: 'Außentemperatur',
    flow_temperature: 'Vorlauftemperatur',
    dhw_temperature: 'Warmwassertemperatur',
    dhw_target: 'Warmwasser-Sollwert',
    faults: 'Störungen',
    energy_heating_gas: 'Gas Heizung (letzter Monat)',
    energy_heating_electricity: 'Strom Heizung (letzter Monat)',
    energy_dhw_gas: 'Gas Warmwasser (letzter Monat)',
    energy_dhw_electricity: 'Strom Warmwasser (letzter Monat)',
    temperature: 'Temperatur',
    target: 'Sollwert',
    mode: 'Modus',
    heat_request: 'Wärmeanforderung',
    power: 'Betrieb',
    water_temperature: 'Wassertemperatur',
    heating: 'Heizt gerade',
    showers: 'Verfügbare Duschen',
    eco: 'Eco',
    remaining_time: 'Verbleibende Aufheizzeit',
    anti_legionella: 'Anti-Legionellen-Zyklus',
    zone: 'Zone {n}',
  },
  es: {
    plant_mode: 'Modo de la instalación',
    pressure: 'Presión del circuito',
    flame: 'Quemador encendido',
    heat_pump: 'Bomba de calor en marcha',
    outside_temperature: 'Temperatura exterior',
    flow_temperature: 'Temperatura de impulsión',
    dhw_temperature: 'Temperatura del agua caliente',
    dhw_target: 'Consigna de agua caliente',
    faults: 'Averías',
    energy_heating_gas: 'Gas calefacción (mes pasado)',
    energy_heating_electricity: 'Electricidad calefacción (mes pasado)',
    energy_dhw_gas: 'Gas agua caliente (mes pasado)',
    energy_dhw_electricity: 'Electricidad agua caliente (mes pasado)',
    temperature: 'Temperatura',
    target: 'Consigna',
    mode: 'Modo',
    heat_request: 'Demanda de calor',
    power: 'Encendido',
    water_temperature: 'Temperatura del agua',
    heating: 'Calentando',
    showers: 'Duchas disponibles',
    eco: 'Eco',
    remaining_time: 'Tiempo de calentamiento restante',
    anti_legionella: 'Ciclo antilegionela',
    zone: 'Zona {n}',
  },
};

/** Option labels, by language. */
export const LABELS = {
  en: {
    plant_summer: 'Summer (hot water only)',
    plant_winter: 'Winter (heating and hot water)',
    plant_heating_only: 'Heating only',
    plant_cooling: 'Cooling',
    plant_cooling_only: 'Cooling only',
    plant_off: 'Off',
    plant_holiday: 'Holiday',
    thermostat_0: 'Off',
    thermostat_1: 'Heating',
    thermostat_2: 'Cooling',
    thermostat_3: 'Schedule',
    water_0: 'Off',
    water_1: 'Auto (iMemory)',
    water_2: 'Eco',
    water_3: 'Boost',
    water_4: 'Manual',
    water_5: 'Away',
    water_6: 'Schedule',
  },
  fr: {
    plant_summer: 'Été (eau chaude seule)',
    plant_winter: 'Hiver (chauffage et eau chaude)',
    plant_heating_only: 'Chauffage seul',
    plant_cooling: 'Rafraîchissement',
    plant_cooling_only: 'Rafraîchissement seul',
    plant_off: 'Arrêt',
    plant_holiday: 'Vacances',
    thermostat_0: 'Arrêt',
    thermostat_1: 'Chauffage',
    thermostat_2: 'Rafraîchissement',
    thermostat_3: 'Programme',
    water_0: 'Arrêt',
    water_1: 'Auto (iMemory)',
    water_2: 'Éco',
    water_3: 'Boost',
    water_4: 'Manuel',
    water_5: 'Absence',
    water_6: 'Programme',
  },
  de: {
    plant_summer: 'Sommer (nur Warmwasser)',
    plant_winter: 'Winter (Heizung und Warmwasser)',
    plant_heating_only: 'Nur Heizung',
    plant_cooling: 'Kühlen',
    plant_cooling_only: 'Nur Kühlen',
    plant_off: 'Aus',
    plant_holiday: 'Urlaub',
    thermostat_0: 'Aus',
    thermostat_1: 'Heizen',
    thermostat_2: 'Kühlen',
    thermostat_3: 'Zeitprogramm',
    water_0: 'Aus',
    water_1: 'Auto (iMemory)',
    water_2: 'Eco',
    water_3: 'Boost',
    water_4: 'Manuell',
    water_5: 'Abwesend',
    water_6: 'Zeitprogramm',
  },
  es: {
    plant_summer: 'Verano (solo agua caliente)',
    plant_winter: 'Invierno (calefacción y agua caliente)',
    plant_heating_only: 'Solo calefacción',
    plant_cooling: 'Refrigeración',
    plant_cooling_only: 'Solo refrigeración',
    plant_off: 'Apagado',
    plant_holiday: 'Vacaciones',
    thermostat_0: 'Apagado',
    thermostat_1: 'Calefacción',
    thermostat_2: 'Refrigeración',
    thermostat_3: 'Programa',
    water_0: 'Apagado',
    water_1: 'Auto (iMemory)',
    water_2: 'Eco',
    water_3: 'Boost',
    water_4: 'Manual',
    water_5: 'Ausencia',
    water_6: 'Programa',
  },
};

/** Fixed texts, every language. */
export const TEXT = {
  // Configuration screen status
  notConfigured: {
    en: 'Enter the email and password of your Ariston NET account.',
    fr: 'Renseignez l’e-mail et le mot de passe de votre compte Ariston NET.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines Ariston-NET-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta Ariston NET.',
  },
  loginRefused: {
    en: 'Ariston NET refused the email or password. Check them in the Ariston NET app.',
    fr: 'Ariston NET refuse l’e-mail ou le mot de passe. Vérifiez-les dans l’appli Ariston NET.',
    de: 'Ariston NET lehnt E-Mail oder Passwort ab. Prüfe sie in der Ariston-NET-App.',
    es: 'Ariston NET rechaza el correo o la contraseña. Compruébelos en la aplicación Ariston NET.',
  },
  noDevice: {
    en: 'Connected, but the account has no supported appliance.',
    fr: 'Connecté, mais le compte n’a aucun appareil pris en charge.',
    de: 'Verbunden, aber das Konto hat kein unterstütztes Gerät.',
    es: 'Conectado, pero la cuenta no tiene ningún aparato compatible.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Logs der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },

  // Widget
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  setpoint: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  hotWater: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  showers: { en: 'Showers', fr: 'Douches', de: 'Duschen', es: 'Duchas' },
  mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  system: { en: 'System', fr: 'Installation', de: 'Anlage', es: 'Instalación' },
  burner: { en: 'Burner', fr: 'Brûleur', de: 'Brenner', es: 'Quemador' },
  heatPump: { en: 'Heat pump', fr: 'Pompe à chaleur', de: 'Wärmepumpe', es: 'Bomba de calor' },
  pressure: { en: 'Pressure', fr: 'Pression', de: 'Druck', es: 'Presión' },
  faults: { en: 'Faults', fr: 'Défauts', de: 'Störungen', es: 'Averías' },
  heating: { en: 'Heating', fr: 'En chauffe', de: 'Heizt', es: 'Calentando' },
  idle: { en: 'Idle', fr: 'En attente', de: 'Bereit', es: 'En espera' },
  on: { en: 'On', fr: 'Allumé', de: 'An', es: 'Encendido' },
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  power: { en: 'Power', fr: 'Marche', de: 'Betrieb', es: 'Encendido' },
  noFault: { en: 'No fault', fr: 'Aucun défaut', de: 'Keine Störung', es: 'Sin averías' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  down: { en: 'Lower', fr: 'Baisser', de: 'Senken', es: 'Bajar' },
  up: { en: 'Raise', fr: 'Monter', de: 'Erhöhen', es: 'Subir' },
  inProgress: { en: 'In progress', fr: 'En cours', de: 'Läuft', es: 'En curso' },
  stopBoost: {
    en: 'Stop boost',
    fr: 'Arrêter le boost',
    de: 'Boost beenden',
    es: 'Parar el boost',
  },
  schedule: { en: 'Schedule', fr: 'Programme', de: 'Zeitprogramm', es: 'Programa' },
  manual: { en: 'Manual', fr: 'Manuel', de: 'Manuell', es: 'Manual' },
  pickDevice: {
    en: 'Choose an Ariston appliance in the widget settings.',
    fr: 'Choisissez un appareil Ariston dans les réglages du widget.',
    de: 'Wähle in den Widget-Einstellungen ein Ariston-Gerät aus.',
    es: 'Elija un aparato Ariston en los ajustes del widget.',
  },
  notRead: {
    en: 'Not read from Ariston NET yet: try again in a few minutes.',
    fr: 'Pas encore lu sur Ariston NET : réessayez dans quelques minutes.',
    de: 'Noch nicht von Ariston NET gelesen: versuch es in ein paar Minuten erneut.',
    es: 'Aún no leído en Ariston NET: inténtelo de nuevo en unos minutos.',
  },
  done: { en: 'Done', fr: 'C’est fait', de: 'Erledigt', es: 'Hecho' },
};

/** Texts built from a value. */
export const MESSAGES = {
  rateLimited: (seconds) => ({
    en: `Ariston NET is limiting requests for ${seconds} s: the integration waits and tries again.`,
    fr: `Ariston NET limite les requêtes pendant ${seconds} s : l’intégration attend et réessaie.`,
    de: `Ariston NET begrenzt die Anfragen für ${seconds} s: Die Integration wartet und versucht es erneut.`,
    es: `Ariston NET limita las solicitudes durante ${seconds} s: la integración espera y vuelve a intentarlo.`,
  }),
  unreachable: (reason) => ({
    en: `Ariston NET cannot be reached (${reason}). The integration tries again.`,
    fr: `Ariston NET est injoignable (${reason}). L’intégration réessaie.`,
    de: `Ariston NET ist nicht erreichbar (${reason}). Die Integration versucht es erneut.`,
    es: `No se puede contactar con Ariston NET (${reason}). La integración lo vuelve a intentar.`,
  }),
  connected: (names, unsupported) => ({
    en:
      `Connected. ${names.length} appliance(s): ${names.join(', ') || '-'}.` +
      (unsupported.length ? ` Not supported: ${unsupported.join(', ')}.` : ''),
    fr:
      `Connecté. ${names.length} appareil(s) : ${names.join(', ') || '-'}.` +
      (unsupported.length ? ` Non pris en charge : ${unsupported.join(', ')}.` : ''),
    de:
      `Verbunden. ${names.length} Gerät(e): ${names.join(', ') || '-'}.` +
      (unsupported.length ? ` Nicht unterstützt: ${unsupported.join(', ')}.` : ''),
    es:
      `Conectado. ${names.length} aparato(s): ${names.join(', ') || '-'}.` +
      (unsupported.length ? ` No compatibles: ${unsupported.join(', ')}.` : ''),
  }),
  setpointOutOfRange: (min, max) => ({
    en: `Setpoint out of the appliance's range (${min} to ${max} °C).`,
    fr: `Consigne hors de la plage de l’appareil (${min} à ${max} °C).`,
    de: `Sollwert außerhalb des Gerätebereichs (${min} bis ${max} °C).`,
    es: `Consigna fuera del rango del aparato (de ${min} a ${max} °C).`,
  }),
  modeNotOffered: {
    en: 'This appliance does not offer that mode.',
    fr: 'Cet appareil ne propose pas ce mode.',
    de: 'Dieses Gerät bietet diesen Modus nicht an.',
    es: 'Este aparato no ofrece ese modo.',
  },
  notReadYet: {
    en: 'The appliance has not been read from Ariston NET yet: try again in a minute.',
    fr: 'L’appareil n’a pas encore été lu sur Ariston NET : réessayez dans une minute.',
    de: 'Das Gerät wurde noch nicht von Ariston NET gelesen: versuch es in einer Minute erneut.',
    es: 'El aparato aún no se ha leído en Ariston NET: inténtelo de nuevo en un minuto.',
  },
  unknownDevice: {
    en: 'Unknown appliance: scan again in the Discovery tab.',
    fr: 'Appareil inconnu : relancez la recherche dans l’onglet Découverte.',
    de: 'Unbekanntes Gerät: Starte die Suche im Tab „Erkennung“ erneut.',
    es: 'Aparato desconocido: vuelva a buscar en la pestaña Descubrimiento.',
  },
};

/** One language of a multi-language text, English as a fallback. */
export function pick(text, language) {
  return text[language] ?? text.en;
}

/** The names of a language. */
export function names(language) {
  return NAMES[language] ?? NAMES.en;
}

/** The option labels of a language. */
export function labels(language) {
  return LABELS[language] ?? LABELS.en;
}
