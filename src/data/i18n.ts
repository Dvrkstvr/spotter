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
    exampleEx: 'e.g. Incline Cable Fly', muscleGroup: 'Muscle group', equipment: 'Equipment', cancel: 'Cancel', save: 'Save',
    back: '‹ Back', backRoutines: '‹ Routines', addExercise: 'Add exercise', addExerciseBtn: '+ Add exercise',
    startRoutine: 'Start this routine', exercise: 'Exercise', sets: 'Sets', reps: 'Reps', logging: 'Logging',
    lastTime: 'Last time', addSet: 'Add set', sameAsLast: 'Same as last time', next: 'Next ›', nextExercise: 'Next exercise', discard: 'Discard',
    finishWorkout: 'Finish workout', completedToday: 'Completed today', startAgain: 'Start again', agoToday: 'today',
    finish: 'Finish', saved: 'Saved', edit: 'Edit', editDone: 'Done', language: 'Language', muscleGroups: 'Muscle groups',
    addGroup: '+ Add group', addEquipment: '+ Add equipment', all: 'All', rest: 'Rest', restDay: 'Rest day',
    emptySession: 'Empty session', addAsYouGo: 'add as you go', freeSession: 'Free session', newRoutine: 'New routine',
    exCount: 'exercises', setCount: 'sets', ofSets: 'of', setsWord: 'sets', thisMonth: 'This month', volume: 'Volume',
    time: 'Time', loggedMonth: 'logged this month', unscheduled: 'unscheduled', bodyweight: 'bodyweight',
    dayDone: 'Done — logged this session.', dayPlannedPast: 'Planned, not logged.', dayPlanned: 'Planned.',
    dayFree: 'Nothing planned. Start a free session any time.', addDetails: 'Add your details below',
    savedNote: 'Saved to {date}. Next time these numbers show up as “last time”.',
    savedEmpty: 'Saved empty — nothing was ticked off.', ok: 'Done',
    daysAgo: '{n} days ago', oneDayAgo: 'yesterday',
    buddy: 'Buddy', buddySub: 'Pair with someone at the gym over Bluetooth — you both see the same session and can tick off sets for each other.',
    invite: 'Invite over Bluetooth', inviteShort: 'Invite', nearby: 'Nearby devices', searching: 'Searching…',
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
    stPending: 'Waiting for {name} to join…', stDeclined: '{name} is sitting this one out',
    stLost: 'Connection lost — looking for {name}…', stFinished: '{name} has finished',
    stWaiting: '{name} is waiting for you', stAhead: '{name} is ahead', stBehind: '{name} is behind',
    yourTurn: 'Your set', theirTurn: "{name}'s set", together: 'Lift together',
    modeAlternate: 'Take turns', modeParallel: 'Parallel',
    jumpTo: 'Go to {ex}',
    planSynced: 'In sync with {name}', planDiffers: "Differs on {name}'s phone",
    planMissing: "Not on {name}'s phone yet",
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
    exampleEx: 'z. B. Schrägbank-Kabelzug', muscleGroup: 'Muskelgruppe', equipment: 'Gerät', cancel: 'Abbrechen', save: 'Speichern',
    back: '‹ Zurück', backRoutines: '‹ Routinen', addExercise: 'Übung hinzufügen', addExerciseBtn: '+ Übung hinzufügen',
    startRoutine: 'Diese Routine starten', exercise: 'Übung', sets: 'Sätze', reps: 'Whd.', logging: 'Aufzeichnung',
    lastTime: 'Letztes Mal', addSet: 'Satz hinzufügen', sameAsLast: 'Wie letztes Mal', next: 'Weiter ›', nextExercise: 'Nächste Übung', discard: 'Verwerfen',
    finishWorkout: 'Training beenden', completedToday: 'Heute erledigt', startAgain: 'Nochmal starten', agoToday: 'heute',
    finish: 'Fertig', saved: 'Gespeichert', edit: 'Bearbeiten', editDone: 'Fertig', language: 'Sprache', muscleGroups: 'Muskelgruppen',
    addGroup: '+ Gruppe hinzufügen', addEquipment: '+ Gerät hinzufügen', all: 'Alle', rest: 'Frei', restDay: 'Ruhetag',
    emptySession: 'Freies Training', addAsYouGo: 'unterwegs ergänzen', freeSession: 'Freies Training', newRoutine: 'Neue Routine',
    exCount: 'Übungen', setCount: 'Sätze', ofSets: 'von', setsWord: 'Sätze', thisMonth: 'Diesen Monat', volume: 'Volumen',
    time: 'Dauer', loggedMonth: 'diesen Monat erledigt', unscheduled: 'nicht geplant', bodyweight: 'Körpergewicht',
    dayDone: 'Erledigt — Einheit aufgezeichnet.', dayPlannedPast: 'Geplant, nicht aufgezeichnet.', dayPlanned: 'Geplant.',
    dayFree: 'Nichts geplant. Du kannst jederzeit frei trainieren.', addDetails: 'Trag deine Daten unten ein',
    savedNote: 'Für {date} gespeichert. Beim nächsten Mal stehen diese Zahlen unter „letztes Mal“.',
    savedEmpty: 'Leer gespeichert — nichts abgehakt.', ok: 'Fertig',
    // composed after lastDone ('zuletzt vor …'), so no 'vor' of their own
    daysAgo: '{n} Tagen', oneDayAgo: 'einem Tag',
    buddy: 'Trainingspartner', buddySub: 'Verbinde dich per Bluetooth mit jemandem im Studio — ihr seht dieselbe Einheit und könnt Sätze füreinander abhaken.',
    invite: 'Per Bluetooth einladen', inviteShort: 'Einladen', nearby: 'Geräte in der Nähe', searching: 'Suche…',
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
    stPending: 'Warte, bis {name} beitritt …', stDeclined: '{name} ist diesmal nicht dabei',
    stLost: 'Verbindung weg — suche {name} …', stFinished: '{name} ist fertig',
    stWaiting: '{name} wartet auf dich', stAhead: '{name} ist weiter', stBehind: '{name} hängt hinterher',
    yourTurn: 'Dein Satz', theirTurn: 'Satz von {name}', together: 'Macht ihn zusammen',
    modeAlternate: 'Abwechselnd', modeParallel: 'Parallel',
    jumpTo: 'Zu {ex}',
    planSynced: 'Synchron mit {name}', planDiffers: 'Auf {name}s Handy anders',
    planMissing: 'Noch nicht auf {name}s Handy',
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
