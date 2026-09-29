# Buddy pairing & connection — audit

29 September 2026. Read against `claude/set-row-pass` at `b8373d8`, Spotter 1.4.0,
`play-services-nearby` 19.3.0. No code was changed; this is a reading of what is
there, ranked by how well each finding explains what was seen in the gym.

**The report being answered:** a connection sometimes takes a few restarts of
the app. One phone can request a session; the other does not list the first as
nearby and never gets the request. One phone was on a public Wi-Fi, the other
was not.

Every finding carries one of three confidence labels, and they are not
interchangeable:

- **In the code** — readable off the source, no phone needed to confirm it.
- **Platform** — how Nearby Connections or Android behaves, from Google's
  documentation or the library itself (the 19.3.0 classes were inspected with
  `javap`, so API names and status codes below are exact).
- **Hypothesis** — fits the symptom, cannot be confirmed without a log.

---

## 1. Verdict

**The Wi-Fi is probably not why one phone could not see the other.** Discovery
runs over Bluetooth; neither phone needs to be on a network, let alone the same
one. It is a plausible reason for a link that *forms and then drops*, and there
is a one-line native fix for that regardless (§4).

**What the symptoms do fit is four things in the app's own code, all of which
end in a state only a restart clears:**

| # | Finding | Why a restart "fixes" it |
|---|---|---|
| A1 | A buddy who restarted their app is listed twice, and every request goes to the dead entry | Restarting clears `nearbyPeers` |
| B3 | A handshake that never completes leaves a half-open link with no timeout | Restarting drops every endpoint |
| B1 | A request that fails before trust is retried every 5 s for ever, silently | Restarting clears `buddy` and `joinSent` |
| A3 | Bluetooth off, Location off or a denied permission is retried silently and never shown | It doesn't — but the permission prompt reappears |

And one that no restart clears at all: **B2**, two phones that disagree about
whether they share a pairing secret.

**The log cannot currently tell these apart.** The diagnostics record that a
request went out and that a link came up, and nothing in between — no
connection-failed status, no endpoint ids, no record of a connection being
offered or refused. §5 lists the eight lines that would have answered this
report outright, and they are the first thing to build.

---

## 2. How a link is made today

For reference while reading the findings. Nothing here is a criticism.

```
idle, roster non-empty           both phones: advertise + discover, continuously
A taps "Request session"         requestSession → buddy=B, joinSent=waiting
                                 requestConnection(B.endpointId)
B  onConnectionInitiated         roster + secret held → acceptConnection
A  onConnectionInitiated         same → acceptConnection
both  onConnected                send hello{proof}; buddyEndpoint NOT set yet
both  onPayload hello            proofOk → trust(): authed, buddyEndpoint set,
                                 snapshot out, (A only) joinAsk out
                                 buddyEndpoint set → `active` false →
                                 advertising + discovery stop
B  onPayload joinAsk             JoinAskSheet
```

Three properties of this matter below:

1. **`active` stays true until `trust`**, so both phones are still advertising
   *and* discovering through the whole connection attempt and handshake.
2. **`buddyEndpoint` is only set by `trust`**, so everything keyed on it —
   `dropLink`'s cleanup, the zombie detector's teardown — does nothing for a
   link that fails earlier.
3. **The endpoint id is the address**, and the app holds it in `nearbyPeers`
   for as long as Nearby does not say `onEndpointLost`.

---

## 3. Findings

### A — Being seen

#### A1 · A returning buddy is listed twice and the stale entry wins — **High · in the code**

