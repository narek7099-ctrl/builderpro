# BuilderPro in the app stores

The app is a native shell (Capacitor, in `mobile/`) around builderpro-os.com.
Website updates reach the apps right away; a store update is only needed when
the native part changes (new permissions, plugins, icons).

| Store | What ships | Built by |
|---|---|---|
| Apple App Store (iPhone, iPad) | `mobile/ios` | GitHub Actions on a Mac runner, or Xcode on a Mac |
| Mac App Store | the same iPad app, on Apple Silicon Macs | nothing extra: a checkbox in App Store Connect |
| Google Play (Android phones, tablets, Chromebooks) | `mobile/android` | GitHub Actions, or Android Studio |
| Microsoft Store (Windows) | the installable website (PWA) | PWABuilder, no code |

What the apps add on top of the website: push notifications for the bell,
Face ID / fingerprint lock, camera and photo access for job photos, location
for crew clock-in, in-app browser for outside links, and in-app account
deletion. Buying or changing a plan is not offered inside the apps (Apple and
Google require their own billing for that); the app says plans are managed on
the website.

---

## 1. Accounts (you)

1. **Apple Developer Program**: developer.apple.com/programs, $99/year. Enroll as an
   organization. That needs a D-U-N-S number (free, dnb.com); it can take about a week, so start first.
2. **Google Play Console**: play.google.com/console, $25 one time. Enroll as an organization.
3. **Microsoft Partner Center**: partner.microsoft.com, free for individuals (a small one-time fee for companies).
4. **Firebase** (free): console.firebase.google.com. Create a project named BuilderPro. Push
   notifications on Android go through it.

## 2. Push notifications (you, then add the secrets)

Push is already wired end to end: the app registers each phone, and every new bell
notification is sent to that person's phones by the `push-send` function. It stays off until
these secrets exist in **Supabase > Edge Functions > Secrets**:

**Apple**
1. developer.apple.com > Certificates, Identifiers & Profiles > **Keys** > + > tick
   *Apple Push Notifications service (APNs)* > download the `.p8` file (only once!).
2. Add secrets: `APNS_KEY_P8` (the whole text of the .p8 file), `APNS_KEY_ID` (shown next to
   the key), `APNS_TEAM_ID` (top right of the developer site).
3. Identifiers > + > App IDs > Bundle ID **com.builderpro.app**, tick *Push Notifications*.

**Android**
1. Firebase console > Project settings > General > *Add app* > Android, package name
   **com.builderpro.app** > download `google-services.json`. Add its full text as the
   GitHub secret `GOOGLE_SERVICES_JSON` (step 3).
2. Project settings > Service accounts > *Generate new private key*. Add the whole JSON as the
   Supabase secret `FCM_SERVICE_ACCOUNT`.

## 3. Build secrets in GitHub (you)

GitHub > the repo > Settings > Secrets and variables > Actions > *New repository secret*.

**iOS** (App Store Connect API key: Xcode signs the app with it, no certificates to manage)
- appstoreconnect.apple.com > Users and Access > Integrations > App Store Connect API >
  *Generate API Key*, role **App Manager**. Download the `.p8`.
- `ASC_KEY_P8` (text of that .p8), `ASC_KEY_ID`, `ASC_ISSUER_ID`, `APPLE_TEAM_ID`.

