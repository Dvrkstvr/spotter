# Spotter — Datenschutzerklärung

**Stand:** 22. August 2026 · **Gilt für:** die Android-App Spotter

<!-- Du-Form, wie in der ganzen App. Rechtlich ist beides zulässig; zwei
     Anreden in einem Produkt wären der Bruch. -->

## Kurz gesagt

Spotter hat keine Server, keine Konten und keine Analyse-Werkzeuge. Die App baut
von sich aus keine einzige Netzwerkverbindung auf. Alles, was du einträgst,
bleibt im privaten Speicher der App auf deinem Handy — bis *du* es woandershin
schickst. Dafür gibt es genau drei Wege, und jeder davon ist eine bewusste
Handlung.

## Verantwortlich

Calvin Kohl
<!-- VOR VERÖFFENTLICHUNG NÖTIG: ladungsfähige Anschrift. § 5 DDG und
     Art. 13 DSGVO verlangen sie für eine in Deutschland vertriebene App. -->
[Anschrift]
kohl.calvin@gmail.com

## Was Spotter auf deinem Handy speichert

Alles davon liegt im privaten Speicher der App und in ihrem eigenen
Dokumentenordner. Nichts davon wird von der App irgendwohin übertragen.

- **Dein Trainingstagebuch** — abgeschlossene Einheiten mit Datum, Dauer, Sätzen,
  Gewichten, Wiederholungen und den Notizen oder Bewertungen, die du an einen
  Satz geschrieben hast.
- **Deine Bibliothek und dein Plan** — Routinen, eigene Übungen, Muskelgruppen-
  und Gerätelisten, Einstellungsnotizen zu Maschinen und deine datierten
  Planregeln.
- **Dein Profil** — ein Anzeigename, wahlweise Alter, Körpergewicht und Größe.
  Alles frei eingegeben, alles freiwillig.
- **Fotos, die du hinzufügst** — ein Profilbild und Referenzbilder zu Übungen.
  Sie werden in den Ordner der App kopiert; die Originale bleiben unberührt.
- **Einstellungen** — Sprache, Farbthema, Pausenlänge, Benachrichtigungen.
- **Eine Gerätekennung** — eine zufällige Installations-ID, die nur dazu dient,
  ein schon einmal gekoppeltes Handy wiederzuerkennen. Sie ist keine Werbe-ID,
  sie wird nicht an uns gesendet, und sie existiert nur auf deinem Handy und auf
  den Handys, mit denen du gekoppelt hast.
- **Kopplungsgeheimnisse** — ein Zufallswert je Partner, damit sich ein Handy
  beim erneuten Verbinden als dasselbe ausweisen kann.

## Was dein Handy verlassen kann — und nur, wenn du es auslöst

### 1. Koppeln und gemeinsam trainieren

Zwei Handys verbinden sich direkt über Bluetooth und Wi-Fi Direct (Google Nearby
Connections). Dazwischen steht kein Spotter-Server, und es wird nichts
hochgeladen.

**Übertragen werden:** dein Anzeigename, deine Installations-ID, deine Bibliothek
(Muskelgruppen, Geräte, eigene Übungen, Routinen) und — während einer gemeinsamen
Session — der laufende Fortschritt: welche Sätze abgehakt sind, wie viel Pause
noch läuft, und die Einstellungen dazu, wer wann dran ist.

**Nie übertragen werden:** dein Trainingsverlauf, die Notizen und Bewertungen zu
deinen Sätzen, dein Alter, dein Gewicht, deine Größe, deine Fotos, deine
Einstellungen und dein Diagnoseprotokoll.

Nearby Connections gehört zu den Google-Play-Diensten. Diese Ebene ist Googles,
und dafür gilt Googles eigene Datenschutzerklärung.

