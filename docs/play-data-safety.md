# Play Console — Data safety answers

The Data safety form is a separate declaration from the privacy policy, and Play
checks the two against each other and against what the APK actually does. These
are the answers for Spotter as it stands, with the reason for each, so that a
future change can be checked against a stated position rather than re-derived.

**The whole form is short for one reason:** the app makes no network requests at
all. Data safety asks about data *collected* (sent off the device to you or a
third party) and data *shared* (passed to a third party). Data that never leaves
the device is neither, and the form says so explicitly.

## The headline answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | n/a — nothing is collected |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app export, plus clear data / uninstall |
| Data types collected | **none** |
| Data types shared | **none** |

## Why "no", item by item

- **No account, no server, no backend.** There is nothing for data to be
  collected *into*.
- **The profile holds health-adjacent data, and the answer is still "no".**
  Age, bodyweight, height and sex are stored, all optional and all entered by
  hand. Data safety asks about data *collected* — sent off the device — and
  none of it is: the only routes out are the coach prompt, behind a switch that
  is off by default and which shows the full text before it is sent, and a
  backup file the user exports themselves. Both are user-initiated transfers
  through the Android share sheet, which Play's guidance excludes. **Sex was
  added on 26 August 2026** and changes none of this; it is recorded here
  because it is the most sensitive field in the app and the next person to read
  this form will look for it.
- **No analytics, no ads, no advertising ID, no crash reporting.** No third-party
  SDK in the app contacts a server.
- **The buddy link is device-to-device.** Data safety's "shared" means
  transferred to a *third party*. A direct Bluetooth/Wi-Fi Direct transfer to
  another user's phone, initiated by the user, is not a transfer to a third
  party — it is the feature the user asked for, in the same sense that a share
  sheet is not "sharing" under this form. Nearby Connections is Google Play
  services; that layer is Google's own.
- **The AI coach and backup export are user-initiated transfers via the Android
  share sheet.** Play's own guidance excludes data the user explicitly hands to
  another app through a system sharing mechanism.
- **Location is declared, never used.** `ACCESS_FINE_LOCATION` /
  `ACCESS_COARSE_LOCATION` are capped at `maxSdkVersion` and exist only because
  Android 12 and earlier required them for any nearby-device scan; the Bluetooth
  scan is `neverForLocation`. **The Permissions declaration will ask about this**
  — answer that the permission is present solely as a legacy prerequisite for
  Nearby Connections and no location data is accessed.

## Two declarations that will need writing separately

Neither is part of the Data safety form, and both are asked at submission:

1. **`USE_EXACT_ALARM`.** Play requires the app's core function to depend on
   precise timing. The case: a rest timer between sets is the app's central
   in-workout function, must fire at the second with the screen off, and an
   inexact alarm would fire late enough to change the training. Note that the
   alternative — `SCHEDULE_EXACT_ALARM` with a user-granted permission — is a
   fallback if the declaration is refused.
2. **`FOREGROUND_SERVICE_SPECIAL_USE`.** The most-scrutinised foreground service
   type. The declared subtype is already in
   `modules/expo-session-service/android/src/main/AndroidManifest.xml`. The
   honest alternative is `connectedDevice`, which Android 14 gates behind a
   *granted* Bluetooth runtime permission that a solo lifter will not hold — that
   trade-off is the argument to make in the declaration, and the fallback if
   `specialUse` is refused is to use `connectedDevice` when the permission is
   held and `specialUse` otherwise.

## Also required before the listing goes live

- The privacy policy at a public URL (`docs/privacy-policy.md`, and
  `docs/datenschutz.md` for the German listing).
- A postal address in both policies — still a placeholder.
- Ads declaration: **contains no ads**.
- Content rating questionnaire.
- Target audience: adults; not directed at children.

## If this ever changes

Adding crash reporting, analytics, cloud sync or Play Billing all change the
first table. Billing in particular introduces a purchase record held by Google —
still not collected *by the app*, but the form's questions about it must be
answered afresh rather than assumed to carry over.
