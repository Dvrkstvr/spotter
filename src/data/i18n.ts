/**
 * UI strings. Ported verbatim from the design's DICT.
 *
 * Note: the design's dictionary declares `you` twice per language — 'You'/'Du'
 * then 'Profile'/'Profil'. The later value is the one that survives in JS, so
 * that is the one kept here.
 */

export type Lang = 'en' | 'de';

/**
 * A user-named thing's display names, one per language it has been named in.
 * Missing languages fall back to whichever is filled, shown greyed as a cue
 * that the translation doesn't exist yet.
 */
export type LangMap = Partial<Record<Lang, string>>;

export const DICT = {
  en: {
    today: 'Today', plan: 'Plan', routines: 'Routines', exercises: 'Exercises', you: 'Profile', settings: 'Settings',
    plannedToday: 'Planned for today', lastDone: 'last done', start: 'Start', orStart: 'Freeform workout >',
    doneWord: 'done', plannedWord: 'planned', weeklyPlan: 'Weekly plan · tap to change', new: '+ New', search: 'Search',
    aboutYou: 'About you', training: 'Training', age: 'Age', bodyWeight: 'Body weight', height: 'Height',
    yourName: 'Your name', photo: 'Photo', yrs: 'yrs', machineSetup: 'Machine setup', seatBarHeight: 'Seat / bar height',
    addSetting: '+ Add setting', lastSession: 'Last session', usedIn: 'Used in', howTo: 'How to', close: 'Close',
    dropGif: 'Drop a GIF or video frame', startPos: 'Start position', endPos: 'End position', videoLink: 'Video link',
    pasteUrl: 'Paste a video URL', cues: 'Cues', setup: 'Setup', newExercise: 'New exercise', name: 'Name',
    addCue: '+ Add cue', cuePlaceholder: 'What to remember', editHowTo: 'Edit the how-to',
    resetExercise: 'Reset to the original',
    exampleEx: 'e.g. Incline Cable Fly', muscleGroup: 'Muscle group', equipment: 'Equipment', cancel: 'Cancel', save: 'Save',
    back: '‹ Back', backRoutines: '‹ Routines', addExercise: 'Add exercise', addExerciseBtn: '+ Add exercise',
    startRoutine: 'Start this routine', exercise: 'Exercise', sets: 'Sets', reps: 'Reps', logging: 'Logging',
    lastTime: 'Last time', addSet: 'Add set', sameAsLast: 'Same as last time', next: 'Next ›', nextExercise: 'Next exercise', discard: 'Discard',
    holdAddSet: 'Hold to add a set', startNow: 'Start now', restLeftLabel: 'Rest · {t}',
    holdNext: 'Hold for the next exercise',
    emptySessionNote: 'No exercises yet — add the first one and log as you go.',
    buddyLeftNote: '{name} disconnected — finishing on your own.',
    holdFinish: 'Hold to finish',
    finishWorkout: 'Finish workout', completedToday: 'Completed today', startAgain: 'Start again', agoToday: 'today',
    finish: 'Finish', saved: 'Saved', edit: 'Edit', editDone: 'Done', language: 'Language', muscleGroups: 'Muscle groups',
    addGroup: '+ Add group', addEquipment: '+ Add equipment', all: 'All', rest: 'Rest', restDay: 'Rest day',
    restNote: 'Enjoy your day to the fullest.',
    emptySession: 'Empty session', addAsYouGo: 'add as you go', freeSession: 'Free session', newRoutine: 'New routine',
    exCount: 'exercises', setCount: 'sets', ofSets: 'of', setsWord: 'sets', thisMonth: 'This month', volume: 'Volume',
    time: 'Time', loggedMonth: 'logged this month', unscheduled: 'unscheduled', bodyweight: 'bodyweight',
    dayDone: 'Done — logged this session.', dayPlannedPast: 'Planned, not logged.', dayPlanned: 'Planned.',
    dayFree: 'Nothing planned. Start a free session any time.', addDetails: 'Add your details below',
    savedNote: 'Saved to {date}. Next time these numbers show up as “last time”.',
    savedEmpty: 'Nothing was ticked off — nothing logged.', ok: 'Done',
    daysAgo: '{n} days ago', oneDayAgo: 'yesterday',
    buddy: 'Buddy', buddySub: 'Open sharing on both phones, pick each other, compare the code — then you train the same session together.',
    invite: 'Share session', inviteShort: 'Invite', nearby: 'Sharing nearby', searching: 'Searching…',
    shareHint: 'Only people who also have sharing open appear here.',
    authTitle: 'Confirm pairing', inviteSent: 'Invite sent',
    authShowHint: 'Show {name} this code to pair.',
    authEnterHint: "Enter the code shown on {name}'s phone.",
    authWrong: 'Wrong code — check again.', linkLost: 'Reconnecting…',
    connected: 'Connected', disconnect: 'Disconnect', dividerHint: 'leave empty for a divider', trainingWith: 'training with you',
    chooseWorkout: 'Choose a workout', thisWeek: 'This week', seePlan: 'See plan',
    chooseRoutine: 'Choose routine',
    saveAsRoutine: 'Save as new routine', routineSaved: 'Saved to your routines.',
    buddySync: 'Buddy sync', sync: 'Sync', connectingTo: 'Connecting to {name}…',
    syncDemoNote: 'Demo transport — nothing leaves this phone yet.',
    missingHere: 'Missing on your device', missingThere: 'Missing on {name}’s device',
    transferAll: 'Transfer all', transferOne: 'Transfer', addedMark: 'Added', sentMark: 'Sent',
    inSync: 'Everything in sync.',
    typeGroup: 'Group', typeKind: 'Equipment', typeExercise: 'Exercise', typeRoutine: 'Routine',
    nearbyDevice: 'Nearby device',
    trainTogether: 'Train together?', inviteBody: '{name} is starting {routine}.',
    join: 'Join', notNow: 'Not now',
    pairedBuddies: 'Paired', buddyNearby: 'Nearby', buddyAway: 'Not nearby',
    requestSession: 'Request a session', forgetBuddy: 'Forget this buddy',
    askSent: 'Asked {name} — waiting for an answer…', askDeclined: '{name} said not right now',
    joinAskTitle: 'Can I join?', joinAskBody: '{name} would like to join {routine}.',
    joinAskIdleBody: '{name} would like to train with you.',
    letThemIn: 'Let them in', letsTrain: "Let's train",
    stPending: 'Waiting for {name} to join…', stJoining: 'Syncing with {name}…',
    stDeclined: '{name} is sitting this one out',
    stLost: 'Connection lost — looking for {name}…', stFinished: '{name} has finished',
    stWaiting: '{name} is waiting for you', stAhead: '{name} is ahead', stBehind: '{name} is behind',
    stBothDone: 'Both done — ready for the next exercise',
    yourTurn: 'Your set', theirTurn: "{name}'s set", together: 'Lift together',
    modeAlternate: 'Take turns', modeParallel: 'Parallel',
    jumpTo: 'Go to {ex}',
    planSynced: 'In sync with {name}', planDiffers: "Differs on {name}'s phone",
    planMissing: "Not on {name}'s phone yet",
    backToWorkout: 'Back to workout', liveSession: 'Live session', me: 'You',
    about: 'About', version: 'Version', buildKind: 'Build',
    buildStandalone: 'Standalone · real buddy radio', buildSim: 'Expo Go · sim radio',
    buildDemo: 'Expo Go · demo transport', expoSdk: 'Expo SDK',
    sessionsLogged: 'Sessions logged', copyright: '© {year} calkoh',
    buildTogether: 'Build one together', buildTogetherSub: 'with {name} — you both add exercises',
    buildingWith: 'Building together with {name} · live',
    draftLegend: 'Sets are shared · reps and kg are yours',
    buddyPickingEx: '{name} is picking an exercise…',
    saveForBoth: 'Save for both', startTogether: 'Start together',
    appearance: 'Appearance', mode: 'Mode',
    modeSystem: 'System', modeLight: 'Light', modeDark: 'Dark',
    colourTheme: 'Theme',
    themeBlurple: 'Blurple', themeTeal: 'Teal', themeForest: 'Forest',
    themeEmber: 'Ember', themeRose: 'Rose', themeSlate: 'Slate',
    workout: 'Workout', lists: 'Lists',
    restBetween: 'Rest between sets', restOff: 'Off',
    restHint: 'Runs after every set you tick off. Off hides the countdown entirely.',
    hapticsLabel: 'Vibration',
    hapticsHint: 'A short buzz when a set is ticked, and when a rest runs out.',
    privacy: 'Privacy', trainAlone: 'Train alone',
    trainAloneHint:
      'Hides everything to do with a training partner and switches the radio off. The people you have paired with are remembered.',
    data: 'Data',
    exportBackup: 'Export a backup',
    exportHint: 'These lists, your routines and every logged session, as one file to keep somewhere else.',
    importBackup: 'Restore from a backup',
    importHint: 'Replaces what is on this phone with the contents of a backup file.',
    backupFailed: 'Could not write the backup.',
    restoreFailed: 'That file is not a Spotter backup.',
    restoreDone: 'Restored — {n} sessions logged.',
    restoreTitle: 'Replace everything?',
    restoreBody:
      'Restoring overwrites the routines, exercises and logged sessions on this phone. It cannot be undone.',
    restoreGo: 'Restore',
  },
  de: {
    today: 'Heute', plan: 'Plan', routines: 'Routinen', exercises: 'Übungen', you: 'Profil', settings: 'Einstellungen',
    plannedToday: 'Für heute geplant', lastDone: 'zuletzt vor', start: 'Starte', orStart: 'Oder einfach loslegen',
    doneWord: 'erledigt', plannedWord: 'geplant', weeklyPlan: 'Wochenplan · zum Ändern tippen', new: '+ Neu', search: 'Suchen',
    aboutYou: 'Über dich', training: 'Training', age: 'Alter', bodyWeight: 'Körpergewicht', height: 'Größe',
    yourName: 'Dein Name', photo: 'Foto', yrs: 'J.', machineSetup: 'Geräte-Einstellung', seatBarHeight: 'Sitz / Stangenhöhe',
    addSetting: '+ Einstellung', lastSession: 'Letzte Einheit', usedIn: 'Verwendet in', howTo: 'Anleitung', close: 'Schließen',
    dropGif: 'GIF oder Videobild ablegen', startPos: 'Startposition', endPos: 'Endposition', videoLink: 'Video-Link',
    pasteUrl: 'Video-URL einfügen', cues: 'Hinweise', setup: 'Einstellung', newExercise: 'Neue Übung', name: 'Name',
    addCue: '+ Hinweis hinzufügen', cuePlaceholder: 'Worauf du achten willst', editHowTo: 'Anleitung bearbeiten',
    resetExercise: 'Auf das Original zurücksetzen',
    exampleEx: 'z. B. Schrägbank-Kabelzug', muscleGroup: 'Muskelgruppe', equipment: 'Gerät', cancel: 'Abbrechen', save: 'Speichern',
    back: '‹ Zurück', backRoutines: '‹ Routinen', addExercise: 'Übung hinzufügen', addExerciseBtn: '+ Übung hinzufügen',
    startRoutine: 'Diese Routine starten', exercise: 'Übung', sets: 'Sätze', reps: 'Whd.', logging: 'Aufzeichnung',
    lastTime: 'Letztes Mal', addSet: 'Satz hinzufügen', sameAsLast: 'Wie letztes Mal', next: 'Weiter ›', nextExercise: 'Nächste Übung', discard: 'Verwerfen',
    holdAddSet: 'Halten für neuen Satz', startNow: 'Jetzt starten', restLeftLabel: 'Pause · {t}',
    holdNext: 'Für die nächste Übung halten',
    emptySessionNote: 'Noch keine Übungen — füg die erste hinzu und trag ein, was du machst.',
    buddyLeftNote: '{name} hat die Verbindung getrennt — du machst allein weiter.',
    holdFinish: 'Zum Beenden halten',
    finishWorkout: 'Training beenden', completedToday: 'Heute erledigt', startAgain: 'Nochmal starten', agoToday: 'heute',
    finish: 'Fertig', saved: 'Gespeichert', edit: 'Bearbeiten', editDone: 'Fertig', language: 'Sprache', muscleGroups: 'Muskelgruppen',
    addGroup: '+ Gruppe hinzufügen', addEquipment: '+ Gerät hinzufügen', all: 'Alle', rest: 'Frei', restDay: 'Ruhetag',
    restNote: 'Genieß deinen Tag in vollen Zügen.',
    emptySession: 'Freies Training', addAsYouGo: 'unterwegs ergänzen', freeSession: 'Freies Training', newRoutine: 'Neue Routine',
    exCount: 'Übungen', setCount: 'Sätze', ofSets: 'von', setsWord: 'Sätze', thisMonth: 'Diesen Monat', volume: 'Volumen',
    time: 'Dauer', loggedMonth: 'diesen Monat erledigt', unscheduled: 'nicht geplant', bodyweight: 'Körpergewicht',
    dayDone: 'Erledigt — Einheit aufgezeichnet.', dayPlannedPast: 'Geplant, nicht aufgezeichnet.', dayPlanned: 'Geplant.',
    dayFree: 'Nichts geplant. Du kannst jederzeit frei trainieren.', addDetails: 'Trag deine Daten unten ein',
    savedNote: 'Für {date} gespeichert. Beim nächsten Mal stehen diese Zahlen unter „letztes Mal“.',
    savedEmpty: 'Nichts abgehakt — nichts gespeichert.', ok: 'Fertig',
    // composed after lastDone ('zuletzt vor …'), so no 'vor' of their own
    daysAgo: '{n} Tagen', oneDayAgo: 'einem Tag',
    buddy: 'Trainingspartner', buddySub: 'Öffnet das Teilen auf beiden Handys, wählt einander aus, vergleicht den Code — dann trainiert ihr dieselbe Session zusammen.',
    invite: 'Session teilen', inviteShort: 'Einladen', nearby: 'Teilen in der Nähe', searching: 'Suche…',
    shareHint: 'Nur wer das Teilen auch geöffnet hat, taucht hier auf.',
    authTitle: 'Kopplung bestätigen', inviteSent: 'Einladung gesendet',
    authShowHint: 'Zeig {name} diesen Code zum Koppeln.',
    authEnterHint: 'Gib den Code ein, der auf {name}s Handy steht.',
    authWrong: 'Falscher Code — schau nochmal.', linkLost: 'Verbinde neu …',
    connected: 'Verbunden', disconnect: 'Trennen', dividerHint: 'leer lassen für eine Trennlinie', trainingWith: 'trainiert mit dir',
    chooseWorkout: 'Training auswählen', thisWeek: 'Diese Woche', seePlan: 'Plan ansehen',
    chooseRoutine: 'Routine wählen',
    saveAsRoutine: 'Als neue Routine speichern', routineSaved: 'In deinen Routinen gespeichert.',
    buddySync: 'Buddy-Sync', sync: 'Sync', connectingTo: 'Verbinde mit {name} …',
    syncDemoNote: 'Demo-Übertragung — noch verlässt nichts dieses Handy.',
    missingHere: 'Fehlt auf deinem Gerät', missingThere: 'Fehlt bei {name}',
    transferAll: 'Alle übertragen', transferOne: 'Übertragen', addedMark: 'Hinzugefügt', sentMark: 'Gesendet',
    inSync: 'Alles synchron.',
    typeGroup: 'Gruppe', typeKind: 'Gerät', typeExercise: 'Übung', typeRoutine: 'Routine',
    nearbyDevice: 'Gerät in der Nähe',
    trainTogether: 'Zusammen trainieren?', inviteBody: '{name} startet {routine}.',
    join: 'Mitmachen', notNow: 'Jetzt nicht',
    pairedBuddies: 'Gekoppelt', buddyNearby: 'In der Nähe', buddyAway: 'Nicht in der Nähe',
    requestSession: 'Training anfragen', forgetBuddy: 'Diesen Partner entfernen',
    askSent: '{name} gefragt — warte auf Antwort …', askDeclined: '{name} sagt gerade nicht',
    joinAskTitle: 'Darf ich mitmachen?', joinAskBody: '{name} möchte bei {routine} mitmachen.',
    joinAskIdleBody: '{name} möchte mit dir trainieren.',
    letThemIn: 'Reinlassen', letsTrain: 'Los geht’s',
    stPending: 'Warte, bis {name} beitritt …', stJoining: 'Synchronisiere mit {name} …',
    stDeclined: '{name} ist diesmal nicht dabei',
    stLost: 'Verbindung weg — suche {name} …', stFinished: '{name} ist fertig',
    stWaiting: '{name} wartet auf dich', stAhead: '{name} ist weiter', stBehind: '{name} hängt hinterher',
    stBothDone: 'Beide fertig — bereit für die nächste Übung',
    yourTurn: 'Dein Satz', theirTurn: 'Satz von {name}', together: 'Macht ihn zusammen',
    modeAlternate: 'Abwechselnd', modeParallel: 'Parallel',
    jumpTo: 'Zu {ex}',
    planSynced: 'Synchron mit {name}', planDiffers: 'Auf {name}s Handy anders',
    planMissing: 'Noch nicht auf {name}s Handy',
    backToWorkout: 'Zurück zum Training', liveSession: 'Live-Session', me: 'Du',
    about: 'Über die App', version: 'Version', buildKind: 'Variante',
    buildStandalone: 'Standalone · echtes Buddy-Radio', buildSim: 'Expo Go · Sim-Radio',
    buildDemo: 'Expo Go · Demo-Übertragung', expoSdk: 'Expo SDK',
    sessionsLogged: 'Aufgezeichnete Einheiten', copyright: '© {year} calkoh',
    buildTogether: 'Zusammen erstellen', buildTogetherSub: 'mit {name} — ihr fügt beide Übungen hinzu',
    buildingWith: 'Gemeinsam mit {name} · live',
    draftLegend: 'Sätze geteilt · Wdh. und kg sind deine',
    buddyPickingEx: '{name} wählt eine Übung aus …',
    saveForBoth: 'Für beide speichern', startTogether: 'Zusammen starten',
    appearance: 'Darstellung', mode: 'Modus',
    modeSystem: 'System', modeLight: 'Hell', modeDark: 'Dunkel',
    colourTheme: 'Farbe',
    themeBlurple: 'Blurple', themeTeal: 'Türkis', themeForest: 'Wald',
    themeEmber: 'Glut', themeRose: 'Rosé', themeSlate: 'Schiefer',
    workout: 'Training', lists: 'Listen',
    restBetween: 'Pause zwischen Sätzen', restOff: 'Aus',
    restHint: 'Läuft nach jedem Satz, den du abhakst. „Aus“ blendet den Countdown ganz aus.',
    hapticsLabel: 'Vibration',
    hapticsHint: 'Ein kurzes Summen, wenn ein Satz abgehakt ist und wenn die Pause um ist.',
    privacy: 'Privatsphäre', trainAlone: 'Allein trainieren',
    trainAloneHint:
      'Blendet alles rund um Trainingspartner aus und schaltet das Radio ab. Wer gekoppelt ist, bleibt gespeichert.',
    data: 'Daten',
    exportBackup: 'Backup exportieren',
    exportHint: 'Diese Listen, deine Routinen und jede aufgezeichnete Einheit als eine Datei zum Aufheben.',
    importBackup: 'Backup wiederherstellen',
    importHint: 'Ersetzt alles auf diesem Handy durch den Inhalt einer Backup-Datei.',
    backupFailed: 'Das Backup konnte nicht geschrieben werden.',
    restoreFailed: 'Diese Datei ist kein Spotter-Backup.',
    restoreDone: 'Wiederhergestellt — {n} Einheiten aufgezeichnet.',
    restoreTitle: 'Alles ersetzen?',
    restoreBody:
      'Beim Wiederherstellen werden Routinen, Übungen und aufgezeichnete Einheiten auf diesem Handy überschrieben. Das lässt sich nicht rückgängig machen.',
    restoreGo: 'Wiederherstellen',
  },
} as const;