`onEndpointFound` ([buddy-radio.tsx:442](../src/components/buddy-radio.tsx:442))
replaces an entry with the *same endpoint id* and appends everything else.
Nearby mints a new endpoint id when an app restarts, and `onEndpointLost` for
the old one is late or never comes — a long-standing complaint
([android-nearby#49](https://github.com/googlearchive/android-nearby/issues/49)).
So after the buddy restarts their app the list holds:

```
[{ endpointId: 'AB12', id: <their install id>, name: 'Jonas' },   ← dead
 { endpointId: 'XY34', id: <their install id>, name: 'Jonas' }]   ← live
```

All three places that choose an endpoint take the **first** match:

- the roster row — [you.tsx:238](../src/app/(tabs)/you.tsx:238)
- the reconnect ticker — [buddy-radio.tsx:179](../src/components/buddy-radio.tsx:179)
- (the found-handler requests the id it was just handed, so it alone is right)

So the row says *Nearby*, the tap requests `AB12`, Nearby refuses, the refusal
is swallowed (`.catch(() => {})`, [you.tsx:298](../src/app/(tabs)/you.tsx:298)),
and the ticker re-requests `AB12` every five seconds. The buddy's phone hears
nothing. **This is the finding that best matches "needs a few restarts":** each
restart of the *other* phone adds a dead entry, and only restarting *this* one
clears them.

**Fix.**
- On found, drop every entry with the same install id before appending — the
  newest advertisement is the only one that can be live.
- Choose with `findLast`, as the backstop for id-less peers.
- A request refused with `8011 STATUS_ENDPOINT_UNKNOWN` or
  `8012 STATUS_ENDPOINT_IO_ERROR` evicts that entry.
- After two refused requests in a row, stop and restart discovery. Nearby only
  reports an endpoint once per discovery run, so a restart is the only way to
  be told again who is really there.

#### A2 · Both phones advertise and discover at once, all the way through the connection — **High · platform**

Google's own guidance: *"most forms of discovery entail heavy radio operations
that increase the odds of established connections getting broken"*, and the
recommended pattern is to stop discovery once the peer is found
([discover-devices](https://developers.google.com/nearby/connections/android/discover-devices)).
`stopDiscovery()` does not prevent requesting an endpoint already found.

The app does the opposite: `active`
([buddy-radio.tsx:109](../src/components/buddy-radio.tsx:109)) holds both
running until `trust` sets `buddyEndpoint`, which is *after* the Bluetooth
connection, both accepts and both hellos. The most fragile seconds of the link
are spent with both radios scanning.

The strategy compounds it. `P2P_POINT_TO_POINT` is built for one advertiser and
one discoverer moving a large file; the strategies page only says simultaneous
roles are possible *"if required"*, and says it of Star. Spotter's roster mode
is symmetric by design — every phone is both, all the time.

**Fix, in order of cost.**
1. Stop discovery the moment a request goes out or `onConnectionInitiated`
   arrives; restart it on `onConnectionFailed`, a handshake timeout, or
   `dropLink`. JS only.
2. Try `setLowPower(true)` on both option builders for the idle roster scan. It
   keeps discovery on BLE and off Bluetooth Classic inquiry, which is the heavy
   half. Native, one line each; measure before keeping.
3. Evaluate `P2P_CLUSTER`. It is the strategy designed for peers that all
   advertise and discover, its bandwidth is lower — irrelevant for JSON under
   32 KB — and it has no disruptive Wi-Fi upgrade to go wrong. It costs a guard
   the app does not need today (Cluster allows several links; Spotter wants
   one) and both phones must switch together, because a strategy only finds its
   own kind. **A decision, not a patch** — worth an afternoon with two phones
   before committing.

#### A3 · A radio that cannot start says nothing — **High · in the code + platform**

`kick` ([buddy-radio.tsx:129](../src/components/buddy-radio.tsx:129)) retries a
refused start every five seconds for ever and writes the refusal only to the
diagnostics log, which is off by default. Nothing reaches the screen: the scan
sheet keeps radiating *Searching…*, the roster says *Not nearby*.

The refusals that matter, all present in 19.3.0:

| Code | Meaning | Who it hits |
|---|---|---|
| `8025 MISSING_SETTING_LOCATION_MUST_BE_ON` | System Location toggle is off | Older Android — discovery only |
| `8007 STATUS_BLUETOOTH_ERROR` | Bluetooth off or unsettled | Everyone |
| `8036` / `8037` / `8038` / `8039` / `8029` | A runtime permission is missing | Whoever denied it |

**The Location toggle is the one to look at first**, because it is one-sided in
exactly the reported way: advertising does not need it and discovery does. A
phone with Location off is *seen* by its buddy and *sees nobody*. Calvin's
phone is the old one, and older Android is where the toggle is mandatory.

It also gets worse on its own. Google announced in July 2026 that Nearby will
stop switching Bluetooth and Wi-Fi on by itself, from late 2026, and that apps
must check the radios and ask the user
([Android Developers Blog](https://android-developers.googleblog.com/2026/07/upcoming-changes-nearby-connections-api.html)).
Spotter checks nothing today; a phone with Bluetooth off currently works
because Nearby quietly turns it on.

**Fix.** One transient store field — `radioState: 'ok' | 'permission' |
'bluetooth' | 'location' | 'refused'` — written by `kick` from the rejection's
status code, and one line under the roster heading and in the scan sheet that
says which, with the way out (*Bluetooth is off — turn it on to find your
partner*). It is `finishLogsNothing`'s shape, a permanent statement of what is
true, not a tip. The native module should pass the status code as a field
rather than leave JS to parse it out of `it.message`.

#### A4 · Permissions are re-requested on every flip, and a denial is silent — **Medium · in the code**

`ensureRadioPermissions` runs inside the `active` effect
([buddy-radio.tsx:139](../src/components/buddy-radio.tsx:139)), so it runs
again every time a link drops. While denied-but-askable that is a system dialog
mid-workout; once Android stops asking (`never_ask_again`) it is a radio that
never starts and a UI that never says why. Folds into A3's `radioState`, plus
`PermissionsAndroid.check` first so the dialog only ever follows a tap.

#### A5 · The manifest departs from Google's — **Low · verify**

[AndroidManifest.xml:8](../modules/expo-nearby-buddy/android/src/main/AndroidManifest.xml:8)
puts `neverForLocation` on `BLUETOOTH_SCAN`; Google's published block does not.
And on Android 13+ the app holds no location permission at all, where one
third-party project reports `8034 MISSING_PERMISSION_ACCESS_COARSE_LOCATION` at
discovery start. Neither is known to be wrong here. Both would show as
`discovery refused` in a log from the newer phone, which is a thirty-second
check — do that before changing the manifest, because adding a location
permission moves the privacy policy and `play-data-safety.md`.

---

### B — Getting connected

#### B1 · A request that fails before trust is retried for ever — **High · in the code**

Two handlers clean up after a failed connection, and neither acts on a link
that never reached `trust`:

- `onConnectionFailed` ([buddy-radio.tsx:548](../src/components/buddy-radio.tsx:548))
  clears `pendingAuth` and nothing else. It does not log the status.
- `dropLink` ([buddy-radio.tsx:384](../src/components/buddy-radio.tsx:384))
  patches only when `s.buddyEndpoint === endpointId`, which before `trust` is
  never.

So after *Request session*, `buddy` and `joinSent: waiting` stand, `wantBuddy`
is true, and the ticker re-requests every five seconds with no limit. The asker
reads *Ask sent* indefinitely. The ticker was written to heal a link that was
already agreed; an ask borrows it and inherits its persistence without its
justification.

**Fix.** An ask gets a deadline (30 s) and a failure budget (three refused or
failed attempts). Either ends it as `joinSent: { state: 'failed' }` with its
own line — what happened and the way out, per the copy voice — and clears
`buddy`. The ticker keeps its unlimited patience for the one case that earned
it: `buddy` set *and* no `joinSent`.

#### B2 · Two phones that disagree about the secret cannot recover, and neither is told — **High · in the code**

The secret is held per roster name on each phone independently. They come
apart when one side forgets the other, reinstalls, clears data, switches
signing key (which also changes `ANDROID_ID`, so the install id moves too), or
when the first pairing's `hello` carrying `newToken` is lost — it is sent with
`.catch(() => {})` ([buddy-radio.tsx:581](../src/components/buddy-radio.tsx:581)).
Version skew does the same thing: a build from before the proof lanes
(`5a61b7c`) hashes under the wrong lane and is refused.

Say A holds a secret for B and B holds none for A.

**A asks B.** B's `onConnectionInitiated` finds no secret, is not in share
mode, and rejects ([buddy-radio.tsx:527](../src/components/buddy-radio.tsx:527)).
B's screen shows nothing. A is now in B1's loop. *This is precisely "one user
can request a session and the other never gets it."*

**They try to re-pair through Invite.** This is the documented way out and it
does not work:

1. Both open share mode; B taps A.
2. A holds a secret for B, so A **auto-accepts** and skips the code stage
   ([buddy-radio.tsx:495](../src/components/buddy-radio.tsx:495)) — share mode
   does not override it. B shows the code and confirms.
3. `onConnected`. B treats it as a first pairing: sends `hello` with a new
   token, calls `trust`, sets `buddy`. A treats it as a reconnect: sends
   `hello{proof}` and waits for one back.
4. A receives B's `hello` with no proof → `proof refused` → disconnect.
5. B is left with `buddy` set and a ticker. Its own requests are now rejected
   by its own guard (*own request unprovable*,
   [buddy-radio.tsx:510](../src/components/buddy-radio.tsx:510)) — which only
   clears `buddy` when an ask is waiting, and none is. B loops.

The only exit is A forgetting B by hand, and nothing on either screen says so.

**Fix.**
- **Share mode always goes through the code**, secret or no secret. Two people
  who both opened Invite have asked to pair; an old secret is not a reason to
  skip the question. The confirmed code then re-mints for both.
- **A refused proof is reported, not just logged**: *Your pairing with {name}
  is out of date — pair again from Invite.* One tap to share mode, on both
  phones.
- **`hello` carries a protocol version.** A mismatch says *{name} needs the
  newer Spotter* instead of failing a proof. With two sideloaded phones this is
  the cheapest diagnosis in the whole list.
- The `newToken` hello is acknowledged, and the minter does not keep a secret
  the other side never confirmed.

This is a protocol change: both phones rebuild.

#### B3 · A handshake has no deadline — **High · in the code**

After `onConnected` on a reconnect the phone sends its proof and waits
([buddy-radio.tsx:586](../src/components/buddy-radio.tsx:586)). If the peer's
`hello` never comes — its JS is frozen in the background, it is on an older
build, the payload was lost — nothing ends the wait. The link is up as far as
Nearby is concerned and unknown as far as the app is: `buddyEndpoint` is null,
so `active` is still true and the ticker is still requesting.

`P2P_POINT_TO_POINT` allows one connection. While the half-open one stands,
every further request to anyone is refused, and the app has no code path that
tears it down — `onPayloadFailed` needs sends, and none are made. **The second
finding that a restart clears and nothing else does.**

**Fix.** A ten-second deadline from `onConnected` to `trust`, held beside
`meta`. On expiry: `disconnectFrom`, `dropLink`, one log line.

#### B4 · Nothing knows a request is already in flight — **Medium · in the code**

A Bluetooth connection commonly takes longer than the ticker's five seconds.
The tap, the found-handler and the ticker can each request the same endpoint
while the first attempt is still forming. The expected result is a harmless
`8003`/`8009` refusal, but it is unverified, it is noise on the radio at the
worst moment, and it makes the log unreadable.

**Fix.** One in-flight marker per endpoint, set on request and cleared by
`onConnectionInitiated`'s outcome, `onConnectionFailed`, or 15 s. Every request
goes through one function that respects it — there are currently four call
sites with four different error handlers.

#### B5 · A send that is refused outright does not count against the link — **Medium · in the code**

The zombie detector counts `onPayloadFailed`, which the native module emits
only for a transfer that was accepted and then failed
([NearbyBuddyModule.kt:59](../modules/expo-nearby-buddy/android/src/main/java/expo/modules/nearbybuddy/NearbyBuddyModule.kt:59)).
A send Nearby refuses immediately — `8005 STATUS_NOT_CONNECTED_TO_ENDPOINT` —
rejects the promise instead, and every sender swallows it. So the clearest
possible statement that a link is gone is the one the detector cannot hear.

**Fix.** One `send()` wrapper in `<BuddyRadio>` that every payload goes
through. A rejection counts toward `flaky`; `8005` and `8011` tear down at
once.

#### B6 · The Wi-Fi upgrade is left at its default — **Medium · platform**

See §4. `ConnectionType.NON_DISRUPTIVE` on `AdvertisingOptions` and on a
`ConnectionOptions` passed to `requestConnection`.

#### B7 · Two things about the native module to confirm — **Low · verify**

- `OnDestroy` calls `stopAllEndpoints`
  ([NearbyBuddyModule.kt:199](../modules/expo-nearby-buddy/android/src/main/java/expo/modules/nearbybuddy/NearbyBuddyModule.kt:199)).
  If that fires when the activity is swiped away while the foreground service
  keeps the process and JS alive, JS is left believing in a link and a radio
  that are both gone — and `stopAll` is the call `buddy-radio.ts` already
  documents as never to be made. Worth one deliberate swipe-away with the log
  on. B5 would catch the aftermath either way.
- `client` is a getter that builds a `ConnectionsClient` per call. Believed
  harmless; a `lazy` val removes the question.

---

### C — Once connected

#### C1 · Linked, mid-workout, and no way to share it — **Medium · in the code**

Hosting is decided on one transition: a routine session *starting* while
`buddyEndpoint` is set ([buddy-radio.tsx:214](../src/components/buddy-radio.tsx:214)).
Start thirty seconds before the link heals and the session is solo for good:
*Request session* needs the link down, *Rejoin* needs their shared broadcast,
and a link that is up with a solo session beside it offers neither. The way out
today is Disconnect and ask again.

**Fix.** While linked with an unshared routine session running, the roster row
offers **Invite to this workout** — the existing `sessionInvite`, sent on a tap
rather than on a transition. No protocol change.

#### C2 · "Invite sent" can stick — **Low · in the code**

`sentTo` in the scan sheet resets when `pendingAuth` changes
([scan-sheet.tsx:33](../src/components/overlays/scan-sheet.tsx:33)). A request
that fails before a code stage ever opens changes nothing, so the row stays
disabled and reads *Invite sent* until the sheet is closed. Clear it on
`onConnectionFailed` for that endpoint and on a 15 s timeout.

#### C3 · "Nearby" does not mean "can answer" — **Medium · hypothesis**

Advertising belongs to the process, not to the screen. A phone whose app is in
the background with no session running has no foreground service; Android may
freeze its JS while Nearby goes on advertising for it. The buddy sees *Nearby*,
asks, and the request is accepted by nobody. It would look exactly like the
report — and is the first thing to rule out by asking whether both phones had
Spotter open and on screen.

**Fix.** Stop advertising when `AppState` leaves `active` and no session is
running; start again on return. *Nearby* then means what it says.

#### C4 · A rename is not re-advertised — **Low · in the code**

The name is read once when advertising starts. Harmless to matching, which
goes by install id; the buddy just sees the old name until the radio next
restarts.

---

## 4. The Wi-Fi question

**Could one phone being on a public Wi-Fi stop the other from seeing it?**
Almost certainly not. Discovery is BLE and Bluetooth Classic. A network is not
involved, and two phones on different networks — or none — find each other the
same way.

**Could it break a connection that had started?** Yes, plausibly, and this is
the part worth fixing:

- Nearby connects over Bluetooth and then tries to *upgrade* to Wi-Fi. The
  default, `ConnectionType.BALANCED`, permits it to change the phone's Wi-Fi
  state "only if necessary". On `P2P_POINT_TO_POINT` the upgrade targets are a
  hotspot or Wi-Fi Direct, which can take the phone off the network it was on.
- The upgrade happens in the seconds after connect — the same seconds the
  handshake runs in, with B3's missing deadline behind it.
- A public network adds its own trouble: client isolation blocks the
  phone-to-phone traffic a same-network upgrade would use, so the attempt is
  made and fails.

Spotter sends JSON, the largest of which is a library snapshot under Nearby's
32 KB byte-payload cap. It has no use for the upgrade at all.
`NON_DISRUPTIVE` — *"should not change the device's Wi-Fi or Bluetooth
status"* — is the honest setting, and it is two lines in the native module.

**How to know rather than guess:** override `onBandwidthChanged` in the native
module and log it. If a link drops within a few seconds of a bandwidth change,
that was the Wi-Fi; if no change is ever logged, it never was.

---

## 5. What the log cannot say yet

The diagnostics log exists for exactly this and is missing the lines that
would have answered the report. Every one of these is an event that leaves no
trace in state, which is the module's own test for a `dlog` at the site.

| Line | Where | What it settles |
|---|---|---|
| `endpoint found` `{ endpoint, id, name }` | `onEndpointFound` | A1 — two endpoints, one install id |
| `endpoint lost` `{ endpoint }` | `onEndpointLost` | A1 — whether it ever fires |
| `connection offered` `{ endpoint, incoming, roster, haveSecret, scanning }` | `onConnectionInitiated` | B2 — which branch took it |
| `connection refused by us` `{ why }` | both reject branches | B2 — the silent no |
| `connection failed` `{ endpoint, status }` | `onConnectionFailed` | B1, A1 — `8004` vs `8011` vs `8012` |
| `request out` / `request refused` `{ endpoint, from, err }` | every request site | B4 — `from`: tap, found, ticker, invite |
| `handshake` `{ ms }` and `handshake timed out` | `onConnected` → `trust` | B3 |
| `bandwidth` `{ quality }` | new native event | §4 |
| `radio state` `{ bluetooth, location }` | at each `kick` | A3 |

Two header fields besides: **Android API level** and **Play services version**.
Two phones disagreeing about a link are very often two phones on different
Android versions, and the header is where that belongs.

None of this records training, and endpoint ids are radio addresses that
change per run — nothing here moves the privacy position.

---

## 6. Order of work

Every step needs both phones rebuilt — they are sideloaded, so even a JS-only
change ships as an APK. The grouping is by what *kind* of change it is.

1. **Instrument (§5).** JS, plus one native event for bandwidth. Then train
   once with diagnostics on, on both phones. This alone may name the cause.
2. **The four restart-only states.** A1, B1, B3, B4, B5, C2 — all JS, all in
   `<BuddyRadio>` and the two call sites, no protocol change. One request
   function, one send function, two deadlines, one dedupe.
3. **Say what the radio is doing.** A3, A4 — `radioState`, its two lines of
   copy in both languages, and the status code passed through natively.
4. **Native options.** B6 (`NON_DISRUPTIVE`), A2 step 1 (stop discovery while
   connecting), B7. Small, and independent of everything above.
5. **Protocol.** B2 — version in `hello`, share mode always through the code,
   refusal reported. Both phones together, and a re-pair on first use.
6. **Decide.** A2's low-power scan and `P2P_CLUSTER`, C1, C3. Each is a product
   decision with a cost, not a defect.

---

## 7. Test plan

**On the sim relay** (`npm run start:sim`, two emulators) — everything that is
protocol rather than radio:

| Case | Set-up | Should |
|---|---|---|
| B1 | B forgets A; A asks | End as *failed* within 30 s, ticker quiet |
| B2 | B forgets A; both open Invite | Reach the code stage on both; pair |
| B3 | Relay drops B's `hello` | A tears down at 10 s and is discoverable again |
| B5 | Relay drops the link without a disconnect | A tears down on the first refused send |
| A1 | Relay withholds `lost` when B reconnects | A requests the new id |

B3, B5 and A1 need the relay to misbehave on request — three more console keys
beside `d` and `l`.

**On the two phones** — what only a radio can show. Diagnostics on, one
variable at a time, both logs kept:

| Variable | Values |
|---|---|
| Wi-Fi | both off · both on the same network · one on public Wi-Fi |
| Bluetooth | on · off on one phone |
| Location toggle | on · off on the older phone |
| App state of the asked phone | on screen · in background · screen locked |
| Restart | the asked phone restarted once · three times |
| Distance | side by side · across the gym |

The restart row is A1's: it should fail today after the first restart and pass
after the dedupe.

---

## 8. Read and found sound

So the next reader does not re-audit them:

- **The proof** — digits-bound, direction-laned, never re-sends the secret.
  The gate in `onPayload` holds: nothing but `hello` is honoured before
  `trust`.
- **Message order through the handshake.** `hello` precedes `snapshot`
  precedes `joinAsk` on the sending side, and Nearby keeps byte payloads in
  order, so the receiver has always authenticated before the ask arrives.
- **`sayGoodbye` using `disconnectFrom` rather than `stopAll`**, and the
  reasoning written at it.
- **`parseBuddyMessage`** — every payload rebuilt field by field and capped.
- **The initiator preference** for reconnects. Sound for the heal; B4 is about
  the ask, which never goes through it.
- **Whole-state `progress`** — a reconnect resyncs from one message, as
  designed.
- **Listeners registered once**, reading the store through a ref.

---

## 9. Sources

- [Advertise and discover — Nearby Connections](https://developers.google.com/nearby/connections/android/discover-devices)
- [Strategies — Nearby Connections](https://developers.google.com/nearby/connections/strategies)
- [Get started — Nearby Connections](https://developers.google.com/nearby/connections/android/get-started)
- [Manage connections — Nearby Connections](https://developers.google.com/nearby/connections/android/manage-connections)
- [ConnectionType reference](https://developers.google.com/android/reference/com/google/android/gms/nearby/connection/ConnectionType)
- [Upcoming changes to the Nearby Connections API — Android Developers Blog, July 2026](https://android-developers.googleblog.com/2026/07/upcoming-changes-nearby-connections-api.html)
- [android-nearby#49 — onEndpointLost never called](https://github.com/googlearchive/android-nearby/issues/49)
- [nearby_connections (pub.dev) — Location must be on](https://pub.dev/packages/nearby_connections)
- `play-services-nearby-19.3.0` — `AdvertisingOptions.Builder`,
  `ConnectionOptions.Builder`, `ConnectionType`, `ConnectionsStatusCodes`,
  read from the Gradle cache with `javap`.
