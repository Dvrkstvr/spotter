/**
 * UI strings. Ported verbatim from the design's DICT.
 *
 * Note: the design's dictionary declares `you` twice per language — 'You'/'Du'
 * then 'Profile'/'Profil'. The later value is the one that survives in JS, so
 * that is the one kept here.
 */

export type Lang = 'en' | 'de';

/**
 * The device's language, narrowed to one of the two this app speaks.
 *
 * `Intl` rather than `expo-localization`: a native module would mean an
 * optional bridge (see AGENTS.md) and a rebuild of both phones, for one
 * string. Hermes exposes the platform locale here on Android, and the only
 * question this app ever has is "is it German?" — so anything else, including
 * a runtime with Intl compiled out, lands on English.
 *
 * Only ever read on a genuine first run — see `firstRunDefaults`.
 */
export function deviceLang(): Lang {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    return tag.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

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
    // Only the how-to slots offer this — it is what asks for CAMERA.
    takePhoto: 'Take a photo',
    addCue: '+ Add cue', cuePlaceholder: 'What to remember', editHowTo: 'Edit the how-to',
    remove: 'Remove', dragReorder: 'Drag to reorder',
    resetExercise: 'Reset to the original',
    exampleEx: 'e.g. Incline Cable Fly', muscleGroup: 'Muscle group', equipment: 'Equipment', cancel: 'Cancel', save: 'Save',
    createNamed: 'Create “{name}”',
    back: '‹ Back', backRoutines: '‹ Routines', addExercise: 'Add exercise', addExerciseBtn: '+ Add exercise',
    startRoutine: 'Start this routine', holdDeleteRoutine: 'Hold to delete this routine',
    exercise: 'Exercise', sets: 'Sets', reps: 'Reps', logging: 'Logging',
    // Set-row column headers. Which pair shows is the exercise's `Measure`.
    unitKg: 'kg', unitSec: 'sec', unitKm: 'km', unitMin: 'min',
    measure: 'What a set is', measureLoad: 'Weight × reps', measureTime: 'Weight × seconds',
    measureDistance: 'Distance × minutes', measureDuration: 'Minutes only',
    measureHint: 'Minutes only is for things that have no sets — a climbing session, a match, a class.',
    measureFixed: 'Set when the exercise was made — changing it would orphan everything already logged.',
    lastTime: 'Last time', addSet: 'Add set', sameAsLast: 'Same as last time', next: 'Next ›', nextExercise: 'Next exercise', discard: 'Discard',
    // What a set says about the next one — see `SetMark`. The tile labels are
    // short because four of them share a row; the sentence they read as is
    // built by `markLastTime`.
    setLabel: 'Set {n}', markUp: 'Heavier', markDown: 'Lighter', markOk: 'Just right', markNote: 'Note',
    markNoteLabel: 'Note to yourself', markNotePlaceholder: 'What to remember for next time',
    markLastTime: 'Last time · {t}', markClear: 'Tap the mark again to clear it',
    holdAddSet: 'Hold to add a set', startNow: 'Start now', restLeftLabel: 'Rest · {t}',
    holdNext: 'Hold for the next exercise',
    emptySessionNote: 'No exercises yet — add the first one and log as you go.',
    removeExercise: 'Remove exercise',
    buddyLeftNote: '{name} disconnected — finishing on your own.',
    holdFinish: 'Hold to finish',
    finishWorkout: 'Finish workout', completedToday: 'Completed today', startAgain: 'Start again', agoToday: 'today',
    finish: 'Finish', saved: 'Saved', edit: 'Edit', editDone: 'Done', language: 'Language', muscleGroups: 'Muscle groups',
    addGroup: '+ Add group', addEquipment: '+ Add equipment', all: 'All', rest: 'Rest', restDay: 'Rest day',
    restNote: 'Enjoy your day to the fullest.',
    emptySession: 'Empty session', addAsYouGo: 'add as you go', freeSession: 'Free session', newRoutine: 'New routine',
    exCount: 'exercises', exCountOne: 'exercise', setCount: 'sets', setCountOne: 'set',
    ofSets: 'of', setsWord: 'sets', thisMonth: 'This month', volume: 'Volume',
    time: 'Time', loggedMonth: 'logged this month', unscheduled: 'unscheduled', bodyweight: 'bodyweight',
    dayDone: 'Done — logged this session.', dayPlannedPast: 'Planned, not logged.', dayPlanned: 'Planned.',
    dayFree: 'Nothing planned. Start a free session any time.', addDetails: 'Add your details below',
    savedNote: 'Saved to {date}. Next time these numbers show up as “last time”.',
    savedEmpty: 'Nothing was ticked off — nothing logged.', ok: 'Done',
    daysAgo: '{n} days ago', oneDayAgo: 'yesterday',
    /* — statistics & coach —
       The six regions are named here rather than read out of `groups`,
       because a region is an analysis this app performs, not an entry in the
       user's own list — see `regionOf`. `thousandSep` is the digit grouping
       character: Hermes has no dependable Intl on Android, so the dictionary
       is what knows it. */
    statsTitle: 'Statistics & Coach',
    regionChest: 'Chest', regionBack: 'Back', regionShoulders: 'Shoulders',
    regionArms: 'Arms', regionCore: 'Core', regionLegs: 'Legs',
    statsHeadWeak: '{region} is falling behind — {pct}% of your sets.',
    statsHeadEven: 'Evenly trained. {region} leads at {pct}%.',
    statsFootSessions: '{n} sessions', statsFootSession: '1 session',
    statsFootVolume: '{kg} kg lifted',
    statsEmpty: 'Log a few workouts and your strengths, weak points and coach show up here.',
    statsEvenMark: 'even split',
    thousandSep: ',',
    /* — the insights screen —
       Every fact line is plural by construction: `funFact` only ever picks a
       comparison you have cleared at least twice over, so no line here needs a
       singular form (which German would need a case for). */
    insights: 'Insights',
    insightsSub: '{days} days trained · {n} sessions',
    period8w: '8 weeks', period6m: '6 months', period12m: '12 months',
    insightsBalance: 'Muscle balance', insightsBalanceHint: '% of sets · dashed = even split',
    insightsWeak: 'Weak points', insightsWeakNone: 'Nothing is lagging behind. Keep it there.',
    insightsLow: 'low',
    insightsVolume: 'Volume', insightsVolumeHint: 'load only',
    bucketWeek: 'per week', bucket2Week: 'per 2 weeks', bucket4Week: 'per 4 weeks',
    insightsFavourites: 'Favourites',
    favExercise: 'exercise', favSession: 'session',
    favLogged: 'logged {n}×', favSessions: '{n} sessions',
    insightsFact: 'Fun fact',
    insightsCardio: 'Cardio', insightsCardioNone: 'no sessions',
    insightsCardioSome: '{n} sessions',
    insightsEmpty: 'Nothing logged in this period.',
    insightsLoose: '{n} sets sit outside these six — cardio, full body, and your own groups.',
    statsFactVolume: '{kg} kg lifted — about {thing}.',
    statsFactDistance: '{km} km covered — about {thing}.',
    factWashingMachine: '{n} washing machines', factPiano: '{n} grand pianos',
    factCar: '{n} family cars', factElephant: '{n} elephants',
    factBus: '{n} double-decker buses', factJet: '{n} jumbo jets',
    factMarathon: '{n} marathons', factChannel: '{n} swims across the Channel',
    factGermany: '{n} times the length of Germany', factSahara: '{n} crossings of the Sahara',
    buddy: 'Buddy', buddySub: 'Open sharing on both phones, pick each other, compare the code — then you train the same session together.',
    invite: 'Share session', inviteShort: 'Invite', nearby: 'Sharing nearby', searching: 'Searching…',
    shareHint: 'Only people who also have sharing open appear here.',
    authTitle: 'Confirm pairing', inviteSent: 'Invite sent',
    authShowHint: 'Show {name} this code to pair.',
    authEnterHint: "Enter the code shown on {name}'s phone.",
    authWrong: 'Wrong code — check again.', linkLost: 'Reconnecting…',
    connected: 'Connected', disconnect: 'Disconnect', dividerHint: 'leave empty for a divider', trainingWith: 'training with you',
    chooseWorkout: 'Choose a workout', thisWeek: 'This week', seePlan: 'See plan', routinesWord: 'routines',
    chooseRoutine: 'Choose routine',
    saveAsRoutine: 'Save as new routine', routineSaved: 'Saved to your routines.',
    loggedSessions: 'Logged', withBuddy: 'with {name}',
    noDetail: 'Logged before this phone kept the set-by-set detail.',
    nameRoutine: 'Name this routine',
    noRoutines: 'No routines yet — build one with “+ New”, or keep a logged session as one from its day on the Plan tab.',
    noResults: 'Nothing matches that search.',
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
    whoFirst: 'Who goes first', firstHost: 'Starter', firstRandom: 'Random', firstAsk: 'Ask',
    whoFirstHint:
      'Breaks the tie when you are level on an exercise. Random flips once per exercise; Ask puts it to you both and falls back to the coin.',
    whosUp: "Who's up?", bidMine: "I'll go", bidTheirs: 'You go',
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
    restAlertLabel: 'Notify when a rest ends',
    restAlertHint: 'Reaches you with the phone locked or in a pocket. It clears itself when you come back to the app.',
    // The alarm itself. The body is the exercise you are resting inside; this
    // line is the fallback for a freeform session that has none yet.
    restOverTitle: 'Rest is over', restOverBody: 'Your next set is up.',
    // Names the Android notification channel, in the phone's own settings.
    restAlertChannel: 'Rest timer',
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

    /* — onboarding — */
    obWelcomeKicker: 'Welcome', obAppName: 'Spotter',
    obTagline: 'A training diary that stays out of the way.',
    obWelcomeSub: 'Two minutes to set it up, and nothing here is permanent — every answer lives in Settings afterwards.',
    obGetStarted: 'Get started', obSkipSetup: 'Skip setup', obContinue: 'Continue',
    obAndMore: '…and two more.',
    obHowTitle: 'How it works',
    obHowSub: 'Four things you would not guess by looking at a screen.',
    obFeatTick: 'One tap logs a set',
    obFeatTickSub: 'The tick box is the whole button. Tap it again to take the set back.',
    obFeatDrag: 'Numbers are a gesture',
    obFeatDragSub: 'Hold a kg or reps cell, then drag up or down. Most sets never need the keyboard.',
    obFeatRest: 'Rest runs itself',
    obFeatRestSub: 'Every set you tick starts the clock, drawn on the set you are on next.',
    obFeatBuddy: 'Bring a training partner',
    obFeatBuddySub: 'Two phones, one session, side by side. No account and no internet.',
    obYouTitle: 'You',
    obYouSub: 'So your side of a shared session has a name on it. All of it stays on this phone.',
    obSkipForNow: 'Skip for now',
    obPermsTitle: 'Two things to allow',
    obPermsSub: 'Both optional, and neither is asked again. Spotter works without either — you only lose the thing it does.',
    obPermRadio: 'Training partners',
    obPermRadioWhy: 'Finds the phone next to you over Bluetooth. No internet, no account — nothing leaves the two phones.',
    obPermRadioNo: 'Train alone is on: everything to do with a partner is hidden and the radio stays off. Turn it back on in Settings whenever.',
    obPermNotif: 'Rest timer alerts',
    obPermNotifWhy: 'Tells you the rest is up when the screen is off or you have switched apps.',
    obPermNotifNo: 'The countdown still runs on the session screen — you just have to be looking at it.',
    obAllow: 'Allow', obAllowed: 'Allowed', obDenied: 'Not allowed',
    obAloneOn: 'Train alone is on',
    obPhotosNote: 'Photos and camera are asked for the first time you tap a photo slot — there is no reason to want them yet.',
    obSkipBoth: 'Skip both',
    obStyleTitle: 'How do you train?',
    obStyleSub: 'This only decides what comes up first. Nothing gets hidden — the full library is always one tap away.',
    obStyleStrength: 'Strength training',
    obStyleStrengthSub: 'Barbell, dumbbell, machines. Sets, reps and kilos.',
    obStyleCal: 'Calisthenics',
    obStyleCalSub: 'Your own bodyweight. Pull-ups, dips, holds, progressions.',
    obStyleCardio: 'Cardio',
    obStyleCardioSub: 'Running, rowing, riding. Distance and time, not weight.',
    obStyleMixed: 'A bit of everything',
    obStyleMixedSub: 'Do not sort it — put all of it in front of me.',
    obLevelTitle: 'How long have you been at it?',
    obLevelSub: 'Only so the first session suggests numbers you can actually do. After one workout it reads your own instead and never asks again.',
    obLevelNew: 'New to this',
    obLevelNewSub: 'Never really trained, or starting again from scratch.',
    obLevelSome: 'Trained before',
    obLevelSomeSub: 'You know the movements. Coming back after a break.',
    obLevelReg: 'Training regularly',
    obLevelRegSub: 'You already know your own numbers.',
    obLevelPreview: 'Your first session would suggest',
    obLevelNote: 'Every number stays editable — this only decides where they start.',
    obPickTitle: 'Where to start',
    obPickSub: 'Picked for {style}. Untick anything you do not want — they are yours to edit afterwards.',
    obShowAll: 'Show everything', obHideRest: 'Hide the rest', obEverythingElse: 'Everything else',
    obAddRoutines: 'Add {n} routines', obAddRoutine: 'Add 1 routine',
    obAddNone: 'Continue without any',
    obWeekTitle: 'Your week',
    obWeekSub: 'Put them on days, or leave it empty and just start whatever you feel like on the day.',
    obWeekTap: 'Tap a day to change it. The Plan tab does this too, any time.',
    obSkipNoPlan: 'Skip — no fixed plan',
    obDoneTitle: 'Ready.',
    obDoneSub: '{name}your diary is set up and empty, which is exactly how it should start.',
    obDoneRoutines: 'Routines', obDoneDays: 'Planned days', obDoneEx: 'Exercises',
    obDoneNote: 'Muscle groups, equipment, rest length, themes and the training partner radio all live in Settings.',
    obStartTraining: 'Start training',
    /* — settings entry — */
    dangerHead: 'Start over',
    rerunSetup: 'Run the first-run setup again',
    rerunSetupHint:
      'The welcome tour: profile, permissions, workout style and the starter routines. Saving its routine picks replaces the built-in routines on this phone — ones you made and everything you have logged are never touched.',
    holdRestore: 'Hold to restore',
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
    takePhoto: 'Foto aufnehmen',
    addCue: '+ Hinweis hinzufügen', cuePlaceholder: 'Worauf du achten willst', editHowTo: 'Anleitung bearbeiten',
    remove: 'Entfernen', dragReorder: 'Zum Sortieren ziehen',
    resetExercise: 'Auf das Original zurücksetzen',
    exampleEx: 'z. B. Schrägbank-Kabelzug', muscleGroup: 'Muskelgruppe', equipment: 'Gerät', cancel: 'Abbrechen', save: 'Speichern',
    createNamed: '„{name}“ anlegen',
    back: '‹ Zurück', backRoutines: '‹ Routinen', addExercise: 'Übung hinzufügen', addExerciseBtn: '+ Übung hinzufügen',
    startRoutine: 'Diese Routine starten', holdDeleteRoutine: 'Zum Löschen der Routine halten',
    exercise: 'Übung', sets: 'Sätze', reps: 'Whd.', logging: 'Aufzeichnung',
    unitKg: 'kg', unitSec: 'Sek.', unitKm: 'km', unitMin: 'Min.',
    measure: 'Was ein Satz ist', measureLoad: 'Gewicht × Whd.', measureTime: 'Gewicht × Sekunden',
    measureDistance: 'Distanz × Minuten', measureDuration: 'Nur Minuten',
    measureHint: 'Nur Minuten ist für alles ohne Sätze — eine Kletter-Session, ein Spiel, ein Kurs.',
    measureFixed: 'Beim Anlegen festgelegt — eine Änderung würde alles bereits Aufgezeichnete entwerten.',
    lastTime: 'Letztes Mal', addSet: 'Satz hinzufügen', sameAsLast: 'Wie letztes Mal', next: 'Weiter ›', nextExercise: 'Nächste Übung', discard: 'Verwerfen',
    setLabel: 'Satz {n}', markUp: 'Schwerer', markDown: 'Leichter', markOk: 'Genau richtig', markNote: 'Notiz',
    markNoteLabel: 'Notiz an dich selbst', markNotePlaceholder: 'Was du dir fürs nächste Mal merken willst',
    markLastTime: 'Letztes Mal · {t}', markClear: 'Nochmal tippen entfernt die Markierung',
    holdAddSet: 'Halten für neuen Satz', startNow: 'Jetzt starten', restLeftLabel: 'Pause · {t}',
    holdNext: 'Für die nächste Übung halten',
    emptySessionNote: 'Noch keine Übungen — füg die erste hinzu und trag ein, was du machst.',
    removeExercise: 'Übung entfernen',
    buddyLeftNote: '{name} hat die Verbindung getrennt — du machst allein weiter.',
    holdFinish: 'Zum Beenden halten',
    finishWorkout: 'Training beenden', completedToday: 'Heute erledigt', startAgain: 'Nochmal starten', agoToday: 'heute',
    finish: 'Fertig', saved: 'Gespeichert', edit: 'Bearbeiten', editDone: 'Fertig', language: 'Sprache', muscleGroups: 'Muskelgruppen',
    addGroup: '+ Gruppe hinzufügen', addEquipment: '+ Gerät hinzufügen', all: 'Alle', rest: 'Frei', restDay: 'Ruhetag',
    restNote: 'Genieß deinen Tag in vollen Zügen.',
    emptySession: 'Freies Training', addAsYouGo: 'unterwegs ergänzen', freeSession: 'Freies Training', newRoutine: 'Neue Routine',
    exCount: 'Übungen', exCountOne: 'Übung', setCount: 'Sätze', setCountOne: 'Satz',
    ofSets: 'von', setsWord: 'Sätze', thisMonth: 'Diesen Monat', volume: 'Volumen',
    time: 'Dauer', loggedMonth: 'diesen Monat erledigt', unscheduled: 'nicht geplant', bodyweight: 'Körpergewicht',
    dayDone: 'Erledigt — Einheit aufgezeichnet.', dayPlannedPast: 'Geplant, nicht aufgezeichnet.', dayPlanned: 'Geplant.',
    dayFree: 'Nichts geplant. Du kannst jederzeit frei trainieren.', addDetails: 'Trag deine Daten unten ein',
    savedNote: 'Für {date} gespeichert. Beim nächsten Mal stehen diese Zahlen unter „letztes Mal“.',
    savedEmpty: 'Nichts abgehakt — nichts gespeichert.', ok: 'Fertig',
    // composed after lastDone ('zuletzt vor …'), so no 'vor' of their own
    daysAgo: '{n} Tagen', oneDayAgo: 'einem Tag',
    /* — Statistik & Coach — siehe den englischen Block */
    statsTitle: 'Statistik & Coach',
    regionChest: 'Brust', regionBack: 'Rücken', regionShoulders: 'Schultern',
    regionArms: 'Arme', regionCore: 'Rumpf', regionLegs: 'Beine',
    statsHeadWeak: '{region} kommt zu kurz — {pct}% deiner Sätze.',
    statsHeadEven: 'Gleichmäßig trainiert. {region} führt mit {pct}%.',
    statsFootSessions: '{n} Einheiten', statsFootSession: '1 Einheit',
    statsFootVolume: '{kg} kg bewegt',
    statsEmpty: 'Zeichne ein paar Einheiten auf — Stärken, Schwächen und Coach erscheinen dann hier.',
    statsEvenMark: 'gleichmäßig',
    thousandSep: '.',
    /* — Insights — siehe den englischen Block */
    insights: 'Insights',
    insightsSub: '{days} Tage trainiert · {n} Einheiten',
    period8w: '8 Wochen', period6m: '6 Monate', period12m: '12 Monate',
    insightsBalance: 'Muskelbalance', insightsBalanceHint: '% der Sätze · gestrichelt = gleichmäßig',
    insightsWeak: 'Schwachstellen', insightsWeakNone: 'Nichts hinkt hinterher. Bleib dran.',
    insightsLow: 'wenig',
    insightsVolume: 'Volumen', insightsVolumeHint: 'nur Gewicht',
    bucketWeek: 'pro Woche', bucket2Week: 'pro 2 Wochen', bucket4Week: 'pro 4 Wochen',
    insightsFavourites: 'Favoriten',
    favExercise: 'Übung', favSession: 'Einheit',
    favLogged: '{n}× aufgezeichnet', favSessions: '{n} Einheiten',
    insightsFact: 'Zum Angeben',
    insightsCardio: 'Cardio', insightsCardioNone: 'keine Einheiten',
    insightsCardioSome: '{n} Einheiten',
    insightsEmpty: 'In diesem Zeitraum ist nichts aufgezeichnet.',
    insightsLoose: '{n} Sätze liegen außerhalb dieser sechs — Cardio, Ganzkörper und deine eigenen Gruppen.',
    statsFactVolume: '{kg} kg bewegt — etwa {thing}.',
    statsFactDistance: '{km} km zurückgelegt — etwa {thing}.',
    factWashingMachine: '{n} Waschmaschinen', factPiano: '{n} Flügel',
    factCar: '{n} Autos', factElephant: '{n} Elefanten',
    factBus: '{n} Doppeldeckerbusse', factJet: '{n} Jumbo-Jets',
    factMarathon: '{n} Marathons', factChannel: '{n} Ärmelkanal-Durchquerungen',
    factGermany: '{n}× die Länge Deutschlands', factSahara: '{n} Sahara-Durchquerungen',
    buddy: 'Trainingspartner', buddySub: 'Öffnet das Teilen auf beiden Handys, wählt einander aus, vergleicht den Code — dann trainiert ihr dieselbe Session zusammen.',
    invite: 'Session teilen', inviteShort: 'Einladen', nearby: 'Teilen in der Nähe', searching: 'Suche…',
    shareHint: 'Nur wer das Teilen auch geöffnet hat, taucht hier auf.',
    authTitle: 'Kopplung bestätigen', inviteSent: 'Einladung gesendet',
    authShowHint: 'Zeig {name} diesen Code zum Koppeln.',
    authEnterHint: 'Gib den Code ein, der auf {name}s Handy steht.',
    authWrong: 'Falscher Code — schau nochmal.', linkLost: 'Verbinde neu …',
    connected: 'Verbunden', disconnect: 'Trennen', dividerHint: 'leer lassen für eine Trennlinie', trainingWith: 'trainiert mit dir',
    chooseWorkout: 'Training auswählen', thisWeek: 'Diese Woche', seePlan: 'Plan ansehen', routinesWord: 'Routinen',
    chooseRoutine: 'Routine wählen',
    saveAsRoutine: 'Als neue Routine speichern', routineSaved: 'In deinen Routinen gespeichert.',
    loggedSessions: 'Aufgezeichnet', withBuddy: 'mit {name}',
    noDetail: 'Aufgezeichnet, bevor dieses Handy die einzelnen Sätze behalten hat.',
    nameRoutine: 'Name der Routine',
    noRoutines: 'Noch keine Routinen — erstell eine mit „+ Neu“ oder speichere eine aufgezeichnete Einheit über ihren Tag im Plan-Tab.',
    noResults: 'Nichts passt zu dieser Suche.',
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
    whoFirst: 'Wer fängt an', firstHost: 'Starter', firstRandom: 'Zufall', firstAsk: 'Fragen',
    whoFirstHint:
      'Entscheidet, wenn ihr bei einer Übung gleichauf seid. „Zufall“ wirft einmal pro Übung; „Fragen“ überlässt es euch beiden und wirft sonst die Münze.',
    whosUp: 'Wer fängt an?', bidMine: 'Ich', bidTheirs: 'Du',
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
    restAlertLabel: 'Benachrichtigen, wenn die Pause endet',
    restAlertHint: 'Erreicht dich auch bei gesperrtem Bildschirm oder in der Tasche. Sie verschwindet von selbst, sobald du die App wieder öffnest.',
    restOverTitle: 'Pause vorbei', restOverBody: 'Dein nächster Satz steht an.',
    restAlertChannel: 'Pausen-Timer',
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

    /* — Onboarding — */
    obWelcomeKicker: 'Willkommen', obAppName: 'Spotter',
    obTagline: 'Ein Trainingstagebuch, das dir nicht im Weg steht.',
    obWelcomeSub: 'Zwei Minuten zum Einrichten — und nichts davon ist endgültig, jede Antwort findest du später in den Einstellungen.',
    obGetStarted: 'Los geht’s', obSkipSetup: 'Einrichtung überspringen', obContinue: 'Weiter',
    obAndMore: '… und zwei mehr.',
    obHowTitle: 'So funktioniert’s',
    obHowSub: 'Vier Dinge, die man einem Bildschirm nicht ansieht.',
    obFeatTick: 'Ein Tipp hakt den Satz ab',
    obFeatTickSub: 'Die Box ist der ganze Knopf. Nochmal tippen nimmt den Satz zurück.',
    obFeatDrag: 'Zahlen sind eine Geste',
    obFeatDragSub: 'Kg- oder Whd.-Feld halten, dann hoch oder runter ziehen. Die meisten Sätze brauchen nie die Tastatur.',
    obFeatRest: 'Die Pause läuft von selbst',
    obFeatRestSub: 'Jeder abgehakte Satz startet die Uhr — angezeigt auf dem Satz, der als Nächstes dran ist.',
    obFeatBuddy: 'Trainiere zu zweit',
    obFeatBuddySub: 'Zwei Handys, eine Session, nebeneinander. Kein Konto, kein Internet.',
    obYouTitle: 'Du',
    obYouSub: 'Damit deine Seite einer gemeinsamen Session einen Namen trägt. Alles bleibt auf diesem Handy.',
    obSkipForNow: 'Später',
    obPermsTitle: 'Zwei Dinge zum Erlauben',
    obPermsSub: 'Beides optional, und keins wird nochmal gefragt. Spotter funktioniert auch ohne — es fehlt nur genau das eine.',
    obPermRadio: 'Trainingspartner',
    obPermRadioWhy: 'Findet das Handy neben dir per Bluetooth. Kein Internet, kein Konto — nichts verlässt die beiden Handys.',
    obPermRadioNo: '„Allein trainieren“ ist an: alles rund um Partner ist ausgeblendet und das Radio bleibt aus. In den Einstellungen jederzeit umkehrbar.',
    obPermNotif: 'Pausen-Erinnerung',
    obPermNotifWhy: 'Meldet sich, wenn die Pause um ist und der Bildschirm aus oder eine andere App offen ist.',
    obPermNotifNo: 'Der Countdown läuft trotzdem auf dem Trainingsbildschirm — du musst nur hinschauen.',
    obAllow: 'Erlauben', obAllowed: 'Erlaubt', obDenied: 'Nicht erlaubt',
    obAloneOn: '„Allein trainieren“ ist an',
    obPhotosNote: 'Fotos und Kamera werden erst gefragt, wenn du zum ersten Mal auf einen Foto-Platz tippst — vorher gibt es keinen Grund dafür.',
    obSkipBoth: 'Beide überspringen',
    obStyleTitle: 'Wie trainierst du?',
    obStyleSub: 'Das entscheidet nur, was zuerst kommt. Nichts wird versteckt — die ganze Bibliothek ist immer einen Tipp entfernt.',
    obStyleStrength: 'Krafttraining',
    obStyleStrengthSub: 'Langhantel, Kurzhantel, Maschinen. Sätze, Wiederholungen, Kilos.',
    obStyleCal: 'Calisthenics',
    obStyleCalSub: 'Dein eigenes Körpergewicht. Klimmzüge, Dips, Halten, Progressionen.',
    obStyleCardio: 'Cardio',
    obStyleCardioSub: 'Laufen, Rudern, Radfahren. Distanz und Zeit statt Gewicht.',
    obStyleMixed: 'Von allem etwas',
    obStyleMixedSub: 'Nicht sortieren — zeig mir einfach alles.',
    obLevelTitle: 'Wie lange bist du schon dabei?',
    obLevelSub: 'Nur damit die erste Einheit Zahlen vorschlägt, die du wirklich schaffst. Nach einem Training liest sie deine eigenen und fragt nie wieder.',
    obLevelNew: 'Ganz neu',
    obLevelNewSub: 'Nie richtig trainiert, oder Neustart von vorn.',
    obLevelSome: 'Schon mal trainiert',
    obLevelSomeSub: 'Du kennst die Übungen. Zurück nach einer Pause.',
    obLevelReg: 'Trainiere regelmäßig',
    obLevelRegSub: 'Du kennst deine eigenen Zahlen.',
    obLevelPreview: 'Deine erste Einheit würde vorschlagen',
    obLevelNote: 'Jede Zahl bleibt änderbar — das hier entscheidet nur, wo sie anfangen.',
    obPickTitle: 'Womit anfangen',
    obPickSub: 'Ausgewählt für {style}. Hak ab, was du nicht willst — bearbeiten kannst du sie später sowieso.',
    obShowAll: 'Alles zeigen', obHideRest: 'Rest ausblenden', obEverythingElse: 'Alles andere',
    obAddRoutines: '{n} Routinen übernehmen', obAddRoutine: '1 Routine übernehmen',
    obAddNone: 'Ohne Routinen weiter',
    obWeekTitle: 'Deine Woche',
    obWeekSub: 'Leg sie auf Tage — oder lass es leer und starte einfach, worauf du an dem Tag Lust hast.',
    obWeekTap: 'Tipp auf einen Tag, um ihn zu ändern. Der Plan-Tab kann das später auch.',
    obSkipNoPlan: 'Überspringen — kein fester Plan',
    obDoneTitle: 'Fertig.',
    obDoneSub: '{name}dein Tagebuch ist eingerichtet und leer — genau so soll es anfangen.',
    obDoneRoutines: 'Routinen', obDoneDays: 'Geplante Tage', obDoneEx: 'Übungen',
    obDoneNote: 'Muskelgruppen, Geräte, Pausenlänge, Farben und das Partner-Radio findest du in den Einstellungen.',
    obStartTraining: 'Training starten',
    /* — Einstellungen — */
    dangerHead: 'Von vorn',
    rerunSetup: 'Ersteinrichtung noch einmal ausführen',
    rerunSetupHint:
      'Die Willkommenstour: Profil, Berechtigungen, Trainingsstil und die Start-Routinen. Das Speichern ihrer Routinen-Auswahl ersetzt die mitgelieferten Routinen auf diesem Handy — selbst erstellte und alles Aufgezeichnete bleiben unberührt.',
    holdRestore: 'Zum Wiederherstellen halten',
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

/**
 * Exported for the screens that draw weekday labels from a schedule index —
 * `DOW` in exercises.ts stays the *internal* key set and must never be
 * rendered: it reads as English regardless of language.
 */
export const DAYS_SHORT = {
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

/** '1 exercise' / '3 exercises' — the dictionaries carry both forms. */
export const countN = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
