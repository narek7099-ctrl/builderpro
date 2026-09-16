# Meta App Review — submission pack

Everything to paste into the App Review forms, plus what the reviewer is
actually checking. Written against the Graph calls in
`supabase/functions/marketing-oauth/index.ts`. If that file changes, change
this too — a justification that does not match the code is the fastest way
to get rejected.

**Fill in before submitting:** items marked `<<...>>` are yours to supply.

---

## 0. What we request, and what we deliberately do not

We ask for eight permissions across two connect buttons.

| Permission | Graph call that uses it | Where in the product |
|---|---|---|
| `ads_read` | `me/adaccounts`, `<acct>/insights`, `<acct>/campaigns` | Marketing → Ads & Listings |
| `pages_show_list` | `me/accounts` | Choosing which Page to link |
| `pages_read_engagement` | `<page>/insights`, `fan_count` | Social Media → Overview |
| `pages_read_user_content` | `<page>/posts`, `<page>/ratings` | Social Media, Reputation |
| `pages_manage_posts` | `POST <page>/feed`, `POST <page>/photos` | Social Media → Compose |
| `instagram_basic` | `<ig>` profile fields, `<ig>/media` | Social Media → Overview |
| `instagram_manage_insights` | `<ig>/insights` | Social Media → Overview |
| `instagram_content_publish` | `POST <ig>/media`, `POST <ig>/media_publish` | Social Media → Compose |

We do **not** request `ads_management` (we never create or edit a campaign
through the API) or `leads_retrieval` (we never read lead forms). Asking for
either would give the reviewer something they cannot see working.

---

## 1. App details

**App name:** BuilderPro OS

**Category:** Business and pages

**App description**

> BuilderPro OS is a business management platform for residential contractors,
> primarily roofing companies. A contractor signs in to a single dashboard that
> holds their leads, quotes, scheduled inspections, active projects, invoices
> and marketing.
>
> The Marketing area of that dashboard is what uses Meta. A contractor connects
> their own Facebook Page, Instagram business account and ad account, and
> BuilderPro OS then shows their advertising and social performance next to the
> rest of their business numbers, and lets them write and schedule posts to
> those channels from one place instead of logging into each app separately.
>
> Every connection is made by the business owner for their own accounts. We do
> not connect accounts on anyone's behalf and we do not act outside what the
> owner asks for in the product.

**Privacy policy URL:** https://builderpro-os.com/privacy.html

**Terms of service URL:** https://builderpro-os.com/terms.html

**Data deletion instructions URL:** https://builderpro-os.com/data-deletion.html

**Website:** https://builderpro-os.com

---

## 2. Test credentials and how to reach the feature

Give the reviewer a real account with real data in it. An empty account
looks broken and gets rejected.

> **Sign in:** https://builderpro-os.com — click "Client Login" in the top right.
> **Email:** `<<reviewer@builderpro-os.com>>`
> **Password:** `<<password>>`
>
> This is a fully populated demo account for a roofing company. It already has
> contacts, projects and invoices so the Marketing numbers have context.
>
> **To reach the Meta features:**
> 1. After signing in, open **Marketing** in the left sidebar.
> 2. **Ads & Listings** tab — the "Meta Ads" card. Click **Connect** to start
>    the ad-account flow.
> 3. **Social Media** in the left sidebar — the "Facebook & Instagram" card.
>    Click **Connect** to start the Page and Instagram flow.
>
> Both buttons open Facebook's own consent dialog. After granting, you are
> returned to the dashboard and the numbers populate immediately.
>
> **Note:** these are two separate connect buttons on purpose. A contractor who
> only wants to post does not have to hand over ad-account access, and one who
> only runs ads does not have to grant posting rights.

---

## 3. Permission justifications

Paste each into the matching box. Each one follows the same shape, which is
what reviewers want: what we do with it, where it shows up, and why the
feature cannot work without it.

### ads_read

