/**
 * UI strings. Ported verbatim from the design's DICT.
 *
 * Note: the design's dictionary declares `you` twice per language — 'You'/'Du'
 * then 'Profile'/'Profil'. The later value is the one that survives in JS, so
 * that is the one kept here.
 */

import { fromISO } from '@/data/date';
import type { Repeat } from '@/data/plan';

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
    // `start` composes with a routine name after it ('Start Chest A'); `startBare`
    // stands alone on a button. Identical in English — German needs the split.
    plannedToday: 'Planned for today', lastDone: 'last done', start: 'Start', startBare: 'Start',
    doneWord: 'done', plannedWord: 'planned', weeklyPlan: 'Weekly plan',
    new: '+ New', search: 'Search',
    aboutYou: 'About you', training: 'Training', age: 'Age', bodyWeight: 'Body weight', height: 'Height',
    yourName: 'Your name', photo: 'Photo', yrs: 'yrs', machineSetup: 'Machine setup', seatBarHeight: 'Seat / bar height',
    addSetting: '+ Add setting', lastSession: 'Last session', usedIn: 'Used in', howTo: 'How to', close: 'Close',
    // "Add", not "Drop": the slot is filled by the photo picker, not drag-and-drop.
    dropGif: 'Add a GIF or video frame', startPos: 'Start position', endPos: 'End position', videoLink: 'Video link',
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
    // The way in, on a set that has been lifted and has nothing written on it
    // yet. `+ ` because that is how this app writes an action that adds a
    // thing — `+ Add exercise`, `+ Save as routine`.
    addNote: '+ Note',
    holdAddSet: 'Hold to add a set', startNow: 'Start now', restLeftLabel: 'Rest · {t}',
    holdNext: 'Hold for the next exercise',
    // Two sets that share one rest — see `data/superset.ts`. `dropAfter` and
    // `noRestFrom` stand where a countdown would have been, which is what
    // makes them explanations rather than furniture: they leave with the row.
    holdAddDrop: 'Hold to add a drop set', addDrop: '+ Drop set',
    dropAfter: 'Drop from set {n} — no rest',
    // A drop line has no number of its own — it is a line of the set above,
    // not the next one — so the screen reader is told what it is instead.
    dropLabel: 'Drop off set {n}',
    // Removing a set takes its drops with it: they are lines of it, and there
    // is no set for them to belong to afterwards. The held label is where that
    // is said, because it is read before the hold rather than after it.
    holdRemoveSetDrops: 'Hold to remove this set and its drop',
    holdRemoveSetDropsN: 'Hold to remove this set and its {n} drops',
    linkLabel: 'Straight after set {n}', linkSub: 'No rest between them.',
    superset: 'Superset', supersetRound: 'Superset · round {n} of {m}',
    noRestFrom: 'No rest — straight from {name}',
    pairNext: 'Superset with the next exercise', unpair: 'Unpair',
    emptySessionNote: 'No exercises yet — add the first one and log as you go.',
    removeExercise: 'Remove exercise',
    holdRemoveSet: 'Hold to remove this set',
    buddyLeftNote: '{name} disconnected — finishing on your own.',
    holdFinish: 'Hold to finish',
    finishWorkout: 'Finish workout', completedToday: 'Completed today', startAgain: 'Start again', agoToday: 'today',
    finish: 'Finish', saved: 'Saved', edit: 'Edit', editDone: 'Done', language: 'Language', muscleGroups: 'Muscle groups',
    addGroup: '+ Add group', addEquipment: '+ Add equipment', all: 'All', rest: 'Rest', restDay: 'Rest day',
    restNote: 'Enjoy your day to the fullest.',
    // One term for the freeform session everywhere — it is also what `dayFree`
    // says and the name a logged one is filed under (`freeSession`).
    addAsYouGo: 'add as you go', freeSession: 'Free session', newRoutine: 'New routine',
    exCount: 'exercises', exCountOne: 'exercise', setCount: 'sets', setCountOne: 'set',
    ofSets: 'of', setsWord: 'sets', thisMonth: 'This month', volume: 'Volume',
    time: 'Time', loggedMonth: 'logged this month', unscheduled: 'unscheduled', bodyweight: 'bodyweight',
    dayDone: 'Done — logged this session.', dayPlannedPast: 'Planned, not logged.',
    dayFree: 'Nothing planned. Start a free session any time.', addDetails: 'Add your details below',
    /* — the plan, as dated rules —
       `repOnce` … `repEveryWeeks` are the generated repeat forms, and the split
       is where German stops being a translation: English composes uniformly
       ("every {n} days") where German switches on the count — jeden Tag / alle
       3 Tage. Two forms per unit, picked by n === 1, because a repeat of one is
       the common case. `repUnitDay` … are the stepper's own unit word, which
       follows the same number. */
    nothingPlanned: 'Nothing planned', planWorkout: '+ Plan a workout', planTitle: 'Plan a workout',
    planRestore: 'Restore', planLogged: 'logged', planWorkoutField: 'Workout', planRepeats: 'Repeats',
    repOnce: 'Once', repDays: 'Days', repWeeks: 'Weeks',
    repUnitDay: 'day', repUnitDays: 'days', repUnitWeek: 'week', repUnitWeeks: 'weeks',
    repEveryDay: 'Every day', repEveryDays: 'Every {n} days',
    repEveryWeek: 'Every week', repEveryWeeks: 'Every {n} weeks',
    repFrom: 'from {date}',
    planScope: 'Applies to', planScopeDay: 'Just this day', planScopeRule: 'Every repeat',
    planScopeDayNote: 'Only {date} changes — the repeat stays as it is.',
    planScopeRuleNote: 'Every repeat changes, from {date} on.',
    planHoldRemove: 'Hold to remove',
    planHoldRemoveDay: 'Hold to remove — just this day',
    planHoldRemoveRule: 'Hold to remove — every repeat',
    planPickFirst: 'Pick a workout', alsoToday: 'Also today:',
    savedNote: 'Saved to {date}. Next time these numbers show up as “last time”.',
    savedEmpty: 'Nothing was ticked off — nothing logged.', ok: 'Done',
    // Under the Finish button, only while it is true. Not a tip: a tip teaches
    // something invisible once and retires, where this is a permanent
    // statement of what a button is about to do. It is `savedEmpty` in the
    // other tense on purpose — two phrasings of "nothing happened" would read
    // as two different rules — and it is the answer to "how do I cancel this",
    // which nobody finds behind a button labelled Finish.
    finishLogsNothing: 'Nothing ticked off — finishing now logs nothing.',
    daysAgo: '{n} days ago', oneDayAgo: 'yesterday',
    /* — the in-place tips —
       One pair per `TipId` (see `data/tips.ts`): the mechanism, then the
       consequence. Three of them are also the welcome tour's rundown cards,
       read from here by `onboarding-overlay.tsx`, so the tour and the tips can
       never phrase one feature two ways. */
    tipDrag: 'Slide a cell up or down',
    // The notch is the slow speed, which is the one a first drag is made at —
    // and the sweep is the half nobody would go looking for, so it's the half
    // the line spends its aside on.
    tipDragSub: '0.5 kg or one rep per notch — drag faster and it steps in bigger jumps. Most sets never need the keyboard.',
    tipTick: 'The box is the whole button',
    tipTickSub: 'One tap logs the set. Tap it again to take it back.',
    tipGhost: 'Tap last time’s numbers',
    tipGhostSub: 'They land in the fields — still yours to change.',
    tipRest: 'The rest is already running',
    tipRestSub: 'It’s drawn on the set you’re on next. Start now cuts it short.',
    // Re-aimed when the note line shipped: the set number is no longer the only
    // way in, so the tip stopped being "here is a hidden button" and became
    // what the labelled one is for. `+ Note` says note and nothing about a
    // verdict, and nothing on the screen says it comes back.
    tipMark: 'Say how the set went',
    tipMarkSub: 'Tap + Note under a logged set — heavier, lighter, just right, or a few words. It’s there next time.',
    tipSwipe: 'Swipe for the next exercise',
    tipSwipeSub: 'Or open the chip up top and jump to any of them.',
    tipChip: 'The whole workout is behind the chip',
    tipChipSub: 'Jump to any exercise, add one, or finish up.',
    tipHold: 'Dashed means hold',
    tipHoldSub: 'A tap won’t do it here. Let go early and nothing happens.',
    tipStrip: 'Tap a day',
    tipStripSub: 'Plan it, move it, or take it off.',
    tipSearch: 'Search muscles, not just names',
    tipSearchSub: '“Back” finds the Deadlift’s routines too.',
    tipPlan: 'The calendar is the plan',
    tipPlanSub: 'Tap any day to plan it, move it, or take it off. A rule repeats until you change it.',
    tipStats: 'Everything here is read, never stored',
    tipStatsSub: 'It’s your logged sessions, counted. Nothing to set up and nothing to keep up to date.',
    dismissTip: 'I know this',
    tips: 'Tips',
    tipsAgain: 'Show tips again',
    tipsAgainHint: 'The short hints that point out gestures the first time you meet them.',
    tipsSeen: '{n} of {m} seen',
    /* — statistics & coach —
       The six regions are named here rather than read out of `groups`,
       because a region is an analysis this app performs, not an entry in the
       user's own list — see `regionOf`. `thousandSep` is the digit grouping
       character: Hermes has no dependable Intl on Android, so the dictionary
       is what knows it. */
    statsTitle: 'Statistics & Coach',
    regionChest: 'Chest', regionBack: 'Back', regionShoulders: 'Shoulders',
    regionArms: 'Arms', regionCore: 'Core', regionLegs: 'Legs',
    statsHeadWeak: '{muscle} got {n} sets a week — the range is {min} to {max}.',
    statsHeadEven: 'Every muscle in range. {region} leads at {n} sets a week.',
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
    insightsBalance: 'Muscle balance', insightsBalanceHint: '% of sets, a secondary muscle counting half · dashed = even split',
    insightsWeak: 'Needs work', insightsWeakNone: 'Every muscle is inside the range. Keep it there.',
    insightsPushPull: 'Push : pull', insightsPush: 'Push', insightsPull: 'Pull',
    insightsRatio: '1 : {n}',
    insightsPerWeek: '{n} / week', insightsShort: '{n} short', insightsBand: 'range {min}–{max} a week',
    insightsLow: 'low',
    insightsVolume: 'Volume', insightsVolumeHint: 'load only',
    bucketWeek: 'per week', bucket2Week: 'per 2 weeks', bucket4Week: 'per 4 weeks',
    insightsFavourites: 'Favourites',
    favExercise: 'exercise', favSession: 'session',
    favLogged: 'logged {n}×', favSessions: '{n} sessions',
    insightsFact: 'Fun fact',
    insightsCardio: 'Cardio', insightsCardioNone: 'no sessions',
    insightsEmpty: 'Nothing logged in this period.',
    insightsLoose: '{n} sets sit outside these six — cardio, full body, and your own groups.',
    statsFactVolume: '{kg} kg lifted — about {thing}.',
    statsFactDistance: '{km} km covered — about {thing}.',
    factWashingMachine: '{n} washing machines', factPiano: '{n} grand pianos',
    factCar: '{n} family cars', factElephant: '{n} elephants',
    factBus: '{n} double-decker buses', factJet: '{n} jumbo jets',
    factMarathon: '{n} marathons', factChannel: '{n} swims across the Channel',
    factGermany: '{n} times the length of Germany', factSahara: '{n} crossings of the Sahara',
    /* — the coach —
       The prompt is written in the user's language because they read it
       before they send it. The JSON contract inside it is not: `"measure":
       "load"` is an identifier in this app's data, not a word, and a German
       reply carrying "gewicht" would import as nothing. */
    coach: 'AI Coach', coachSub: 'Builds a prompt around your last {period}',
    coachGoalHead: 'What should the plan work on?',
    coachWeekHead: 'Sessions per week', coachGearHead: 'Equipment to plan with',
    // The chips are a taxonomy and this is a sentence — the placeholder is an
    // example rather than an instruction, because what belongs here is
    // whatever the six goals and the week seg couldn't say.
    coachNoteHead: 'Anything else?',
    coachNotePlaceholder: 'e.g. a two-week block, every second day, explosive compound lifts',
    coachShareHead: 'Share with the AI',
    coachShareBalance: 'Muscle balance & weak points', coachShareLifts: 'Key lifts & trends',
    coachShareProfile: 'Your details', coachShareProfileSub: 'age · weight · height',
    coachPrivacy: 'Your diary never leaves the phone — only the prompt on the next screen does.',
    coachWeakPreselect: 'Picked from your data: {list} behind.',
    coachCreate: 'Create prompt',
    goalWeak: 'Fix weak points', goalStrength: 'Build strength', goalMuscle: 'Muscle growth',
    goalCardio: 'Cardio & conditioning', goalMobility: 'Flexibility & mobility',
    goalBalanced: 'Balanced all-round',
    goalWeakAsk: 'Bring my weak points up to the rest.',
    goalStrengthAsk: 'Get stronger on the main lifts.',
    goalMuscleAsk: 'Build muscle size.',
    goalCardioAsk: 'Improve my cardio and conditioning.',
    goalMobilityAsk: 'Improve my flexibility and mobility.',
    goalBalancedAsk: 'Train my whole body evenly.',
    promptTitle: 'Your prompt', promptShare: 'Share to AI app…',
    promptShareHint: 'Opens the Android share sheet — Gemini, Claude, ChatGPT, or anything that takes text.',
    promptHaveAnswer: 'I have the answer › Import',
    // "routines", not "weekly routines": the free-text ask below it may well be
    // a fortnight's rotation, and an intro that had already decided the cycle
    // length would be arguing with it.
    promptIntro: 'You are an experienced strength coach. Below is real data from my workout diary. Recommend exercises and routines for my goal.',
    promptGoalHead: 'MY GOAL', promptWeek: '{n} sessions per week.', promptGear: 'Equipment: {gear}.',
    promptAnyGear: 'whatever I have',
    promptBalanceHead: 'MUSCLE BALANCE', promptBalanceUnit: '% of sets, counting a secondary muscle as half',
    promptWeakHead: 'Behind:', promptBandNote: 'sets per week; {min}–{max} is the range',
    promptCardioHead: 'Cardio:', promptCardioNone: 'no sessions at all.',
    promptCardioSome: '{n}, {km} km.',
    promptLiftsHead: 'KEY LIFTS', promptLiftNew: 'first time', promptLiftFlat: 'no change',
    promptLiftUp: '{kg} kg', promptLiftE1rm: 'est. 1RM {kg} kg',
    promptAboutHead: 'ABOUT ME', promptNoteHead: 'ALSO',
    promptRulesHead: 'RULES FOR YOUR ANSWER',
    promptRule1: '1. Briefly explain what to change and why.',
    promptRule2: '2. Then ONE fenced code block tagged spotter, exactly this shape:',
    promptRuleMeasure: 'measure is one of: {list}',
    promptRuleGroup: 'group must be one of: {list}',
    promptRuleKind: 'equipment must be one of: {list}',
    promptRuleWith:
      'Two exercises taken back to back with no rest between them are a superset: put "with": "next" on the first of the two. Leave it out everywhere else.',
    promptRuleDrop:
      'Drop sets have no field here — I take those live in the app. If you want them, say which sets in your explanation.',
    promptRuleReuse: 'Prefer exercises I already have: {list}',
    promptRuleFile:
      'If you can attach files, attach the block as plan.json as well — tapping it in a chat opens Spotter with the plan ready. Send the block in the message either way.',
    promptRule3: '3. After the block, close with exactly these steps:',
    promptStep1: '   1. Hold this message, tap Share, choose Spotter.',
    promptStep2: '   2. Spotter opens on the plan and shows a preview.',
    promptStep3: '   3. No share sheet? Copy the message instead and paste it into Spotter › Profile › Statistics & Coach › Import.',
    importTitle: 'Import', importPaste: 'Paste the AI\u2019s whole answer here',
    importPasteHint: 'Paste the entire message — Spotter finds the plan inside it.',
    countRoutine: '{n} routine', countRoutines: '{n} routines',
    countExercise: '{n} exercise', countExercises: '{n} exercises',
    countSession: '{n} session', countSessions: '{n} sessions',
    countRule: '{n} rule', countRules: '{n} rules',
    importFound: 'Found {r} · {e}',
    importNew: '{n} new', importInLibrary: 'in library', importNewTag: 'new',
    importNoBlock: 'No plan found in that text. Make sure you copied the AI\u2019s whole answer, code block included.',
    importBadJson: 'The plan block is there but its JSON is broken. Ask the AI to send the block again.',
    importBadShape: 'That block isn\u2019t a Spotter plan. Ask the AI to follow the format in the prompt.',
    importDo: 'Import {r} · {e}',
    importDoNothing: 'Nothing selected',
    importShowReply: 'Show the AI’s reply ›',
    importDiscard: 'Discard this plan',
    importDropped: 'Skipped {n}: named an exercise that isn\u2019t here and wasn\u2019t defined.',
    importGuessed: 'The AI named a muscle group or equipment you don\u2019t have — those are filed under {group} / {kind}.',
    importDuplicate: 'you already have one by this name',
    getRecommendations: 'Get recommendations ›',
    buddy: 'Buddy', buddySub: 'Open sharing on both phones, pick each other, compare the code — then you train the same session together.',
    invite: 'Share session', inviteShort: 'Invite', nearby: 'Sharing nearby', searching: 'Searching…',
    shareHint: 'Only people who also have sharing open appear here.',
    authTitle: 'Confirm pairing', inviteSent: 'Invite sent',
    authShowHint: 'Show {name} this code to pair.',
    authEnterHint: "Enter the code shown on {name}'s phone.",
    authWrong: 'Wrong code — check again.', authConfirm: 'Confirm', linkLost: 'Reconnecting…',
    connected: 'Connected', disconnect: 'Disconnect', dividerHint: 'leave empty for a divider', trainingWith: 'training with you',
    thisWeek: 'This week', seePlan: 'See plan',
    saveAsRoutine: 'Save as new routine', routineSaved: 'Saved to your routines.',
    loggedSessions: 'Logged', withBuddy: 'with {name}',
    noDetail: 'Logged before this phone kept the set-by-set detail.',
    nameRoutine: 'Name this routine',
    noRoutines: 'Nothing of yours yet — take one from the collection, or build your own with + New.',
    noResults: 'Nothing matches that search.',
    // — the routines tab's controls and the seed collection —
    searchRoutines: 'Search — name, exercise, muscle',
    sortWeek: 'Week', sortRecent: 'Recent', sortAZ: 'A–Z',
    famStrength: 'Strength', famCal: 'Calisthenics', famCardio: 'Cardio', famYours: 'Yours',
    // The count line under a narrowed list — a short list must read as
    // narrowed, not as loss.
    hiddenBySearch: '{n} of {m} — the search hides the rest.',
    hiddenByFilter: '{n} of {m} — the filter hides the rest.',
    fullCollection: 'Full collection',
    collectionSub: 'The built-in routines — add one and it’s yours to change.',
    // Composes with the onboarding style names ('Recommended · Strength training').
    recommendedFor: 'Recommended · {style}',
    onYourList: 'on your list',
    recently: 'Recently',
    buddySync: 'Buddy sync', sync: 'Sync', connectingTo: 'Connecting to {name}…',
    syncDemoNote: 'Demo transport — nothing leaves this phone yet.',
    missingHere: 'Missing on your phone', missingThere: 'Missing on {name}’s phone',
    transferAll: 'Transfer all', transferOne: 'Transfer', addedMark: 'Added', sentMark: 'Sent',
    // Sent = the radio delivered it; Received = their phone confirmed the merge.
    receivedMark: 'Received',
    inSync: 'Everything in sync.',
    typeGroup: 'Group', typeKind: 'Equipment', typeExercise: 'Exercise', typeRoutine: 'Routine',
    nearbyDevice: 'Nearby device',
    trainTogether: 'Train together?', inviteBody: '{name} is starting {routine}.',
    join: 'Join', notNow: 'Not now',
    pairedBuddies: 'Paired', buddyNearby: 'Nearby', buddyAway: 'Not nearby',
    requestSession: 'Request a session', forgetBuddy: 'Forget this buddy',
    rejoinWorkout: 'Rejoin the workout',
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
    // Their set is next but they're still resting — same slot as theirTurn,
    // and named so the clock can't be read as your own.
    theirRest: "{name}'s rest · {t}",
    // `restLeftLabel` with an owner on it, used exactly while their line is on
    // the row too: one clock needs no name, two do.
    myRest: 'Your rest · {t}',
    modeAlternate: 'Take turns', modeParallel: 'Parallel',
    whoFirst: 'Who goes first', firstHost: 'Starter', firstRandom: 'Random', firstAsk: 'Ask',
    whoFirstHint:
      "Breaks the tie when you're level on an exercise. Random flips once per exercise; Ask puts it to you both and falls back to the coin.",
    whosUp: "Who's up?", bidMine: "I'll go", bidTheirs: 'You go',
    jumpTo: 'Go to {ex}',
    // The other half of jumpTo — same slot, and the same one tap. Their list
    // never writes to yours on its own, so this is how an exercise crosses.
    addTheirs: 'Add {ex}',
    ovTheirsOnly: "In {name}'s session, not yours",
    planSynced: 'In sync with {name}', planDiffers: "Differs on {name}'s phone",
    planMissing: "Not on {name}'s phone yet",
    backToWorkout: 'Back to workout', workoutRunning: 'Workout running',
    liveSession: 'Live session', me: 'You',
    about: 'About', version: 'Version', buildName: 'Build name', buildKind: 'Build',
    buildStandalone: 'Standalone · full routine import', buildSim: 'Expo Go · sim radio',
    buildDemo: 'Expo Go · demo transport', expoSdk: 'Expo SDK',
    sessionsLogged: 'Sessions logged', copyright: '© {year} calkoh',
    privacyPolicy: 'Privacy policy ›', openSource: 'Open source licences ›',
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
    hapticsHint: 'A short buzz when a set is ticked, when a rest runs out, and a heavier one when something is deleted.',
    restAlertLabel: 'Notify when a rest ends',
    restAlertHint: 'Reaches you with the phone locked or in a pocket. It clears itself when you come back to the app.',
    // The alarm itself. The body is the exercise you are resting inside; this
    // line is the fallback for a freeform session that has none yet.
    restOverTitle: 'Rest is over', restOverBody: 'Your next set is up.',
    // Names the Android notification channel, in the phone's own settings.
    restAlertChannel: 'Rest timer',
    planAlertLabel: 'Remind me on a planned day',
    planAlertHint: 'One notification, at the time below, on days your plan holds a workout. Nothing on a rest day, and nothing once you have logged it.',
    planAlertTime: 'Reminder time',
    planAlertHour: 'Hour', planAlertMinute: 'Minute',
    // The reminder itself. Its title is the Today card's own words — one
    // phrase for one fact — and its body names the day's workouts.
    planAlertChannel: 'Planned workouts',
    sessionChannel: 'Active workout', sessionOngoing: 'Workout running — tap to come back.',
    privacy: 'Privacy', trainAlone: 'Train alone',
    trainAloneHint:
      'Hides everything to do with a training partner and switches the radio off. The people you have paired with are remembered.',
    data: 'Data',
    exportBackup: 'Export a backup',
    exportHint: 'These lists, your routines and every logged session, as one file to keep somewhere else.',
    importBackup: 'Restore from a backup',
    importHint: 'Replaces what is on this phone with the contents of a backup file.',
    backupFailed: 'Could not write the backup.',
    // Diagnostics. Written for the person who will read the file — Calvin and
    // whoever he asks — so the hint says what is in it rather than selling it.
    diagLabel: 'Diagnostics',
    diagHint:
      'Records what the app does — sessions, rests, the connection to a partner — so a problem can be looked at afterwards. No sets, weights or notes.',
    diagFolder: 'Log folder',
    diagFolderNone: 'Not chosen yet — pick where the log is saved.',
    diagFolderSet: 'Logs go to {folder}.',
    diagSave: 'Save the log now',
    diagSaveHint: 'A copy lands in the folder after every workout — this is the one in between.',
    diagSaved: 'Saved as {file}.',
    diagSaveFailed: 'Could not write to that folder — pick it again.',
    diagClear: 'Clear the log',
    diagClearHint: 'Throws away what has been recorded so far. Nothing else is touched.',
    diagCleared: 'The log is empty.',
    restoreFailed: 'That file is not a Spotter backup.',
    restoreNewer: 'That backup is from a newer Spotter than this one — update the app, then restore.',
    restoreDone: 'Restored — {c} logged.',
    restoreBody:
      'Replacing overwrites the routines, exercises and logged sessions on this phone. It cannot be undone.',
    restoreGo: 'Restore',
    // The restore sheet asks what should come back, rather than only offering
    // to replace the lot — see `RestoreSheet`.
    restoreAskTitle: 'What should come back?',
    restoreFrom: 'Backup from {date}.',
    restorePartSessions: 'Logged sessions',
    restorePartLibrary: 'Routines & exercises',
    restorePartPlan: 'Plan',
    restoreNoneNew: 'nothing new',
    restoreAdd: 'Add what’s missing',
    addOnlyMissing: 'Adds only what this phone doesn’t have. Nothing here is overwritten.',
    restoreAllHere: 'Everything in this backup is already on this phone.',
    holdReplace: 'Hold to replace everything',
    mergeDone: 'Added {s}, {r}, {e} and {p}.',
    mergeNothing: 'Nothing to add — it was all here already.',
    // A Spotter file tapped in another app — see <Intake>. The heading names
    // where it came from rather than repeating what the line below already says.
    intakeDoneTitle: 'From your backup',
    intakeTitle: 'Nothing to import',
    intakeUnknown: 'That file holds neither a Spotter backup nor a training plan.',
    intakeUnreadable: 'That file could not be read. If it came from a chat, open it again from there.',

    /* — onboarding — */
    obWelcomeKicker: 'Welcome', obAppName: 'Spotter',
    obTagline: 'A training diary that stays out of the way.',
    obWelcomeSub: 'Two minutes to set it up, and nothing here is permanent — every answer lives in Settings afterwards.',
    obGetStarted: 'Get started', obSkipSetup: 'Skip setup', obContinue: 'Continue',
    obHowTitle: 'How it works',
    obHowSub: "Two things you wouldn't guess by looking at a screen.",
    // The first three cards of the rundown are the `tip*` strings above, read
    // from there rather than restated — one list, two surfaces, so the tour and
    // the in-place tips cannot phrase one feature two ways. The buddy card has
    // no tip twin on purpose: the button that opens it carries a label, so it
    // fails the tips' admission test in the right direction.
    obFeatBuddy: 'Bring a training partner',
    obFeatBuddySub: 'Two phones, one session, side by side. No account and no internet.',
    // The buddy walkthrough. The rundown's fourth card is the headline and this
    // is the screen behind it — the explanation, and under it the radio
    // permission the explanation is the reason for. It sits before the name
    // field, which otherwise asks for a name for a thing not yet described.
    obBuddyTitle: 'Training together',
    obBuddySub: 'Two phones in the same gym, one session between them. Over Bluetooth — no account, no internet, nothing on a server.',
    obBuddyPair: 'Pair once',
    obBuddyPairSub: 'Both of you open Profile › Buddy, pick each other out of the list and compare the code. After that the two phones find each other on their own.',
    obBuddyStart: 'One starts, the other joins',
    obBuddyStartSub: 'Starting a routine asks them along — and they can ask you just as well. Say yes and the same session opens on both screens.',
    obBuddyLive: 'The session keeps you in step',
    obBuddyLiveSub: 'Whose set it is, how long their rest still has, every set ticking off on both phones. Take turns or lift in parallel — switch mid-workout.',
    obBuddyNote: 'Routines and exercises can be sent across too, and either of you can disconnect at any point. What you lifted stays yours: sets, notes and history never cross.',
    obBuddyAsk: 'What it needs',
    obSkipAlone: 'Skip — train alone',
    obYouTitle: 'You',
    obYouSub: 'So your side of a shared session has a name on it. All of it stays on this phone.',
    obSkipForNow: 'Skip for now',
    obPermsTitle: 'One thing to allow',
    obPermsSub: 'Optional. Spotter works without it — you only lose the one thing it does, and Settings can turn it on later.',
    obPermRadio: 'Training partners',
    obPermRadioWhy: 'Android asks for nearby devices — and on older phones for location, which is what Bluetooth scanning used to need. Neither is used for anything else.',
    obPermRadioNo: 'Train alone is on: everything to do with a partner is hidden and the radio stays off. Turn it back on in Settings whenever.',
    obPermNotif: 'Rest timer alerts',
    obPermNotifWhy: 'Tells you the rest is up when the screen is off or you have switched apps.',
    obPermNotifNo: 'The countdown still runs on the session screen — you just have to be looking at it.',
    obAllow: 'Allow', obAllowed: 'Allowed', obDenied: 'Not allowed',
    obAloneOn: 'Train alone is on',
    obPhotosNote: 'Photos and camera are asked for the first time you tap a photo slot — there is no reason to want them yet.',
    obSkipAlert: 'Skip — no alerts',
    obStyleTitle: 'How do you train?',
    obStyleSub: 'This only decides what comes up first. Nothing gets hidden — the full library is always one tap away.',
    obStyleStrength: 'Strength training',
    obStyleStrengthSub: 'Barbell, dumbbell, machines. Sets, reps and kilos.',
    obStyleCal: 'Calisthenics',
    obStyleCalSub: 'Your own bodyweight. Pull-ups, dips, holds, progressions.',
    obStyleCardio: 'Cardio',
    obStyleCardioSub: 'Running, rowing, riding. Distance and time, not weight.',
    obStyleMixed: 'A bit of everything',
    obStyleMixedSub: "Don't sort it — put all of it in front of me.",
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
    obPickSub: "Picked for {style}. Untick anything you don't want — they are yours to edit afterwards.",
    obShowAll: 'Show everything', obHideRest: 'Hide the rest', obEverythingElse: 'Everything else',
    obAddRoutines: 'Add {n} routines', obAddRoutine: 'Add 1 routine',
    obAddNone: 'Continue without any',
    obWeekTitle: 'Your week',
    obWeekSub: 'Put them on days, or leave it empty and just start whatever you feel like on the day.',
    obWeekPool: 'Your routines',
    obWeekDrag: 'Hold a routine and drag it onto a day. The Plan tab does this too, any time.',
    obWeekPoolEmpty: 'Nothing picked — go back a step if you want something to place.',
    obWeekRemind: 'A nudge on those days',
    obPlanAlertNo: 'Your plan still stands — Today and the Plan tab show it. Nothing will speak up on its own.',
    obSkipNoPlan: 'Skip — no fixed plan',
    // The coach walkthrough, second to last: it is the one feature that has
    // nothing to say on a first run, so it is introduced as something waiting
    // rather than something to do now.
    obCoachTitle: 'The AI coach',
    obCoachSub: 'There is no AI inside Spotter. It writes the prompt, you take it to whichever AI you already use, and it reads the answer back.',
    obCoachRead: 'It reads your last eight weeks',
    obCoachReadSub: 'Muscle balance, what is lagging, how your main lifts have moved. You pick the goal and what goes in — and you see the whole prompt before it leaves.',
    obCoachSend: 'Send it wherever you like',
    obCoachSendSub: 'The Android share sheet — Gemini, Claude, ChatGPT, anything that takes text. The diary itself never leaves the phone.',
    obCoachBack: 'Bring the answer home',
    obCoachBackSub: 'Share the reply back into Spotter, or paste it in. You get a preview of the routines and exercises, and only what you tick is added.',
    obCoachNote: 'It needs a few logged sessions before it has anything to say. You’ll find it under Profile › Statistics & Coach.',
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
  },
  de: {
    today: 'Heute', plan: 'Plan', routines: 'Routinen', exercises: 'Übungen', you: 'Profil', settings: 'Einstellungen',
    // `start` prefixes a routine name ('Starte Brust A'), so it is the one
    // du-imperative on a button; alone that reads wrong, hence `startBare`.
    plannedToday: 'Für heute geplant', lastDone: 'zuletzt', start: 'Starte', startBare: 'Starten',
    doneWord: 'erledigt', plannedWord: 'geplant', weeklyPlan: 'Wochenplan',
    new: '+ Neu', search: 'Suchen',
    aboutYou: 'Über dich', training: 'Training', age: 'Alter', bodyWeight: 'Körpergewicht', height: 'Größe',
    yourName: 'Dein Name', photo: 'Foto', yrs: 'J.', machineSetup: 'Geräte-Einstellung', seatBarHeight: 'Sitz-/Stangenhöhe',
    addSetting: '+ Einstellung', lastSession: 'Letzte Einheit', usedIn: 'Verwendet in', howTo: 'Anleitung', close: 'Schließen',
    dropGif: 'GIF oder Videobild hinzufügen', startPos: 'Startposition', endPos: 'Endposition', videoLink: 'Video-Link',
    pasteUrl: 'Video-URL einfügen', cues: 'Hinweise', setup: 'Einstellung', newExercise: 'Neue Übung', name: 'Name',
    takePhoto: 'Foto aufnehmen',
    addCue: '+ Hinweis hinzufügen', cuePlaceholder: 'Worauf du achten willst', editHowTo: 'Anleitung bearbeiten',
    remove: 'Entfernen', dragReorder: 'Zum Sortieren ziehen',
    resetExercise: 'Auf das Original zurücksetzen',
    exampleEx: 'z. B. Schrägbank-Kabelzug', muscleGroup: 'Muskelgruppe', equipment: 'Gerät', cancel: 'Abbrechen', save: 'Speichern',
    createNamed: '„{name}“ anlegen',
    back: '‹ Zurück', backRoutines: '‹ Routinen', addExercise: 'Übung hinzufügen', addExerciseBtn: '+ Übung hinzufügen',
    startRoutine: 'Diese Routine starten', holdDeleteRoutine: 'Zum Löschen halten',
    exercise: 'Übung', sets: 'Sätze', reps: 'Wdh.', logging: 'Aufzeichnung',
    unitKg: 'kg', unitSec: 'Sek.', unitKm: 'km', unitMin: 'Min.',
    measure: 'Was ein Satz ist', measureLoad: 'Gewicht × Wdh.', measureTime: 'Gewicht × Sekunden',
    measureDistance: 'Distanz × Minuten', measureDuration: 'Nur Minuten',
    measureHint: 'Nur Minuten ist für alles ohne Sätze — eine Kletter-Session, ein Spiel, ein Kurs.',
    measureFixed: 'Beim Anlegen festgelegt — eine Änderung würde alles bereits Aufgezeichnete entwerten.',
    lastTime: 'Letztes Mal', addSet: 'Satz hinzufügen', sameAsLast: 'Wie letztes Mal', next: 'Weiter ›', nextExercise: 'Nächste Übung', discard: 'Verwerfen',
    setLabel: 'Satz {n}', markUp: 'Schwerer', markDown: 'Leichter', markOk: 'Genau richtig', markNote: 'Notiz',
    markNoteLabel: 'Notiz an dich selbst', markNotePlaceholder: 'Was du dir fürs nächste Mal merken willst',
    markLastTime: 'Letztes Mal · {t}', markClear: 'Nochmal tippen entfernt die Markierung',
    addNote: '+ Notiz',
    holdAddSet: 'Für einen neuen Satz halten', startNow: 'Jetzt starten', restLeftLabel: 'Pause · {t}',
    holdNext: 'Für die nächste Übung halten',
    // Satz durchgehend, wie überall sonst: Dropsatz, Supersatz, „Direkt nach
    // Satz 3“. Reduktionssatz wäre korrekter und sagt niemand.
    holdAddDrop: 'Für einen Dropsatz halten', addDrop: '+ Dropsatz',
    dropAfter: 'Drop aus Satz {n} — keine Pause',
    dropLabel: 'Drop aus Satz {n}',
    holdRemoveSetDrops: 'Satz mit Drop zum Entfernen halten',
    holdRemoveSetDropsN: 'Satz mit {n} Drops zum Entfernen halten',
    linkLabel: 'Direkt nach Satz {n}', linkSub: 'Keine Pause dazwischen.',
    superset: 'Supersatz', supersetRound: 'Supersatz · Runde {n} von {m}',
    noRestFrom: 'Keine Pause — direkt von {name}',
    pairNext: 'Supersatz mit der nächsten Übung', unpair: 'Koppelung lösen',
    emptySessionNote: 'Noch keine Übungen — füg die erste hinzu und trag ein, was du machst.',
    removeExercise: 'Übung entfernen',
    holdRemoveSet: 'Zum Entfernen halten',
    buddyLeftNote: '{name} hat die Verbindung getrennt — du machst allein weiter.',
    holdFinish: 'Zum Beenden halten',
    finishWorkout: 'Training beenden', completedToday: 'Heute erledigt', startAgain: 'Nochmal starten', agoToday: 'heute',
    finish: 'Fertig', saved: 'Gespeichert', edit: 'Bearbeiten', editDone: 'Fertig', language: 'Sprache', muscleGroups: 'Muskelgruppen',
    addGroup: '+ Gruppe hinzufügen', addEquipment: '+ Gerät hinzufügen', all: 'Alle', rest: 'Frei', restDay: 'Ruhetag',
    restNote: 'Genieß deinen Tag in vollen Zügen.',
    addAsYouGo: 'unterwegs ergänzen', freeSession: 'Freies Training', newRoutine: 'Neue Routine',
    exCount: 'Übungen', exCountOne: 'Übung', setCount: 'Sätze', setCountOne: 'Satz',
    ofSets: 'von', setsWord: 'Sätze', thisMonth: 'Diesen Monat', volume: 'Volumen',
    time: 'Dauer', loggedMonth: 'diesen Monat erledigt', unscheduled: 'nicht geplant', bodyweight: 'Körpergewicht',
    dayDone: 'Erledigt — Einheit aufgezeichnet.', dayPlannedPast: 'Geplant, nicht aufgezeichnet.',
    dayFree: 'Nichts geplant. Du kannst jederzeit frei trainieren.', addDetails: 'Trag deine Daten unten ein',
    // Wiederholung, nicht „Repeat“; die Zahl entscheidet zwischen jeden/alle.
    nothingPlanned: 'Nichts geplant', planWorkout: '+ Training planen', planTitle: 'Training planen',
    planRestore: 'Zurückholen', planLogged: 'erledigt', planWorkoutField: 'Training', planRepeats: 'Wiederholung',
    repOnce: 'Einmal', repDays: 'Tage', repWeeks: 'Wochen',
    repUnitDay: 'Tag', repUnitDays: 'Tage', repUnitWeek: 'Woche', repUnitWeeks: 'Wochen',
    repEveryDay: 'Jeden Tag', repEveryDays: 'Alle {n} Tage',
    repEveryWeek: 'Jede Woche', repEveryWeeks: 'Alle {n} Wochen',
    repFrom: 'ab {date}',
    planScope: 'Gilt für', planScopeDay: 'Nur diesen Tag', planScopeRule: 'Jede Wiederholung',
    planScopeDayNote: 'Nur {date} ändert sich — die Wiederholung bleibt.',
    planScopeRuleNote: 'Jede Wiederholung ändert sich, ab {date}.',
    planHoldRemove: 'Halten zum Entfernen',
    planHoldRemoveDay: 'Halten zum Entfernen — nur dieser Tag',
    planHoldRemoveRule: 'Halten zum Entfernen — jede Wiederholung',
    planPickFirst: 'Wähl ein Training', alsoToday: 'Heute außerdem:',
    savedNote: 'Für {date} gespeichert. Beim nächsten Mal stehen diese Zahlen unter „letztes Mal“.',
    savedEmpty: 'Nichts abgehakt — nichts gespeichert.', ok: 'Fertig',
    // Zwilling zu savedEmpty, im anderen Tempus — siehe den englischen Block
    finishLogsNothing: 'Nichts abgehakt — beenden speichert nichts.',
    // composed after lastDone ('zuletzt …'), so each carries its own 'vor'
    // where German needs one — 'heute' and 'gestern' take none
    daysAgo: 'vor {n} Tagen', oneDayAgo: 'gestern',
    /* — die Hinweise — siehe den englischen Block */
    tipDrag: 'Zieh ein Feld hoch oder runter',
    tipDragSub: '0,5 kg oder eine Wdh. pro Raste — je schneller du ziehst, desto größer die Sprünge. Die meisten Sätze brauchen nie die Tastatur.',
    tipTick: 'Die Box ist der ganze Knopf',
    tipTickSub: 'Ein Fingertipp hakt den Satz ab. Nochmal tippen nimmt ihn zurück.',
    tipGhost: 'Tipp die Zahlen von letztem Mal an',
    tipGhostSub: 'Sie landen in den Feldern — ändern kannst du sie weiterhin.',
    tipRest: 'Die Pause läuft schon',
    tipRestSub: 'Sie steht auf dem Satz, der als Nächstes dran ist. „Jetzt starten“ kürzt sie ab.',
    tipMark: 'Sag, wie der Satz war',
    tipMarkSub: 'Tipp + Notiz unter einem abgehakten Satz an — schwerer, leichter, passt, oder ein paar Worte. Nächstes Mal steht’s da.',
    tipSwipe: 'Wisch zur nächsten Übung',
    tipSwipeSub: 'Oder öffne den Chip oben und spring zu jeder beliebigen.',
    tipChip: 'Hinter dem Chip liegt das ganze Training',
    tipChipSub: 'Spring zu jeder Übung, füg eine dazu oder beende das Training.',
    tipHold: 'Gestrichelt heißt halten',
    tipHoldSub: 'Ein Fingertipp reicht hier nicht. Lässt du früh los, passiert nichts.',
    tipStrip: 'Tipp einen Tag an',
    tipStripSub: 'Planen, verschieben oder freinehmen.',
    tipSearch: 'Such nach Muskeln, nicht nur nach Namen',
    tipSearchSub: '„Rücken“ findet auch die Routinen mit Kreuzheben.',
    tipPlan: 'Der Kalender ist der Plan',
    tipPlanSub: 'Tipp einen Tag an: planen, verschieben oder freinehmen. Eine Regel läuft, bis du sie änderst.',
    tipStats: 'Alles hier wird nur gelesen',
    tipStatsSub: 'Es sind deine aufgezeichneten Einheiten, ausgezählt. Nichts einzurichten, nichts zu pflegen.',
    dismissTip: 'Weiß ich schon',
    tips: 'Hinweise',
    tipsAgain: 'Hinweise wieder anzeigen',
    tipsAgainHint: 'Die kurzen Hinweise, die Gesten zeigen, wenn du ihnen zum ersten Mal begegnest.',
    tipsSeen: '{n} von {m} gesehen',
    /* — Statistik & Coach — siehe den englischen Block */
    statsTitle: 'Statistik & Coach',
    regionChest: 'Brust', regionBack: 'Rücken', regionShoulders: 'Schultern',
    regionArms: 'Arme', regionCore: 'Rumpf', regionLegs: 'Beine',
    statsHeadWeak: '{muscle}: {n} Sätze pro Woche — nötig sind {min} bis {max}.',
    statsHeadEven: 'Alles im Bereich. {region} führt mit {n} Sätzen pro Woche.',
    statsFootSessions: '{n} Einheiten', statsFootSession: '1 Einheit',
    statsFootVolume: '{kg} kg bewegt',
    statsEmpty: 'Zeichne ein paar Einheiten auf — Stärken, Schwächen und Coach erscheinen dann hier.',
    statsEvenMark: 'gleichmäßig',
    thousandSep: '.',
    /* — Insights — siehe den englischen Block */
    insights: 'Insights',
    insightsSub: '{days} Tage trainiert · {n} Einheiten',
    period8w: '8 Wochen', period6m: '6 Monate', period12m: '12 Monate',
    insightsBalance: 'Muskelbalance', insightsBalanceHint: '% der Sätze, sekundäre Muskeln zählen halb · gestrichelt = gleichmäßig',
    insightsWeak: 'Zu wenig', insightsWeakNone: 'Jeder Muskel liegt im Bereich. Bleib dran.',
    insightsPushPull: 'Drücken : Ziehen', insightsPush: 'Drücken', insightsPull: 'Ziehen',
    insightsRatio: '1 : {n}',
    insightsPerWeek: '{n} / Woche', insightsShort: '{n} zu wenig', insightsBand: 'Bereich {min}–{max} pro Woche',
    insightsLow: 'wenig',
    insightsVolume: 'Volumen', insightsVolumeHint: 'nur Gewicht',
    bucketWeek: 'pro Woche', bucket2Week: 'pro 2 Wochen', bucket4Week: 'pro 4 Wochen',
    insightsFavourites: 'Favoriten',
    favExercise: 'Übung', favSession: 'Einheit',
    favLogged: '{n}× aufgezeichnet', favSessions: '{n} Einheiten',
    insightsFact: 'Zum Angeben',
    insightsCardio: 'Cardio', insightsCardioNone: 'keine Einheiten',
    insightsEmpty: 'In diesem Zeitraum ist nichts aufgezeichnet.',
    insightsLoose: '{n} Sätze liegen außerhalb dieser sechs — Cardio, Ganzkörper und deine eigenen Gruppen.',
    statsFactVolume: '{kg} kg bewegt — etwa {thing}.',
    statsFactDistance: '{km} km zurückgelegt — etwa {thing}.',
    factWashingMachine: '{n} Waschmaschinen', factPiano: '{n} Flügel',
    factCar: '{n} Autos', factElephant: '{n} Elefanten',
    factBus: '{n} Doppeldeckerbusse', factJet: '{n} Jumbo-Jets',
    factMarathon: '{n} Marathons', factChannel: '{n} Ärmelkanal-Durchquerungen',
    factGermany: '{n}× die Länge Deutschlands', factSahara: '{n} Sahara-Durchquerungen',
    /* — Coach — siehe den englischen Block */
    coach: 'KI-Coach', coachSub: 'Baut einen Prompt aus deinen letzten {period}',
    coachGoalHead: 'Woran soll der Plan arbeiten?',
    coachWeekHead: 'Einheiten pro Woche', coachGearHead: 'Verfügbare Geräte',
    coachNoteHead: 'Sonst noch was?',
    coachNotePlaceholder: 'z. B. Zweiwochenblock, jeden zweiten Tag, explosive Grundübungen',
    coachShareHead: 'Mit der KI teilen',
    coachShareBalance: 'Muskelbalance & Schwachstellen', coachShareLifts: 'Wichtige Übungen & Verlauf',
    coachShareProfile: 'Deine Daten', coachShareProfileSub: 'Alter · Gewicht · Größe',
    coachPrivacy: 'Dein Tagebuch verlässt das Handy nie — nur der Prompt auf dem nächsten Bildschirm.',
    coachWeakPreselect: 'Aus deinen Daten: {list} hinken hinterher.',
    coachCreate: 'Prompt erstellen',
    goalWeak: 'Schwachstellen angehen', goalStrength: 'Kraft aufbauen', goalMuscle: 'Muskelaufbau',
    goalCardio: 'Cardio & Kondition', goalMobility: 'Beweglichkeit & Mobilität',
    goalBalanced: 'Rundum ausgewogen',
    goalWeakAsk: 'Bring meine Schwachstellen auf das Niveau des Rests.',
    goalStrengthAsk: 'Mach mich bei den Hauptübungen stärker.',
    goalMuscleAsk: 'Baue Muskelmasse auf.',
    goalCardioAsk: 'Verbessere meine Ausdauer und Kondition.',
    goalMobilityAsk: 'Verbessere meine Beweglichkeit und Mobilität.',
    goalBalancedAsk: 'Trainiere meinen ganzen Körper gleichmäßig.',
    promptTitle: 'Dein Prompt', promptShare: 'An KI-App senden…',
    promptShareHint: 'Öffnet das Android-Teilen-Menü — Gemini, Claude, ChatGPT oder alles, was Text nimmt.',
    promptHaveAnswer: 'Ich habe die Antwort › Import',
    promptIntro: 'Du bist ein erfahrener Trainer für Krafttraining. Unten stehen echte Daten aus meinem Trainingstagebuch. Empfiehl mir Übungen und Routinen für mein Ziel.',
    promptGoalHead: 'MEIN ZIEL', promptWeek: '{n} Einheiten pro Woche.', promptGear: 'Geräte: {gear}.',
    promptAnyGear: 'was ich habe',
    promptBalanceHead: 'MUSKELBALANCE', promptBalanceUnit: '% der Sätze, ein sekundärer Muskel zählt halb',
    promptWeakHead: 'Im Rückstand:', promptBandNote: 'Sätze pro Woche; {min}–{max} wäre der Bereich',
    promptCardioHead: 'Cardio:', promptCardioNone: 'gar keine Einheiten.',
    promptCardioSome: '{n}, {km} km.',
    promptLiftsHead: 'WICHTIGE ÜBUNGEN', promptLiftNew: 'zum ersten Mal', promptLiftFlat: 'unverändert',
    promptLiftUp: '{kg} kg', promptLiftE1rm: 'gesch. 1RM {kg} kg',
    promptAboutHead: 'ÜBER MICH', promptNoteHead: 'AUSSERDEM',
    promptRulesHead: 'REGELN FÜR DEINE ANTWORT',
    promptRule1: '1. Erkläre kurz, was ich ändern soll und warum.',
    promptRule2: '2. Danach GENAU EIN Codeblock mit dem Tag spotter, in exakt dieser Form:',
    promptRuleMeasure: 'measure ist eines von: {list}',
    promptRuleGroup: 'group muss eines davon sein: {list}',
    promptRuleKind: 'equipment muss eines davon sein: {list}',
    // Volle Imperative, wie überall im Prompt; „Supersatz“ und „Dropsatz“ sind
    // die Wörter, die die App selbst benutzt.
    promptRuleWith:
      'Zwei Übungen, die ohne Pause direkt hintereinander kommen, sind ein Supersatz: setze bei der ersten der beiden "with": "next". Sonst lass das Feld weg.',
    promptRuleDrop:
      'Für Dropsätze gibt es hier kein Feld — die mache ich direkt in der App. Wenn du welche willst, schreib in die Erklärung, bei welchen Sätzen.',
    promptRuleReuse: 'Bevorzuge Übungen, die ich schon habe: {list}',
    promptRuleFile:
      'Wenn du Dateien anhängen kannst, hänge den Block zusätzlich als plan.json an — ein Fingertipp darauf öffnet Spotter mit dem fertigen Plan. Schicke den Block auf jeden Fall auch in der Nachricht.',
    promptRule3: '3. Schließe nach dem Block mit genau diesen Schritten ab:',
    promptStep1: '   1. Halte diese Nachricht gedrückt, tippe auf Teilen und wähle Spotter.',
    promptStep2: '   2. Spotter öffnet sich mit dem Plan und zeigt eine Vorschau.',
    promptStep3: '   3. Kein Teilen-Menü? Kopiere die Nachricht und füge sie in Spotter › Profil › Statistik & Coach › Import ein.',
    importTitle: 'Import', importPaste: 'Die ganze Antwort der KI hier einfügen',
    importPasteHint: 'Füge die gesamte Nachricht ein — Spotter findet den Plan darin.',
    countRoutine: '{n} Routine', countRoutines: '{n} Routinen',
    countExercise: '{n} Übung', countExercises: '{n} Übungen',
    countSession: '{n} Einheit', countSessions: '{n} Einheiten',
    countRule: '{n} Regel', countRules: '{n} Regeln',
    importFound: '{r} · {e} gefunden',
    importNew: '{n} neu', importInLibrary: 'vorhanden', importNewTag: 'neu',
    importNoBlock: 'In diesem Text ist kein Plan. Achte darauf, die ganze Antwort der KI zu kopieren, samt Codeblock.',
    importBadJson: 'Der Plan-Block ist da, aber sein JSON ist kaputt. Lass die KI den Block noch einmal senden.',
    importBadShape: 'Dieser Block ist kein Spotter-Plan. Bitte die KI, das Format aus dem Prompt einzuhalten.',
    importDo: '{r} · {e} importieren',
    importDoNothing: 'Nichts ausgewählt',
    importShowReply: 'Antwort der KI zeigen ›',
    importDiscard: 'Plan verwerfen',
    importDropped: '{n} übersprungen — dort steht eine Übung, die es hier nicht gibt und die nirgends definiert ist.',
    importGuessed: 'Die KI nennt eine Muskelgruppe oder ein Gerät, das es hier nicht gibt — einsortiert unter {group} / {kind}.',
    importDuplicate: 'du hast schon eine mit diesem Namen',
    getRecommendations: 'Empfehlungen holen ›',
    buddy: 'Trainingspartner', buddySub: 'Öffnet das Teilen auf beiden Handys, wählt einander aus, vergleicht den Code — dann trainiert ihr dieselbe Session zusammen.',
    invite: 'Session teilen', inviteShort: 'Einladen', nearby: 'Teilen in der Nähe', searching: 'Suche…',
    shareHint: 'Nur wer das Teilen auch geöffnet hat, taucht hier auf.',
    authTitle: 'Kopplung bestätigen', inviteSent: 'Einladung gesendet',
    authShowHint: 'Zeig {name} diesen Code zum Koppeln.',
    authEnterHint: 'Gib den Code ein, der auf {name}s Handy steht.',
    authWrong: 'Falscher Code — schau nochmal.', authConfirm: 'Bestätigen', linkLost: 'Verbinde neu…',
    connected: 'Verbunden', disconnect: 'Trennen', dividerHint: 'leer lassen für eine Trennlinie', trainingWith: 'trainiert mit dir',
    thisWeek: 'Diese Woche', seePlan: 'Plan ansehen',
    saveAsRoutine: 'Als neue Routine speichern', routineSaved: 'In deinen Routinen gespeichert.',
    loggedSessions: 'Aufgezeichnet', withBuddy: 'mit {name}',
    noDetail: 'Aufgezeichnet, bevor dieses Handy die einzelnen Sätze behalten hat.',
    nameRoutine: 'Name der Routine',
    noRoutines: 'Noch nichts Eigenes — nimm eine aus der Sammlung oder erstell deine eigene mit + Neu.',
    noResults: 'Nichts passt zu dieser Suche.',
    // — Routinen-Tab: Steuerung und die mitgelieferte Sammlung —
    searchRoutines: 'Suche — Name, Übung, Muskel',
    sortWeek: 'Woche', sortRecent: 'Zuletzt', sortAZ: 'A–Z',
    famStrength: 'Kraft', famCal: 'Calisthenics', famCardio: 'Cardio', famYours: 'Deine',
    hiddenBySearch: '{n} von {m} — die Suche blendet den Rest aus.',
    hiddenByFilter: '{n} von {m} — der Filter blendet den Rest aus.',
    fullCollection: 'Ganze Sammlung',
    collectionSub: 'Die mitgelieferten Routinen — füg eine hinzu und sie gehört dir.',
    recommendedFor: 'Empfohlen · {style}',
    onYourList: 'auf deiner Liste',
    recently: 'Zuletzt',
    buddySync: 'Partner-Sync', sync: 'Sync', connectingTo: 'Verbinde mit {name}…',
    syncDemoNote: 'Demo-Übertragung — noch verlässt nichts dieses Handy.',
    // 'Handy', never 'Gerät', for the phone — 'Gerät' is this app's word for
    // equipment, and the sync sheet shows both meanings on one screen.
    missingHere: 'Fehlt auf deinem Handy', missingThere: 'Fehlt bei {name}',
    transferAll: 'Alle übertragen', transferOne: 'Übertragen', addedMark: 'Hinzugefügt', sentMark: 'Gesendet',
    // „Angekommen“, nicht „Erhalten“ — the mark answers "did it land?", and
    // arriving is what a thing sent across the room does.
    receivedMark: 'Angekommen',
    inSync: 'Alles synchron.',
    typeGroup: 'Gruppe', typeKind: 'Gerät', typeExercise: 'Übung', typeRoutine: 'Routine',
    nearbyDevice: 'Handy in der Nähe',
    trainTogether: 'Zusammen trainieren?', inviteBody: '{name} startet {routine}.',
    join: 'Mitmachen', notNow: 'Jetzt nicht',
    pairedBuddies: 'Gekoppelt', buddyNearby: 'In der Nähe', buddyAway: 'Nicht in der Nähe',
    requestSession: 'Training anfragen', forgetBuddy: 'Diesen Partner vergessen',
    rejoinWorkout: 'Wieder einsteigen',
    askSent: '{name} gefragt — warte auf Antwort…', askDeclined: '{name} sagt: gerade nicht',
    joinAskTitle: 'Darf ich mitmachen?', joinAskBody: '{name} möchte bei {routine} mitmachen.',
    joinAskIdleBody: '{name} möchte mit dir trainieren.',
    letThemIn: 'Reinlassen', letsTrain: 'Los geht’s',
    stPending: 'Warte, bis {name} beitritt…', stJoining: 'Synchronisiere mit {name}…',
    stDeclined: '{name} ist diesmal nicht dabei',
    stLost: 'Verbindung weg — suche {name}…', stFinished: '{name} ist fertig',
    stWaiting: '{name} wartet auf dich', stAhead: '{name} ist weiter', stBehind: '{name} hängt hinterher',
    stBothDone: 'Beide fertig — bereit für die nächste Übung',
    yourTurn: 'Dein Satz', theirTurn: 'Satz von {name}', together: 'Macht ihn zusammen',
    theirRest: 'Pause von {name} · {t}',
    myRest: 'Deine Pause · {t}',
    modeAlternate: 'Abwechselnd', modeParallel: 'Parallel',
    whoFirst: 'Wer fängt an', firstHost: 'Starter', firstRandom: 'Zufall', firstAsk: 'Fragen',
    whoFirstHint:
      'Entscheidet, wenn ihr bei einer Übung gleichauf seid. „Zufall“ wirft einmal pro Übung die Münze; „Fragen“ überlässt es euch beiden und wirft sie sonst doch.',
    // Not 'Wer fängt an?' — that is the *setting* above; this is the live question.
    whosUp: 'Wer ist dran?', bidMine: 'Ich', bidTheirs: 'Du',
    jumpTo: 'Zu {ex}',
    addTheirs: '{ex} hinzufügen',
    ovTheirsOnly: 'In {name}s Session, nicht in deiner',
    planSynced: 'Synchron mit {name}', planDiffers: 'Auf {name}s Handy anders',
    planMissing: 'Noch nicht auf {name}s Handy',
    backToWorkout: 'Zurück zum Training', workoutRunning: 'Training läuft',
    liveSession: 'Live-Session', me: 'Du',
    about: 'Über die App', version: 'Version', buildName: 'Build-Name', buildKind: 'Variante',
    buildStandalone: 'Standalone · voller Routine-Import', buildSim: 'Expo Go · Sim-Radio',
    buildDemo: 'Expo Go · Demo-Übertragung', expoSdk: 'Expo SDK',
    sessionsLogged: 'Aufgezeichnete Einheiten', copyright: '© {year} calkoh',
    privacyPolicy: 'Datenschutz ›', openSource: 'Open-Source-Lizenzen ›',
    buildTogether: 'Zusammen erstellen', buildTogetherSub: 'mit {name} — ihr fügt beide Übungen hinzu',
    buildingWith: 'Gemeinsam mit {name} · live',
    draftLegend: 'Sätze geteilt · Wdh. und kg sind deine',
    buddyPickingEx: '{name} wählt eine Übung aus…',
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
    hapticsHint: 'Vibriert kurz, wenn ein Satz abgehakt ist und wenn die Pause um ist — und schwerer, wenn du etwas löschst.',
    restAlertLabel: 'Benachrichtigen, wenn die Pause endet',
    restAlertHint: 'Erreicht dich auch bei gesperrtem Bildschirm oder in der Tasche. Die Benachrichtigung verschwindet von selbst, sobald du die App wieder öffnest.',
    restOverTitle: 'Pause vorbei', restOverBody: 'Dein nächster Satz steht an.',
    restAlertChannel: 'Pausen-Timer',
    planAlertLabel: 'An geplanten Tagen erinnern',
    planAlertHint: 'Eine Benachrichtigung zur Uhrzeit unten, an Tagen, an denen dein Plan ein Training vorsieht. Nichts an Ruhetagen, und nichts mehr, sobald du es aufgezeichnet hast.',
    planAlertTime: 'Uhrzeit der Erinnerung',
    planAlertHour: 'Stunde', planAlertMinute: 'Minute',
    planAlertChannel: 'Geplantes Training',
    sessionChannel: 'Laufendes Training', sessionOngoing: 'Training läuft — zurück per Fingertipp.',
    privacy: 'Privatsphäre', trainAlone: 'Allein trainieren',
    trainAloneHint:
      'Blendet alles rund um Trainingspartner aus und schaltet das Radio ab. Wer gekoppelt ist, bleibt gespeichert.',
    data: 'Daten',
    exportBackup: 'Backup exportieren',
    exportHint: 'Diese Listen, deine Routinen und jede aufgezeichnete Einheit als eine Datei, die du woanders aufbewahrst.',
    importBackup: 'Backup wiederherstellen',
    importHint: 'Ersetzt alles auf diesem Handy durch den Inhalt einer Backup-Datei.',
    backupFailed: 'Das Backup konnte nicht geschrieben werden.',
    diagLabel: 'Diagnose',
    diagHint:
      'Zeichnet auf, was die App tut — Einheiten, Pausen, die Verbindung zum Partner —, damit sich ein Problem hinterher ansehen lässt. Keine Sätze, Gewichte oder Notizen.',
    diagFolder: 'Ordner für Protokolle',
    diagFolderNone: 'Noch keiner — wähl, wo das Protokoll landet.',
    diagFolderSet: 'Protokolle landen in {folder}.',
    diagSave: 'Protokoll jetzt sichern',
    diagSaveHint: 'Nach jedem Training landet eine Kopie im Ordner — das hier ist die dazwischen.',
    diagSaved: 'Als {file} gesichert.',
    diagSaveFailed: 'In den Ordner ließ sich nicht schreiben — wähl ihn neu.',
    diagClear: 'Protokoll leeren',
    diagClearHint: 'Wirft das bisher Aufgezeichnete weg. Sonst wird nichts angerührt.',
    diagCleared: 'Das Protokoll ist leer.',
    restoreFailed: 'Diese Datei ist kein Spotter-Backup.',
    restoreNewer: 'Dieses Backup stammt aus einem neueren Spotter — aktualisier erst die App, dann stell es wieder her.',
    restoreDone: 'Wiederhergestellt — {c} aufgezeichnet.',
    restoreBody:
      'Beim Ersetzen werden Routinen, Übungen und aufgezeichnete Einheiten auf diesem Handy überschrieben. Das lässt sich nicht rückgängig machen.',
    restoreGo: 'Wiederherstellen',
    restoreAskTitle: 'Was soll zurückkommen?',
    restoreFrom: 'Backup vom {date}.',
    restorePartSessions: 'Aufgezeichnete Einheiten',
    restorePartLibrary: 'Routinen & Übungen',
    restorePartPlan: 'Plan',
    restoreNoneNew: 'nichts Neues',
    restoreAdd: 'Ergänzen, was fehlt',
    addOnlyMissing:
      'Ergänzt nur, was auf diesem Handy fehlt. Nichts davon wird hier überschrieben.',
    restoreAllHere: 'Alles aus diesem Backup ist schon auf diesem Handy.',
    holdReplace: 'Zum Ersetzen halten',
    mergeDone: 'Ergänzt: {s}, {r}, {e} und {p}.',
    mergeNothing: 'Nichts zu ergänzen — es war schon alles da.',
    intakeDoneTitle: 'Aus deinem Backup',
    intakeTitle: 'Nichts zu importieren',
    intakeUnknown: 'Diese Datei enthält weder ein Spotter-Backup noch einen Trainingsplan.',
    intakeUnreadable:
      'Diese Datei konnte nicht gelesen werden. Wenn sie aus einem Chat kam, öffne sie dort noch einmal.',

    /* — Onboarding — */
    obWelcomeKicker: 'Willkommen', obAppName: 'Spotter',
    obTagline: 'Ein Trainingstagebuch, das dir nicht im Weg steht.',
    obWelcomeSub: 'Zwei Minuten zum Einrichten — und nichts davon ist endgültig, jede Antwort findest du später in den Einstellungen.',
    obGetStarted: 'Los geht’s', obSkipSetup: 'Einrichtung überspringen', obContinue: 'Weiter',
    obHowTitle: 'So funktioniert’s',
    obHowSub: 'Zwei Dinge, die man einem Bildschirm nicht ansieht.',
    // die ersten drei Karten sind die tip*-Strings — siehe den englischen Block
    obFeatBuddy: 'Trainiere zu zweit',
    obFeatBuddySub: 'Zwei Handys, eine Session, nebeneinander. Kein Konto, kein Internet.',
    // der Partner-Rundgang — siehe den englischen Block
    obBuddyTitle: 'Zu zweit trainieren',
    obBuddySub: 'Zwei Handys im selben Studio, eine Session dazwischen. Per Bluetooth — kein Konto, kein Internet, nichts auf einem Server.',
    obBuddyPair: 'Einmal koppeln',
    obBuddyPairSub: 'Ihr öffnet beide Profil › Trainingspartner, wählt euch aus der Liste und vergleicht den Code. Danach finden sich die beiden Handys von allein.',
    obBuddyStart: 'Einer startet, der andere kommt dazu',
    obBuddyStartSub: 'Wer eine Routine startet, fragt den anderen mit — und umgekehrt genauso. Ein Ja, und dieselbe Session steht auf beiden Bildschirmen.',
    obBuddyLive: 'Die Session hält euch im Takt',
    obBuddyLiveSub: 'Wer dran ist, wie lange seine Pause noch läuft, jeder Satz auf beiden Handys abgehakt. Abwechselnd oder parallel — mitten im Training umstellbar.',
    obBuddyNote: 'Routinen und Übungen lassen sich mitschicken, und trennen kann jeder von euch jederzeit. Was du gehoben hast, bleibt deins: Sätze, Notizen und Verlauf gehen nie rüber.',
    obBuddyAsk: 'Was es dafür braucht',
    obSkipAlone: 'Überspringen — allein trainieren',
    obYouTitle: 'Du',
    obYouSub: 'Damit deine Seite einer gemeinsamen Session einen Namen trägt. Alles bleibt auf diesem Handy.',
    obSkipForNow: 'Später',
    obPermsTitle: 'Eine Sache braucht dein Okay',
    obPermsSub: 'Optional. Spotter funktioniert auch ohne — dir fehlt dann nur genau das eine, und in den Einstellungen lässt es sich später einschalten.',
    obPermRadio: 'Trainingspartner',
    obPermRadioWhy: 'Android fragt nach „Geräten in der Nähe“ — auf älteren Handys zusätzlich nach dem Standort, den die Bluetooth-Suche früher brauchte. Beides nutzt Spotter für nichts anderes.',
    obPermRadioNo: '„Allein trainieren“ ist an: alles rund um Partner ist ausgeblendet und das Radio bleibt aus. Lässt sich in den Einstellungen jederzeit wieder einschalten.',
    obPermNotif: 'Pausen-Erinnerung',
    obPermNotifWhy: 'Meldet sich, wenn die Pause um ist und der Bildschirm aus oder eine andere App offen ist.',
    obPermNotifNo: 'Der Countdown läuft trotzdem auf dem Trainingsbildschirm — du musst nur hinschauen.',
    obAllow: 'Erlauben', obAllowed: 'Erlaubt', obDenied: 'Nicht erlaubt',
    obAloneOn: '„Allein trainieren“ ist an',
    obPhotosNote: 'Fotos und Kamera werden erst gefragt, wenn du zum ersten Mal auf einen Foto-Platz tippst — vorher gibt es keinen Grund dafür.',
    obSkipAlert: 'Überspringen — keine Erinnerung',
    obStyleTitle: 'Wie trainierst du?',
    obStyleSub: 'Das entscheidet nur, was zuerst kommt. Nichts wird versteckt — die ganze Bibliothek ist immer einen Fingertipp entfernt.',
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
    obLevelNewSub: 'Nie richtig trainiert — oder noch mal ganz von vorn.',
    obLevelSome: 'Schon mal trainiert',
    obLevelSomeSub: 'Du kennst die Übungen. Zurück nach einer Pause.',
    obLevelReg: 'Trainiere regelmäßig',
    obLevelRegSub: 'Du kennst deine eigenen Zahlen.',
    obLevelPreview: 'Deine erste Einheit würde vorschlagen',
    obLevelNote: 'Jede Zahl bleibt änderbar — das hier entscheidet nur, wo sie anfangen.',
    obPickTitle: 'Womit anfangen',
    obPickSub: 'Ausgewählt für {style}. Nimm den Haken raus bei allem, was du nicht willst — bearbeiten kannst du sie später sowieso.',
    obShowAll: 'Alles zeigen', obHideRest: 'Rest ausblenden', obEverythingElse: 'Alles andere',
    obAddRoutines: '{n} Routinen übernehmen', obAddRoutine: '1 Routine übernehmen',
    obAddNone: 'Ohne Routinen weiter',
    obWeekTitle: 'Deine Woche',
    obWeekSub: 'Leg sie auf Tage — oder lass es leer und starte einfach, worauf du an dem Tag Lust hast.',
    obWeekPool: 'Deine Routinen',
    obWeekDrag: 'Halt eine Routine gedrückt und zieh sie auf einen Tag. Der Plan-Tab kann das später auch.',
    obWeekPoolEmpty: 'Nichts ausgewählt — geh einen Schritt zurück, wenn du etwas platzieren willst.',
    obWeekRemind: 'Eine Erinnerung an diesen Tagen',
    obPlanAlertNo: 'Dein Plan steht trotzdem — Heute und der Plan-Tab zeigen ihn. Nur meldet sich von allein nichts.',
    obSkipNoPlan: 'Überspringen — kein fester Plan',
    // der Coach-Rundgang — siehe den englischen Block
    obCoachTitle: 'Der KI-Coach',
    obCoachSub: 'In Spotter steckt keine KI. Spotter schreibt den Prompt, du bringst ihn zu der KI, die du ohnehin nutzt, und Spotter liest die Antwort wieder ein.',
    obCoachRead: 'Er liest deine letzten acht Wochen',
    obCoachReadSub: 'Muskelbalance, was hinterherhinkt, wie sich deine wichtigsten Übungen entwickelt haben. Du wählst das Ziel und was mitgeht — und siehst den ganzen Prompt, bevor er das Handy verlässt.',
    obCoachSend: 'Schick ihn, wohin du willst',
    obCoachSendSub: 'Das Android-Teilen-Menü — Gemini, Claude, ChatGPT, alles, was Text nimmt. Das Tagebuch selbst verlässt das Handy nie.',
    obCoachBack: 'Hol die Antwort zurück',
    obCoachBackSub: 'Teil die Antwort zurück nach Spotter oder füg sie ein. Du bekommst eine Vorschau der Routinen und Übungen — hinzugefügt wird nur, was du abhakst.',
    obCoachNote: 'Er braucht ein paar aufgezeichnete Einheiten, bevor er etwas zu sagen hat. Zu finden unter Profil › Statistik & Coach.',
    obDoneTitle: 'Fertig.',
    obDoneSub: '{name}dein Tagebuch ist eingerichtet und leer — genau so soll es anfangen.',
    obDoneRoutines: 'Routinen', obDoneDays: 'Geplante Tage', obDoneEx: 'Übungen',
    obDoneNote: 'Muskelgruppen, Geräte, Pausenlänge, Farben und das Partner-Radio findest du in den Einstellungen.',
    obStartTraining: 'Training starten',
    /* — Einstellungen — */
    dangerHead: 'Von vorn',
    rerunSetup: 'Ersteinrichtung noch einmal ausführen',
    rerunSetupHint:
      'Die Willkommenstour: Profil, Berechtigungen, Trainingsstil und die Start-Routinen. Speicherst du dort eine Routinen-Auswahl, ersetzt sie die mitgelieferten Routinen auf diesem Handy — selbst erstellte und alles Aufgezeichnete bleiben unberührt.',
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

/**
 * '13 August 2026' / '13. August 2026' — a backup's date.
 *
 * The year is in and the weekday is out, which is the opposite of every other
 * formatter here: the others date something that happened this week, where a
 * backup can be two years old and which Tuesday it was written on is nothing
 * anybody needs.
 */
export const fmtDateYear = (lang: Lang, d: Date) =>
  lang === 'de'
    ? `${d.getDate()}. ${MONTHS.de[d.getMonth()]} ${d.getFullYear()}`
    : `${d.getDate()} ${MONTHS.en[d.getMonth()]} ${d.getFullYear()}`;

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

/** The stepper's unit word, which follows its number: 'week' / '2 weeks'. */
export const repeatUnit = (L: Strings, unit: 'day' | 'week', n: number) =>
  unit === 'day'
    ? n === 1
      ? L.repUnitDay
      : L.repUnitDays
    : n === 1
      ? L.repUnitWeek
      : L.repUnitWeeks;

/**
 * A rule in a phrase: 'Every week · Wed', 'Every 3 days', 'Once'.
 *
 * The one formatter every surface prints — the Plan row pills, the sheet's
 * sentence, the Routines card's days line and the routine editor's. Three
 * screens describing one rule in three phrasings is the bug this pre-empts.
 */
export const repeatLabel = (r: Repeat, L: Strings, lang: Lang): string => {
  if (r.unit === 'once') return L.repOnce;
  const n = Math.max(1, Math.round(r.n) || 1);
  if (r.unit === 'day')
    return n === 1 ? L.repEveryDay : L.repEveryDays.replace('{n}', String(n));
  const every = n === 1 ? L.repEveryWeek : L.repEveryWeeks.replace('{n}', String(n));
  const days = [...r.dows].sort((a, b) => a - b).map((d) => DAYS_SHORT[lang][d]);
  return days.length ? `${every} · ${days.join(' · ')}` : every;
};

/**
 * The same rule with its anchor: 'Every week · Thu — from Thu 20 August'.
 *
 * The anchor is what makes an every-third-day rule readable at all, which is
 * why the sheet states it under the control rather than leaving it implied.
 */
export const repeatSentence = (r: Repeat, from: string, L: Strings, lang: Lang) => {
  const date = fmtDayShort(lang, fromISO(from));
  return r.unit === 'once'
    ? `${L.repOnce} — ${date}`
    : `${repeatLabel(r, L, lang)} — ${L.repFrom.replace('{date}', date)}`;
};
