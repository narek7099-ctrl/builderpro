# BuilderPro A–Z test report

Run: Oct 20, 2026, in the owner's Chrome at phone width (417px), live site builderpro-os.com.
Sign-ins are done by the owner; Claude tests from there.

## Setup notes
- Window resize from the Chrome tools was ignored while the window was maximized; the owner narrowed it by hand.
- The app blocks being framed (clickjacking guard at index.html line 15), so a framed phone preview isn't possible. Kept on purpose.

## Results (plan199, BuilderPro OS owner)

| # | Area | Result | Notes |
|---|---|---|---|
| 2 | Owner Home | Pass | Navy header, 4 tiles, Needs you, Today, All apps render; AI Team locked on this plan as expected; no console errors. |
| 3 | + sheet → Customer | Pass | New contact "AZ Test Customer (sample)" created (555-0142, az.sample@example.com, auto-text unchecked). |
| 4 | Contact profile | Pass | Call/Text/Email/New inspection fit on one row, big Estimate button. |
| 5 | Estimate end to end | Pass, with notes | Built job → materials (catalog search) → labor (labeled boxes) → price (math correct: $681.66) → send by email → customer link → signed and approved. Owner side shows "accepted" after reload. |

### Issues found
1. **HighLevel calendar warning keeps popping up** ("Some project days could not be put on the HighLevel Jobs calendar…") on every save, on pages unrelated to the calendar. Noise for an account without HighLevel connected.
2. **Send step "Change" link** goes back to the Price step, where the Text/Email choice is at the bottom of the page. Easy to miss.
3. **Send-link dialog says "Your texting number isn't connected"** even when Email was chosen.
4. **Owner app doesn't refresh after the customer approves**; the estimate still says "sent" until the page is reloaded.
5. The customer's "save to your account" prompt didn't show after approving, likely because the same browser is signed in as the owner. Re-check in the homeowner step.
6. **Wording mismatch:** bottom tab says "Jobs", page title says "Projects".
7. **Job screen header:** the job name under the customer ("Kitchen remodel") was dark gray on navy, nearly unreadable. **Fixed** (portal/mobile.css, v=20261021r; not yet re-tested or shipped to main).
8. **Job screen header:** "Mark done" wrapped onto two lines. **Fixed** in the same change.
9. **Job screen:** the Cancel / Save bar showed on the read-only Overview, where there is nothing to save. **Fixed** in the same change (hidden until "Edit details").

| 6 | Jobs list + one job (partial) | Pass, with design issues | New job cards, filters and the folded "job steps" strip work. Job opens read-only with Edit details. Issues 6–9 above. Did not tap Finished/Not yet, to keep the demo schedule unchanged. |

## Where the test stopped

Stopped by the owner during step 6 (to resume when there are more credits).

**Test data left in the account (plan199), all labeled sample:**
- Contact "AZ Test Customer (sample)", (555) 010-0142, az.sample@example.com
- Job/estimate "Gutter replacement (sample)", $681.66, approved by the test customer

**Still to do:**
- Step 6 rest: Money, Schedule, Crew, Materials, Permits, Photos, Documents tabs; Mark done.
- Steps 7–18: Calendar, Finances (invoice, payment plan, test-mode payment), Supply, Inbox, Marketing, AI Team, Settings, crew login, sub login, homeowner login (re-check issue 5), Command Center, then desktop width.
- The design check on every remaining screen.
- Re-test issues 7–9 on the live site after shipping, then ship to main.
- Fix issues 1–4 and 6.
- Clean up the sample contact and job.

**To resume:** sign in as plan199 in a narrow Chrome window (resize from the tools doesn't work while maximized; drag it narrow by hand), and point Claude at this file.