/** Every key the UI can ask for, with values widened so either language fits. */
export type Strings = { [K in keyof (typeof DICT)['en']]: string };

/* ── live dates ────────────────────────────────────────────────────────────
 *
 * The design's dates were baked into the dictionary ('Fri 7 August'); going
 * live they are formatted from real Dates instead. Kept as hand-rolled tables
 * rather than Intl, so both languages render identically on every device.
 * Day tables are Monday-based, matching `DOW` and the schedule keys.
 */

const DAYS_SHORT = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
} as const;

const DAYS_LONG = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
} as const;

export const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
} as const;

const dowOf = (d: Date) => (d.getDay() + 6) % 7;

/** 'Fri 7 August' / 'Fr 7. August' — the Today screen's date label. */
export const fmtDayShort = (lang: Lang, d: Date) =>
  lang === 'de'
    ? `${DAYS_SHORT.de[dowOf(d)]} ${d.getDate()}. ${MONTHS.de[d.getMonth()]}`
    : `${DAYS_SHORT.en[dowOf(d)]} ${d.getDate()} ${MONTHS.en[d.getMonth()]}`;

/** 'Friday 7 August' / 'Freitag, 7. August' — the summary's filing note. */
export const fmtDayLong = (lang: Lang, d: Date) =>
  lang === 'de'
    ? `${DAYS_LONG.de[dowOf(d)]}, ${d.getDate()}. ${MONTHS.de[d.getMonth()]}`
    : `${DAYS_LONG.en[dowOf(d)]} ${d.getDate()} ${MONTHS.en[d.getMonth()]}`;

/** '5 Aug' / '5. Aug' — compact, for the last-session rows. */
export const fmtDayTiny = (lang: Lang, d: Date) =>
  lang === 'de'
    ? `${d.getDate()}. ${MONTHS.de[d.getMonth()].slice(0, 3)}`
    : `${d.getDate()} ${MONTHS.en[d.getMonth()].slice(0, 3)}`;

/** 'last done 3 days ago' / 'zuletzt vor 3 Tagen', composed from the dict. */
export const fmtLastDone = (L: Strings, days: number) =>
  `${L.lastDone} ${days === 0 ? L.agoToday : days === 1 ? L.oneDayAgo : L.daysAgo.replace('{n}', String(days))}`;