**Android** (the upload key; keep a copy somewhere safe, you need it for every update)
- On any computer with Java: `keytool -genkeypair -v -keystore upload.keystore -alias builderpro -keyalg RSA -keysize 2048 -validity 10000`
- `ANDROID_KEYSTORE_BASE64` (the file, base64: `base64 -i upload.keystore`), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` (builderpro), `ANDROID_KEY_PASSWORD`.

Then **Actions > Mobile app > Run workflow**. Android: download the `.aab` from the run.
iOS: the build appears in App Store Connect > TestFlight after Apple processes it (~15 min).

## 4. Store listings (you, with the text below)

**Name:** BuilderPro
**Subtitle (Apple, 30 chars):** Run jobs, crews and customers
**Category:** Business (secondary: Productivity)
**Short description (Google, 80 chars):** Leads, jobs, crews, payments and your customers' project pages in one app.

**Description:**
BuilderPro is the business app for contractors, and the project app for their customers.

For contractors and crews:
• Every lead, call, text and email in one inbox, with an AI receptionist that answers for you
• Jobs, schedules, crews and time clock, with job photos from the camera
• Estimates, contracts with e-signature, invoices and payments
• Instant alerts for new leads, messages, signed contracts and payments

For homeowners:
• Your project's schedule, photos, payments and messages in one place
• Every project from every BuilderPro contractor, saved to one free account
• Find trusted local pros and get quotes

**Keywords (Apple):** contractor,crm,roofing,construction,estimates,invoices,crew,schedule,leads,home improvement
**Privacy policy URL:** https://builderpro-os.com/privacy.html
**Support URL:** https://builderpro-os.com/help.html
**Account deletion:** in the app, Settings > Security > Delete account (contractors) or My projects > Delete my account (homeowners). Web: https://builderpro-os.com/data-deletion.html

**Screenshots:** ready in `docs/store-screenshots/`, six of each, upload in number order:
`iphone-*.png` (6.9", 1320 x 2868), `ipad-*.png` (13", 2064 x 2752), `android-*.png` (1080 x 1920) and
`android-feature-graphic.png` (1024 x 500, Google's banner). Made from the demo account with the business
shown as "Summit Roofing Co"; to remake them after a redesign, ask for "new store screenshots".

**App Review notes (Apple) / App access (Google)** — give the reviewer a demo login, for example
a test contractor account and the homeowner test account, and say:
> BuilderPro is a business tool for contractors (B2B). Accounts and subscriptions are created on
> builderpro-os.com; the app has no purchases. Homeowners use a free account to follow their projects.
> Push notifications, the camera (job photos), location (crew clock-in) and Face ID (optional app lock)
> are used as described in the permission prompts.

**Data safety / privacy labels:** contact info (name, email, phone), user content (photos, messages),
location (crew clock-in, only while in use), identifiers (push token). Not sold, not used for ads.
Data is encrypted in transit; users can delete their account in the app.
Shared with service providers (not sold): AI features send messages, transcripts and photos to Anthropic and
Google (Apple asks you to disclose this: it's in the privacy policy, "AI features"); payments go through Stripe.

## 4b. Links open in the app (after the first store upload)

Estimates, project pages, contracts and invoices are links to builderpro-os.com (`/#est=…`,
`/#home=…`, `/#sign=…`, `/#pay=…`). With the app installed, tapping one opens it in the app, signed
in, so it's saved to the homeowner's account. Two files on the site tell the phones the app may
open those links; both have a placeholder to fill in:

1. **Android:** Play Console > the app > Setup > **App signing** > copy the *SHA-256 certificate
   fingerprint* of the **app signing key**. Put it in `.well-known/assetlinks.json` in place of
   `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`. The intent filter is already in the Android manifest.
2. **iPhone:** your **Team ID** (developer.apple.com > Membership). Put it in
   `.well-known/apple-app-site-association` in place of `REPLACE_WITH_APPLE_TEAM_ID`. Then
   developer.apple.com > Identifiers > com.builderpro.app > turn on **Associated Domains**, and add
   this to `mobile/ios/App/App/App.entitlements` (not added yet, because signing fails until the
   capability is turned on):

   ```xml
   <key>com.apple.developer.associated-domains</key>
   <array><string>applinks:builderpro-os.com</string></array>
   ```

Until then the links open in the browser, which works the same; the page offers the app and a
free account, and a signed-in homeowner gets the link saved either way.

When the store listings are live, put their links in `STORE` at the top of `portal/custlink.js`, so
"Get the app" goes to the store instead of adding the website to the home screen.

## 5. Mac

In App Store Connect > the app > Pricing and Availability, leave **iPhone and iPad Apps on Apple
Silicon Macs** turned on. The iPad version then installs from the Mac App Store. Older Intel Macs
can install the website as an app from Chrome or Edge.

## 6. Windows (Microsoft Store)

1. pwabuilder.com > enter `https://builderpro-os.com` > *Package for stores* > **Windows**.
2. Partner Center > Apps and games > New product > MSIX or PWA app > reserve the name *BuilderPro*.
3. Copy the publisher ID values from Partner Center into PWABuilder, download the package, upload it
   to the submission with the same listing text and screenshots as above.

## Building on your own computer (optional)

```
cd mobile
npm install
npx cap sync
npx cap open ios       # Mac with Xcode: Product > Archive
npx cap open android   # Android Studio: Build > Generate Signed Bundle
```
