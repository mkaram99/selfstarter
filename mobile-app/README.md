# Photo Search (mobile)

A native iOS/Android app (Expo/React Native) that indexes your phone's photo library, uses
Claude's vision model to write a searchable description of each photo, and lets you search your
photos by what's actually in them — "dog on a beach", "receipt", "birthday cake" — instead of by
filename or manual tags.

## Run it on your phone

You don't need a Mac, an Apple/Google developer account, or App Store review to try this — Expo Go
runs it directly.

1. Install **Expo Go** from the App Store or Play Store on your phone.
2. On your computer:
   ```bash
   cd mobile-app
   npm install
   npx expo start
   ```
3. Scan the QR code that appears with your phone's camera (iOS) or the Expo Go app (Android).
4. On first launch, grant photo library access when prompted.
5. Go to the **Settings** tab and paste in an Anthropic API key (get one at
   [console.anthropic.com](https://console.anthropic.com)).
6. Go to the **Library** tab and tap **Scan library**.

## How it works

- **Library** tab browses your photos directly from the device's photo library — this always
  works, independent of scanning.
- **Scan library** runs in two passes, both resumable if you pause or close the app:
  1. A cheap pass that indexes every photo's id/filename/dimensions into a local SQLite database.
  2. A pass that sends a resized (max 1024px) copy of each not-yet-described photo to Claude,
     storing the description it returns.
- **Search** tab does a plain text match against those stored descriptions.
- Tap into any photo to see, edit, or regenerate its description, and to toggle favorite (which
  updates your actual system photo library, not just this app).

## Cost and scope

Every unscanned photo costs one AI API call the first time it's scanned; after that it's cached
locally and never re-sent. A few thousand photos on the cheaper model (Haiku 4.5, the default) is
typically well under a dollar, but check current pricing at
[anthropic.com/pricing](https://www.anthropic.com/pricing) before scanning a very large library.
Switch to Sonnet 5 in Settings for richer descriptions at higher cost.

## Limitations

- **Foreground only.** Scanning runs while the app is open. This build doesn't include a
  background task, so closing or backgrounding the app pauses the scan — reopen and tap Scan
  library to resume where it left off.
- **API key lives on your device.** The key is stored in the OS secure keychain
  (`expo-secure-store`) and the app calls Anthropic's API directly from your phone — there's no
  backend server holding the key. That's a reasonable tradeoff for a personal app you run yourself
  via Expo Go, but if you ever build and distribute this to other people, move the API call behind
  a backend you control instead of shipping your key inside a distributed app.
- **No cloud sync.** The description index is local SQLite on-device only; reinstalling the app or
  switching devices means re-scanning.
