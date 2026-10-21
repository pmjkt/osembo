# Osembo: setup from zero (web + Android app)

Start to finish takes about 45 minutes. Do the parts in order, A to F.

## How the pieces fit

| Piece | Job |
|---|---|
| **GitHub** (your account) | Stores the files. Builds and hosts the web page and the Android app for free. |
| **Supabase** (your account) | The database and the logins. It does not host the page. |
| **config.js** | One small file where you type your Supabase address, key and admin email. |

Teachers only ever use your web address. On an Android phone that page has a **Download Osembo.apk** button. They never see your GitHub or Supabase.

---

## A. Supabase: create the database

1. Go to **supabase.com > Start your project** and sign up.
2. **New project**. Give it the name `osembo`, make up a database password and save it somewhere, choose the region closest to Kenya (for example **eu-west** or **ap-south**), click **Create new project**. Wait 2 minutes.
3. Left menu **SQL Editor > New query**. Open `supabase-setup.sql`, copy everything, paste it, click **Run**. It should say "Success".
4. Left menu **Authentication > Sign In / Providers > Email**: turn **OFF** "Allow new users to sign up". Save.
5. **Authentication > Users > Add user > Create new user**. Enter the admin's email and a password. Tick **Auto Confirm User**. Click **Create user**. (Creating the user yourself is simpler than the invite email.)
6. Get your two settings and keep this tab open:
   - Click the **Connect** button at the top of the project. Copy the **Project URL** (looks like `https://abcdxyz.supabase.co`).
   - **Settings > API Keys**. Copy the **Publishable key** (starts with `sb_publishable_`). If you only see a "Legacy" tab with an `anon` key, that works too. Never use the `secret` or `service_role` key in the app.

## B. GitHub: create the repository

1. Create a free account at **github.com**.
2. Top right **+ > New repository**. Name: `osembo`. Choose **Public** (free web hosting needs Public). Click **Create repository**.
3. Unzip this project. On the empty repo page click **uploading an existing file**.
4. Open the unzipped folder, select **everything inside it** and drag it onto the page. Do not drag the folder itself. You should see: `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, `package.json`, `capacitor.config.json`, `make_icons.py`, `README.md`, `supabase-setup.sql`, and the folders `.github`, `signing`, `supabase`.
5. Click **Commit changes**.
6. Open the repo and check that **`.github/workflows/publish.yml`** is there. If the `.github` folder is missing (some computers hide it), create it by hand: **Add file > Create new file**, type the name `.github/workflows/publish.yml` (typing `/` makes folders), paste the file contents, click **Commit changes**.

## C. Fill in config.js

1. In the repo click **config.js**, then the **pencil** icon (Edit).
2. Between the quotes type:
   - `SB_URL`: the Project URL from step A6.
   - `SB_KEY`: the Publishable key from step A6.
   - `ADMIN_EMAIL`: the admin email from step A5. Same spelling.
   - `WEB_URL`: leave empty for now. You fill it in step E.
3. Click **Commit changes**.

## D. Turn on the web page and the Android app

1. Repo **Settings > Pages**. Under **Build and deployment > Source** choose **GitHub Actions**.
2. Open the **Actions** tab. A run called **Build and publish** builds the web page and the Android app together. If nothing is running, click it in the left list, then **Run workflow**. Wait for the green tick (about 10 minutes the first time).
3. Your web address is **`https://YOURNAME.github.io/osembo/`** (YOURNAME is your GitHub username, in lowercase). Open it. You should see the Osembo login screen.
4. If you instead see "Osembo setup is not finished", config.js has an empty or mistyped value. Fix it, commit, wait for the green tick.

## E. Tell Supabase and the app your web address

1. Supabase **Authentication > URL Configuration**: set **Site URL** to your web address. Under **Redirect URLs** click **Add URL** and add the same address.
2. In GitHub edit **config.js** again and put the web address in `WEB_URL`, for example `"https://yourname.github.io/osembo/"`. Commit. (Password-reset emails use it, and the Android app needs it.)
3. After the next green tick, open the web address and log in with the admin email and password.

## F. Add teachers

1. Log in as admin. Menu (☰) > **Admin settings > Class teachers**. Tap **Rename / email** on a teacher, enter their name and email, Save.
2. Supabase **Authentication > Users > Add user > Create new user** with the same email and a password. Tick **Auto Confirm User**.
3. Give the teacher the web address, their email and password. They can change the password with **Forgot password** on the login screen.
4. Each teacher sees only their own class.

## What teachers do

Send teachers your web address. On an Android phone the login page shows **Download Osembo.apk**. They tap it, open the downloaded file and allow **Install unknown apps** when asked. Or they skip the app and tap **⋮ > Install app** in Chrome. iPhone: Safari > Share > **Add to Home Screen**.

Updating later: change a file in GitHub. After the green tick the web version is new for everyone. For the Android version teachers download the app again from the same page and install it over the old one. Their data stays, because it lives in Supabase.

If the Android build fails (red cross on the `apk` step), the web page still publishes. Open the failed run, click the red step and send me the last lines of the error.

## Before real students are added

- Admin settings > **Year & data > Clear demo students**.
- Download a backup now and then (**Year & data > Download backup**).
- Subscription: the SQL gives the school 1 month. To extend by hand: Supabase **Table Editor > `subscriptions` > `osembo-main`** > change `paid_until`. Access ends on that date.
- Student data is personal data under Kenya's Data Protection Act, 2019. Keep the school's written agreement on file.

## G. M-Pesa renewal (optional, do last)

Needs a Safaricom Daraja account and approval for Lipa na M-Pesa Buy Goods on your till. Start in **sandbox**.

1. Daraja: create an app, copy the **Consumer Key** and **Consumer Secret**, and get the **Passkey** for your shortcode.
2. Supabase **Edge Functions > Secrets**, add: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_TILL` (your till number), `MPESA_ENV` (`sandbox`, later `production`), `SUBSCRIPTION_PRICE` (for example `1000`), `ADMIN_EMAIL` (the admin email).
3. **Edge Functions > Deploy a new function > Via Editor**. Name `mpesa-pay`, paste `supabase/functions/mpesa-pay/index.ts`, deploy.
4. Second function `mpesa-callback`, paste `supabase/functions/mpesa-callback/index.ts`. In its settings turn **OFF "Enforce JWT verification"**, then deploy. (M-Pesa cannot send a login token.)
5. Test: Admin settings > **Renew subscription** > phone number > **Renew for 1 month**.

The app shows the till number set as `TILL` near the top of the script in `index.html`. Change it there if your till is different.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Osembo setup is not finished" | config.js has an empty or mistyped Supabase address or key. Edit it in GitHub, commit, wait for the green tick. |
| "Wrong email or password" | Supabase > Authentication > Users: is the email there? Reset the password there if needed. |
| "This account is not set up for Osembo" | Admin settings > the teacher > **Rename / email**: the email must match the Supabase user exactly. |
| "Subscription has expired" | Supabase > Table Editor > `subscriptions` > set `paid_until` to a future date. |
| Reset email opens the wrong page | Redo step E (Site URL, Redirect URLs, `WEB_URL`). |
| Page shows an old version | Close and reopen the app once while online. |
| Download button gives "file not found" | The Android build did not finish. Open the Actions run and send me the error. |
| Actions run is red | Open it, click the red step, send me the last lines of the error. |

## Known limits

- The data is one record per school. The app shows each teacher only their class, but staff can see all classes at database level. Splitting into per-class tables with database rules is the next planned upgrade.
- The Android app is signed with a shared debug key kept in `signing/`. That is fine for sharing the APK from your own page. The Google Play Store needs a proper release key.