Die ganze Partner-Hälfte lässt sich in den Einstellungen abschalten („Allein
trainieren"). Das schaltet das Funkmodul ab und versteckt nicht bloß Knöpfe.

### 2. Ein Backup exportieren oder teilen

Du kannst deine Daten in eine Datei exportieren und sie schicken, wohin du
willst. Die Datei enthält Tagebuch, Bibliothek, Plan und Einstellungen — kein
laufendes Training. Sobald du sie geteilt hast, gilt für sie die App, an die du
sie geschickt hast.

### 3. Der KI-Coach

Spotter schreibt dir einen Trainings-Prompt, den du an eine Chat-KI schicken
kannst. Die App hat dafür keinen API-Schlüssel und stellt keine eigene Anfrage:
Der Prompt wird dir vollständig angezeigt, und die empfangende App wählst du im
Teilen-Menü von Android selbst aus.

**Im Prompt stehen:** eine Zusammenfassung deines Trainings (Volumen, Verteilung
über die Körperregionen, wichtige Übungen), die Namen aus deiner Übungs-
bibliothek und deine Angaben zu Ziel, Einheiten pro Woche und verfügbaren
Geräten. **Alter, Gewicht und Größe stehen nur dann darin, wenn du die
entsprechende Option einschaltest** — sie ist standardmäßig aus, und der Prompt
wird vor dem Senden angezeigt, damit du genau siehst, was drinsteht.

Sobald der Prompt Spotter verlässt, gelten die Bedingungen der App, an die du ihn
geschickt hast, und die des KI-Anbieters dahinter. Wähl eine, der du vertraust.

### 4. Das Diagnoseprotokoll (standardmäßig aus)

Wenn du es einschaltest, schreibt Spotter App-Ereignisse mit — eine Verbindung,
die auf- oder abgebaut wird, ein geplanter Alarm, eine Session, die beginnt oder
endet — mit Zeitstempeln. Im Protokoll stehen dein Anzeigename und der deines
Partners sowie eine gekürzte Installations-ID, damit sich zwei Protokolle
nebeneinanderlegen lassen. **Trainingsdaten stehen nicht darin:** kein Satz, kein
Gewicht, keine Wiederholung, keine Notiz. Es bleibt im Speicher der App, bis du
einen Ordner zum Exportieren auswählst.

## Berechtigungen und wozu jede einzelne dient

- **Bluetooth (suchen / sichtbar sein / verbinden) und Wi-Fi-Geräte in der Nähe**
  — von Android für die Verbindung zwischen zwei Handys verlangt. Die
  Bluetooth-Suche ist als `neverForLocation` deklariert.
- **Standort, nur unter Android 12 und älter** — ältere Android-Versionen
  verlangen die Berechtigung, bevor eine App überhaupt nach Geräten in der Nähe
  suchen darf. **Spotter liest, nutzt und speichert deinen Standort nicht**, und
  unter neueren Android-Versionen wird sie gar nicht erst angefragt.
- **Benachrichtigungen** — die Pausenuhr und die optionale Planerinnerung.
- **Exakte Alarme** — damit die Pausenuhr auch bei ausgeschaltetem Bildschirm
  pünktlich abläuft.
- **Vordergrunddienst und Wakelock** — damit ein laufendes Training seine Uhr
  weiterzählt und die Verbindung zum Partner hält, während das Handy in der
  Tasche steckt.
- **Kamera und Fotos** — nur dann, wenn du selbst ein Bild hinzufügst.

## Was Spotter nicht tut

Keine Analyse. Keine Werbung und keine Werbe-ID. Kein Absturzbericht. Kein
Tracking. Kein Fremd-SDK, das einen Server kontaktiert. Kein Benutzerkonto, und
auch keine Möglichkeit, eins anzulegen. Deine Daten werden nicht verkauft, nicht
weitergegeben und nicht ausgewertet — sie erreichen uns schlicht nie.

## Kinder

Spotter richtet sich nicht an Kinder und erhebt wissentlich nichts von ihnen. Die
App erhebt von niemandem etwas.

## Deine Rechte

Nach der DSGVO hast du das Recht auf Auskunft, Berichtigung, Datenübertragbarkeit
und Löschung. Da Spotter alles lokal speichert und nichts auf einem Server liegt,
übst du diese Rechte unmittelbar selbst aus:

- **Auskunft und Export** — Einstellungen → Daten → Backup exportieren.
- **Löschung** — Android-Einstellungen → Apps → Spotter → Speicher → Daten
  löschen, oder die App deinstallieren. Beides entfernt alles endgültig.

Bei Fragen dazu: kohl.calvin@gmail.com.

## Änderungen

Ändert sich diese Erklärung, ändert sich das Datum oben mit, und die neue Fassung
steht unter derselben Adresse. Eine Änderung daran, was dein Handy verlässt, wird
zusätzlich in den Release-Notes der App genannt.
