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
