/**
 * UI strings. Ported verbatim from the design's DICT.
 *
 * Note: the design's dictionary declares `you` twice per language — 'You'/'Du'
 * then 'Profile'/'Profil'. The later value is the one that survives in JS, so
 * that is the one kept here.
 */

export type Lang = 'en' | 'de';

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
    savedNote: 'Saved to Friday 7 August. Next time these numbers show up as “last time”.',
    savedEmpty: 'Saved empty — nothing was ticked off.', ok: 'Done',
    todayDate: 'Fri 7 August', sevenDays: '7 days ago',
    buddy: 'Buddy', buddySub: 'Pair with someone at the gym over Bluetooth — you both see the same session and can tick off sets for each other.',
    invite: 'Invite over Bluetooth', inviteShort: 'Invite', nearby: 'Nearby devices', searching: 'Searching…',
    connected: 'Connected', disconnect: 'Disconnect', dividerHint: 'leave empty for a divider', trainingWith: 'training with you',
    chooseWorkout: 'Choose a workout', thisWeek: 'This week', seePlan: 'See plan',
    chooseRoutine: 'Choose routine',
    saveAsRoutine: 'Save as new routine', routineSaved: 'Saved to your routines.',
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
    savedNote: 'Für Freitag, 7. August gespeichert. Beim nächsten Mal stehen diese Zahlen unter „letztes Mal“.',
    savedEmpty: 'Leer gespeichert — nichts abgehakt.', ok: 'Fertig',
    todayDate: 'Fr 7. August', sevenDays: '7 Tagen',
    buddy: 'Trainingspartner', buddySub: 'Verbinde dich per Bluetooth mit jemandem im Studio — ihr seht dieselbe Einheit und könnt Sätze füreinander abhaken.',
    invite: 'Per Bluetooth einladen', inviteShort: 'Einladen', nearby: 'Geräte in der Nähe', searching: 'Suche…',
    connected: 'Verbunden', disconnect: 'Trennen', dividerHint: 'leer lassen für eine Trennlinie', trainingWith: 'trainiert mit dir',
    chooseWorkout: 'Training auswählen', thisWeek: 'Diese Woche', seePlan: 'Plan ansehen',
    chooseRoutine: 'Routine wählen',
    saveAsRoutine: 'Als neue Routine speichern', routineSaved: 'In deinen Routinen gespeichert.',
  },
} as const;

/** Every key the UI can ask for, with values widened so either language fits. */
export type Strings = { [K in keyof (typeof DICT)['en']]: string };