> BuilderPro OS shows a contractor their own Facebook and Instagram ad
> performance inside the same dashboard as their leads, booked inspections and
> revenue, so they can see what their ad spend actually produced.
>
> After the business owner connects their ad account, we call `me/adaccounts`
> to list the accounts they manage, then `<account>/insights` and
> `<account>/campaigns` to read spend, impressions, clicks and conversion
> actions for the last 30 days. These numbers are displayed on the Marketing →
> Ads & Listings tab beside the same figures from Google and Yelp.
>
> We only read. We never create, edit, pause or delete a campaign through the
> API, which is why we are not requesting ads_management. Without ads_read the
> Ads tab has nothing to show and the feature does not exist.
>
> **To test:** sign in, open Marketing, click Connect on the Meta Ads card,
> grant access, and the spend and campaign figures appear on the same page.

### pages_show_list

> A contractor may manage several Facebook Pages. Before we can show stats for
> the right one or post to it, they have to tell us which Page belongs to the
> business they are running in BuilderPro OS.
>
> We call `me/accounts` to list the Pages they manage, and show that list so
> they can pick one. The choice is stored against their BuilderPro OS account
> and can be changed later from the Social Media page.
>
> Without this permission we cannot present a choice, and every other Page
> feature has nothing to point at.
>
> **To test:** sign in, open Social Media, click Connect, grant access. The
> Page picker appears immediately after you return.

### pages_read_engagement

> The Social Media overview shows a contractor how their Page is doing:
> follower count, how many unique people saw their posts, and how many engaged
> in the last 28 days.
>
> We call `<page>?fields=fan_count,followers_count,name,link,picture` and
> `<page>/insights?metric=page_impressions_unique,page_post_engagements`. The
> results are shown as four summary tiles at the top of the Social Media page.
>
> This is the entire value of the overview. Without it a contractor would have
> to open Facebook separately to see whether posting is working, which is the
> exact problem the product solves.
>
> **To test:** sign in, open Social Media, connect a Page. The follower, reach
> and engagement tiles populate on the Overview tab.

### pages_read_user_content

> Two features need to read content on the contractor's own Page.
>
> First, the Social Media page lists their recent posts with each post's reach
> and engagement, so they can see which ones worked. We call `<page>/posts` with
> `insights.metric(post_impressions_unique,post_engaged_users)`.
>
> Second, the Reputation page collects the contractor's reviews from Facebook,
> Google and Yelp into one list so they can respond without checking three
> sites. We call `<page>/ratings` to read the star rating and recent reviews.
>
> We only read content on Pages the connecting user manages. We never read
> other people's Pages and we do not store review text beyond a short cache
> used to render the page.
>
> **To test:** sign in, open Social Media and scroll to Recent posts. Then open
> Marketing → Reputation to see the same Page's reviews.

### pages_manage_posts

> BuilderPro OS includes a posting planner. A contractor writes one update,
> optionally attaches a photo of a finished roof, picks which channels it goes
> to, and either publishes immediately or schedules it. This is the main reason
> contractors use the Social Media feature at all.
>
> When a post is due we call `POST <page>/feed` for text and link posts, or
> `POST <page>/photos` when there is an image.
>
> We only ever publish content the business owner wrote and explicitly
> scheduled. We never generate posts on their behalf, never post without an
> action they took, and nothing is published at connect time.
>
> **To test:** sign in, open Social Media, click Compose, write a short post,
> select the Facebook channel and click Publish now. The post appears on the
> connected Page and in the planner list.

### instagram_basic

> Contractors post to Instagram and Facebook together, so the Social Media page
> covers both. This permission lets us identify the connected Instagram
> business account and show its basics.
>
> We read the Instagram account linked to the connected Page via
> `instagram_business_account`, then read `username, followers_count,
> media_count, profile_picture_url` and the account's recent media through
> `<ig>/media`.
>
> Without it we cannot identify which Instagram account to show or publish to,
> and the Instagram half of the feature cannot function.
>
> **To test:** sign in, open Social Media, connect a Page that has an Instagram
> business account attached. The Instagram tile appears on the Overview tab.

### instagram_manage_insights

> The Instagram half of the Social Media overview shows reach alongside the
> Facebook numbers, so a contractor can compare the two channels in one view.
>
> We call `<ig>/insights?metric=reach` for the trailing period and display it as
> a summary tile next to the Facebook figures.
>
> Without it the Instagram tile can show follower count but not whether posting
> is reaching anyone, which is the number contractors actually act on.
>
> **To test:** sign in, open Social Media. The Instagram reach tile is on the
> Overview tab beside the Facebook tiles.

