# Spotter — Privacy Policy

**Effective:** 22 August 2026 · **Applies to:** the Spotter Android application

## The short version

Spotter has no servers, no accounts and no analytics. It makes no network
connections of its own — none. Everything you log stays in the app's private
storage on your phone until *you* send it somewhere, and there are exactly
three ways to do that, each one a deliberate action described below.

## Who is responsible

Calvin Kohl
<!-- REQUIRED before publishing: a postal address. German law (DDG/§5 TMG) and
     GDPR Art. 13 both require a real one for an app distributed in Germany. -->
[postal address]
kohl.calvin@gmail.com

## What Spotter stores on your device

All of it lives in the app's private storage and in the app's own document
folder. None of it is transmitted anywhere by the app.

- **Your training diary** — finished sessions with their date, duration, sets,
  weights, reps, and any verdicts or notes you attached to a set.
- **Your library and plan** — routines, custom exercises, muscle-group and
  equipment lists, machine-setup notes, and your dated plan rules.
- **Your profile** — a display name, and optionally age, bodyweight and height.
  All free text, all optional.
- **Photos you add** — a profile picture and any reference images you attach to
  an exercise. Copied into the app's own folder; the originals are untouched.
- **Settings** — language, theme, rest length, notification preferences.
- **A device identifier** — a random install id used only so a phone you have
  paired with before is recognised as the same phone. It is not an advertising
  id, it is not sent to us, and it exists only on your device and on the phones
  you have paired with.
- **Pairing secrets** — one random value per paired buddy, so a reconnection can
  prove it is really them.

## What can leave your device, and only when you make it

### 1. Pairing and training with a buddy

Two phones can pair directly over Bluetooth and Wi-Fi Direct using Google's
Nearby Connections. There is no Spotter server in between and nothing is
uploaded anywhere.

**What is exchanged:** your display name, your install id, your library
(muscle groups, equipment, custom exercises, routines), and — during a shared
workout — live session progress: which sets are ticked, how much rest is left,
and the turn settings.

**What is never exchanged:** your training history, the notes and verdicts you
write on a set, your age, bodyweight or height, your photos, your settings, and
your diagnostics log.

Nearby Connections is part of Google Play services. That layer is Google's, and
Google's privacy policy governs it.

The buddy half can be switched off entirely in Settings ("Train alone"), which
stops the radio rather than hiding the buttons.

### 2. Exporting or sharing a backup

You can export your data to a file and send it wherever you like. The file
contains your diary, library, plan and settings — not a workout in progress.
Once you have shared it, the app you shared it with governs it.

### 3. The AI coach

Spotter can write a training prompt for you to send to a chat AI. It has no API
key and makes no request of its own: the prompt is shown to you in full, and you
choose the receiving app from the Android share sheet.

**The prompt contains:** a summary of your training (volume, muscle-region
balance, key lifts), the names in your exercise library, and your answers about
goal, sessions per week and available equipment. **Your age, bodyweight and
height are included only if you switch that option on** — it is off by default,
and the prompt is displayed before you send it so you can see exactly what it
says.

Once the prompt leaves Spotter, the app you sent it to and the AI provider
behind it govern what happens to it, under their own terms. Choose one you
trust.

### 4. The diagnostics log (off by default)

If you switch it on, Spotter records app events — a buddy link going up or down,
an alarm being scheduled, a session starting or ending — with timestamps. The
log contains your display name and your buddy's, and a shortened install id, so
that two phones' logs can be lined up against each other. **It contains no
training data:** no set, weight, rep, or note is ever written to it. It stays in
the app's storage unless you pick a folder to export it to.

## Permissions, and why each one exists

- **Bluetooth (scan / advertise / connect) and Nearby Wi-Fi devices** — required
  by Android for the phone-to-phone buddy link. The Bluetooth scan is declared
  `neverForLocation`.
- **Location, on Android 12 and older only** — older Android versions require it
  before any app may scan for nearby devices. **Spotter does not read, use or
  store your location**, and the permission is not requested at all on newer
  Android versions.
- **Notifications** — the rest timer, and the optional daily plan reminder.
- **Exact alarms** — so a rest timer finishes on time with the screen off.
- **Foreground service and wake lock** — so a workout in progress keeps its clock
  running and its buddy link alive when your phone is in your pocket.
- **Camera and photos** — only when you add a picture yourself.

## What Spotter does not do

No analytics. No advertising and no advertising identifier. No crash reporting.
No tracking of any kind. No third-party SDK that contacts a server. No user
account, and no way to create one. Your data is not sold, shared or profiled,
because it never reaches us in the first place.

## Children

Spotter is not directed at children and does not knowingly collect anything from
them. It collects nothing from anyone.

## Your rights

Under the GDPR you have the right to access, correct, export and erase your
personal data. Because Spotter stores everything locally and holds nothing on a
server, you exercise those rights directly:

- **Access and export** — Settings → Data → export a backup.
- **Erasure** — Android's Settings → Apps → Spotter → Storage → Clear data, or
  simply uninstall the app. Both remove everything permanently.

If you have a question about any of this, write to kohl.calvin@gmail.com.

## Changes to this policy

If this policy changes, the effective date above changes with it and the new
version is published at the same address. A change that affects what leaves your
device will be stated in the app's release notes.
