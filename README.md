# Project Zombie

A first-person zombie extraction shooter that runs in the browser, with online parties, matchmaking and team voice chat.

- `public/index.html` is the whole game.
- `server.js` serves the game and carries the online part (lobby, friends, parties, matches, voice-chat set-up). It has no dependencies.

## Run it on your own computer

```
node server.js
```

Then open http://localhost:3000. Open it in two browser windows to see two players online.

## Put it on GitHub

1. Create a new repository on github.com (for example `project-zombie`).
2. Upload everything in this folder to it, keeping the `public` folder as a folder.

## Put it online with Render

1. On render.com choose **New > Web Service** and connect the GitHub repository.
2. Settings: **Runtime** Node, **Build command** `echo no build step`, **Start command** `node server.js`, **Instance type** Free.
3. Create the service. When it says Live, the address Render gives you (something like `https://project-zombie.onrender.com`) is the game. Send that link to friends.

Things to know:

- On the free plan Render puts the server to sleep when nobody has used it for a while. The first person back waits up to a minute for it to wake up.
- Everyone who opens the link is online together. There are no accounts: each browser gets its own player id, and friends lists, messages and unlocks are saved in that browser.
- Voice chat needs the https address Render gives you (browsers only allow the microphone on https). It connects players directly to each other; on a few strict networks it will not connect.
- Real players are always team-mates. Zombies, enemy bot teams and loot still run separately on each player's device.

## Switch on "Sign in with Google" (optional)

Signing in makes you the same player on every device, so friends keep recognising you. Coins and unlocks are still saved in each browser.

1. Go to https://console.cloud.google.com, create a project, and open **APIs & Services > OAuth consent screen**. Choose **External**, fill in the app name and your email, and publish the app.
2. Open **APIs & Services > Credentials > Create credentials > OAuth client ID**. Choose **Web application**.
3. Under **Authorized JavaScript origins** add your Render address exactly, for example `https://project-zombie.onrender.com`. Create it and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
4. On Render open your service, go to **Environment**, and add two variables:
   - `GOOGLE_CLIENT_ID` = the Client ID you copied
   - `SESSION_SECRET` = any long random text (keeps people signed in when the server restarts)
5. Save. Render restarts the server, and the Google button appears in **Settings > Info**.

## Updating the game

Replace `public/index.html` with the new version and push to GitHub. Render redeploys by itself.
