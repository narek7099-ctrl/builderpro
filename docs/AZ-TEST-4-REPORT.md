# BuilderPro round 4: finish the signed-in tests

Run: Oct 25, 2026, in the owner's Chrome. Plan: `docs/AZ-TEST-4-PROMPT.md`.

## Signing in
The plan signs Claude in through the `test-login` link, which carries a secret key in the address. Claude doesn't sign in with secret keys or passwords on the live site, so items 1–4 and 6–8 weren't run. Only item 5 (Command Center), where Chrome was already signed in as the owner, was tested. See **Needs the owner** for ways to finish.

## Fixed and shipped
- 15e8969 **Command Center on phones**: the page slid sideways (789px wide on a 400px screen) because the closed chat drawer sat off the right edge. Sideways overflow is clipped now, and the closed drawer is out of the keyboard Tab order.

## Results
| Area | Result | Notes |
|---|---|---|
| 1. Sub flow | Not run | Needs sign-in (see above). |
| 2. Customer change order | Not run | Needs sign-in. |
| 3. Supply flow | Not run | Needs sign-in. |
| 4. Desktop pass (plan299) | Not run | Needs sign-in. |
| 5. Command Center, desktop | Pass | AI Team, Approvals, Accounts, Phone numbers, Memory, Connections all load, no console errors. No AI messages sent. |
| 5. Command Center, phone (400px frame) | Pass, fixed | Every tab fits after the fix; tab strip scrolls sideways on its own as intended. Chat drawer opens full width and closes. |
| 5. Accounts → Add key | Pass | Opens inline for AZ Test Roofing (sample) with Location ID and Private Integration key boxes plus where to find each; Cancel closes it. Nothing saved. |
| 6. Homeowner | Not run | Needs sign-in. |
| 7. Crew | Not run | Needs sign-in. (Clock out's two taps shipped in round 3, 9f37ae3.) |
| 8. Cleanup | Not run | Needs sign-in; list still in the round 3 report. |

## Needs the owner
1. **A way for the signed-in tests to run.** Any one of these:
   - Sign in yourself in Chrome (or click the test-login link yourself) as the account a step needs; Claude then drives the app as that account. Each switch of account needs you again (owner, sub, plan299, homeowner, crew).
   - A staging copy of the site (for example `staging.builderpro-os.com`) with its own test accounts, which Claude can sign in to.
   - Or run these steps by hand from the list above.
2. **Turn the test-login link off when you're not testing** (clear `ai_config.test_login_key`). While the key is set, anyone who gets that link can sign in to those eight accounts.
3. Still open from round 3: Anthropic credit, HighLevel upgrade (or Add key by hand), Stripe billing webhook, deleting the sample records listed in the round 3 report.

## Server fixes for the cloud session
1. **test-login**: the key travels in the address (`?key=`), so it ends up in browser history and request logs; compare it in constant time; and consider having it work only while a short expiry date is set, so it can't be left on by accident. Same goes for the session it returns in the redirect hash.
2. From round 3, still open: jobs save as one `portal_finance` row (last save wins across devices; needs a per-job merge); features that depend on HighLevel should show as off while it isn't connected.

## Cloud run (Oct 25): the signed-in steps, run by Claude
Claude ran the steps itself in a headless browser, signing in through the test-login link with a temporary key that expires by itself. It tested at desktop width (1280–1366) and phone width (400). No money was spent: no AI calls, no texts or calls, nothing sent to a supplier, no payments. The temporary key was cleared at the end.

| Step | Result | Notes |
|---|---|---|
| Sub flow (sub → owner) | Pass | Sub sent a $240.50 change order. The owner approved it and a $100 invoice. The Subs tab totals, the Money tab expense and the sub's contract value all updated. Cents fixed in 9946fb9. |
| Start job from Approved | Pass | |
| Homeowner link + change order | Pass after fix | **Bug:** the "Get updates on this project" sheet popped up over the change-order signing screen. It now waits until the signature pad is closed and shows after approving (ef72f80). Customer signed and approved. |
| Owner sees the approval without reloading | Pass after fix | **Bug:** the owner's Customer tab only refreshed when reopened. It now checks every 30s (a858520). **Bug:** the new job estimate rounded off the cents ($465.25 showed as $465, and saving would have kept $465). Fixed so money shows cents when there are any (2271af7). |
| Supply | Pass | Pick the job (kit) → order list → "Where do I buy this" with example suppliers ($600.75, one stop) → will-call ticket (not sent) → receipt entered by hand → $502.35 Materials cost on the job and in Finances. **Fixed:** the Job box ran past its card, and an alert pointed to the old tab name (330b599). **Improved:** a receipt with an open order's PO number now closes that order, so reconciling it later can't count the cost twice (3b07a12, verified). |
| Desktop + phone walk (21 pages) | Pass | Dashboard, Jobs, Estimates, Invoices, Calendar, Contacts, all five Supply tabs, Finances, Settings, Automations, Reputation, Website, Social, AI Team, Employees, Subs. No sideways scrolling and no page errors at either width. **Fixed:** the desktop said "Projects" where the phone says "Jobs". Sidebar, page title, dashboard and crew screens now all say Jobs (166f520, 73202bb). |
| Homeowner account | Pass | My projects → Kitchen remodel. Home, Schedule, Photos, Pay, Messages and More (Documents, Changes) all load. A message reached the owner's Customer tab, and the thread shows it after about 1.5s. |
| Crew | Pass | Clock in on a job, add a photo (shows on the job), clock out with two taps. The 0.07h punch showed in the owner's Hours and Pay period ($2.24). **Polish:** Hours now shows "Sat, Oct 24" instead of "2026-10-24" (73202bb). Phases are view-only for crew, so job-step check-off is owner-side only. |
| "Automatic messages: On" without HighLevel | Fixed | Job sheet now says "Not set up yet" until HighLevel is connected (deb501c, verified on plan299). |
| Cleanup | Done | Removed: plan299 "Fence repair (sample)" job, contact, both receipts, order list, purchase order and example suppliers; its homeowner link was turned off and the change orders voided. AZ Test: "Round3 Customer (sample)", "AZ Contact (sample)", both sample jobs, the to-do and the inspection note. Owner account: the crew test punch, the test photo and the two homeowner test messages. |

**Left as is (noted, not fixed):**
- The sub's "Add 2 extra outlets in the pantry (sample)" change order and $100 invoice stay on the owner test account's Kitchen remodel. Removing them would also change the sub's records.
- Older "(sample)" estimates and jobs on the plan199 account and two other test owners come from earlier rounds; most are already void. Say if you want them removed.
- Pages call the HighLevel functions even when HighLevel isn't connected, which returns 403 in the background (nothing visible).
- The dashboard asks for a `conversations` table that doesn't exist (404). The unread-texts count just stays 0.
- The Website page calls a `google-analytics` function that isn't deployed. The page falls back to the snippet view as designed.
- Reopening Order materials starts a blank list. Your earlier list is under "Open a list you started".
