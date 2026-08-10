SMALL GAMES PROTOTYPE LAB v0.1
================================

RECOMMENDED HOST: GITHUB PAGES

This folder is a complete static website. It needs no server code, database,
framework, or build process.

THE RESULTING ADDRESS
---------------------
If your GitHub username is chillkek02 and the repository is named:

small-games-prototype-lab

your test address will normally be:

https://chillkek02.github.io/small-games-prototype-lab/

FIRST-TIME SETUP
----------------
1. On GitHub, create a NEW PUBLIC repository named:
   small-games-prototype-lab

2. Extract this ZIP.

3. Upload every extracted file and folder to the root of that repository.
   Keep the directory structure intact.

4. In the repository, open:
   Settings -> Pages

5. Under "Build and deployment":
   Source: Deploy from a branch
   Branch: main
   Folder: /(root)

6. Press Save.

7. Wait a few minutes. GitHub will show the public site address in Pages settings.

ADDING THE ACTUAL GAME BUILDS
-----------------------------
Every game has its own folder:

games/01-grave-swarm/
games/02-starbore/
games/03-patchwork/
games/04-mimic/
games/05-dungeon-drop/
games/06-wildcards/
games/07-scrap-run/
games/08-last-line/
games/09-grid-siege/

Inside every folder is an index.html placeholder.

Replace that index.html with the latest complete HTML build of that game.
The replacement file MUST be named index.html.

Example:
- Download Scrap_Run_v4.html.
- Rename it index.html.
- Put it in games/07-scrap-run/.
- Upload/commit the changed file to GitHub.

WINDOWS HELPER
--------------
Run:

Add Game Build.bat

It asks which prototype you are updating, opens a file picker, and copies the
selected HTML into the correct game folder as index.html.

After updating files in a cloned Git repository, run:

Publish Lab Updates.bat

or use GitHub Desktop to commit and push.

TESTER FEEDBACK
---------------
The landing page stores each tester's ratings in their own browser localStorage.

The tester can press:
COPY FEEDBACK REPORT

and send the copied report by text, email, or chat.

This is intentionally local-only. It does not collect personal data on a server.

PRIVACY
-------
GitHub Pages is a public website. This package includes noindex instructions to
discourage search engines, but anyone with the URL can open it.

For password-protected or invited-only testing, use itch.io Restricted access
instead. GitHub Pages is recommended here because it creates one fast, permanent
link for the whole internal prototype library.

QR CODE
-------
After the Pages URL is live, generate one permanent QR code pointing to the lab
home page. That QR code never needs to change when games are updated.