### instagram_content_publish

> The same planner that posts to Facebook also posts to Instagram, so a
> contractor writes a job update once and sends it to both.
>
> When an Instagram post is due we call `POST <ig>/media` to create the
> container with the image and caption, then `POST <ig>/media_publish` to
> publish it.
>
> As with Facebook, we only publish what the business owner wrote and scheduled
> themselves. Nothing is published automatically or at connect time.
>
> **To test:** sign in, open Social Media, click Compose, write a post, attach
> an image, select the Instagram channel and publish. It appears on the
> connected Instagram account.

---

## 4. Screencast script

Record one video per permission, or one thorough video covering all of them
if the form allows it. Around two to three minutes. No edits, no cuts, no
music, no slides. Screen recording with a cursor.

1. Start on `builderpro-os.com`, signed out. Show the URL bar.
2. Sign in with the reviewer credentials. Show the dashboard.
3. Click into the relevant page (Marketing, or Social Media).
4. Click **Connect**. Let Facebook's consent dialog fill the screen and
   **pause on the permission list long enough to read it.** Reviewers look for
   this frame specifically.
5. Grant. Show the return to BuilderPro OS.
6. Show the data appearing, and point the cursor at the specific number or
   list the permission produces.
7. For posting permissions, write a real post and publish it, then show it on
   the live Facebook Page or Instagram account in another tab.
8. Finally, show **Disconnect** on the same card, to demonstrate the user can
   revoke at any time.

Step 8 is optional but it answers a question reviewers often have, and costs
you ten seconds.

---

## 5. Data handling answers

Expect these in the Data Use Checkup and in review questions.

**Do you sell or transfer Platform Data?**
No. We do not sell, license or transfer any data obtained through the Meta
APIs to any third party, and we do not use it for advertising or profiling.

**Where is it stored?**
Access tokens are stored encrypted at rest in our database and are never
exposed to the browser or to other customers. Metrics and post content are
cached briefly to render the dashboard and are refreshed on each load.

**How long do you keep it?**
Cached metrics are replaced on refresh. Tokens are deleted immediately when a
user clicks Disconnect or removes the app from their Facebook settings. All
data is removed within 30 days of account deletion.

**Who has access?**
Only the connecting business owner sees their own data. Row-level security in
our database scopes every record to its owner. Support staff do not have
standing access to tokens.

---

## 6. What the reviewer is actually checking

Rejections are rarely about your product being wrong. They are about the
reviewer not being able to see the thing working. In rough order of how often
each one sinks a submission:

1. **Can they log in at all?** Broken or expired test credentials is the single
   most common rejection. Test your own credentials in a private window the
   morning you submit.
2. **Can they find the feature without guessing?** If the click path in your
   notes does not match the live site, they stop. Keep the instructions above
   in step with the actual navigation.
3. **Does the video show the consent dialog?** They want to see a real user
   granting the real permission, not a mock-up or a slide describing it.
4. **Does the permission visibly do something?** Each one must produce a
   visible result on screen. A permission you request but never demonstrate is
   rejected, which is why the unused ones were removed from the scope list.
5. **Is the use consistent with what you wrote?** If the justification says
   read-only and the video shows something being created, that is a fail.
6. **Do the policy links work?** They click them. They must load without
   JavaScript, resolve over HTTPS, and mention the data you are asking for.
7. **Is the business verified?** Restricted permissions are not granted to an
   unverified business, regardless of how good the submission is.

A rejection is not a verdict on the app. They tell you which permission failed
and usually why. Fix that one, resubmit, and the rest carry over.

---

## 7. Order of operations

1. Business verification in Meta Business Manager. Everything waits on this.
2. Create the app, add Facebook Login, set the redirect URI.
3. Add yourself and anyone testing as app developers or testers. Full
   permissions work for them immediately, before any review.
4. Build the populated reviewer account and confirm the credentials work.
5. Record the screencasts.
6. Submit all eight permissions together.

**Redirect URI:**

```
https://ttzwzouhiwdwamuimhpo.supabase.co/functions/v1/marketing-oauth
```
