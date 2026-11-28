# LLC day: switching BuilderPro over to the company

Do these in order; each step needs the one before it. Steps 1–4 take about an hour; the waits are D-U-N-S (about a week) and texting registration (days to 2 weeks), so start those the same day.

**Before you start:** have the LLC's approval papers, its exact legal name, the state, and its mailing address. Apple, Google, Stripe and banks require the person who signs up to be 18 or older; if you aren't yet, a parent or guardian who is a member or officer of the LLC can be the account holder or representative, with you added as a user.

## Day 1
1. **EIN (tax ID).** irs.gov → "Apply for an EIN online". It's free and instant; skip sites that charge for it. Save the confirmation letter (CP 575) as a PDF; Stripe, the bank and texting registration ask for it.
2. **Business bank account** in the LLC's name, with the EIN.
3. **D-U-N-S number** (free, about a week): developer.apple.com/enroll/duns-lookup. Use the LLC name and address exactly as on the state papers. Apple and Google both need it.
4. **Stripe** (dashboard.stripe.com):
   - Settings → Business → **Business details**: business type *Company / LLC*, legal name, EIN, address, website builderpro-os.com.
   - **Representative**: the adult who signs for the LLC.
   - Settings → Business → **Bank accounts**: replace the payout account with the LLC's bank account.
   - Settings → **Public details**: statement descriptor `BUILDERPRO` and support email support@builderpro-os.com.
   - Existing subscriptions keep working; nothing to redo for clients.
5. **Website legal pages**: open Claude Code and say *"LLC day: the LLC is [legal name], a [state] LLC, mailing address [address]. Fill in the LLC markers."* That fills every `LLC:` spot (terms ×4, privacy ×3, data deletion ×1), adds the governing-law line, and updates the "© 2026" footer on every page. Takes a few minutes.
6. **Email**: make sure privacy@builderpro-os.com and support@builderpro-os.com both reach you (the legal pages and app stores point to them).

## When HighLevel is unfrozen
7. **HighLevel business profile**: Agency Settings → Company: legal name, EIN, address.
8. **Texting registration (A2P 10DLC)** for your own number: BuilderPro OS sub-account → Settings → Phone Numbers → Trust Center: register the LLC as the brand (legal name and EIN exactly as on the IRS letter), then the campaign. Approval takes days to 2 weeks; texts from that number won't send until then.
   - Each client registers **their own** business in their sub-account (FIRST-CLIENT-CHECKLIST.md, step 7). Your LLC's registration covers only your number.

## When the D-U-N-S number arrives
9. **Apple Developer**: developer.apple.com/programs/enroll → *Organization*, with the D-U-N-S number ($99/year). Then docs/APP-STORES.md, steps 2–4.
10. **Google Play Console**: play.google.com/console → *Organization* account ($25, D-U-N-S required). Then docs/APP-STORES.md.
11. **Firebase** (free): a project named BuilderPro, for Android notifications (APP-STORES.md, step 2).
12. Tell Claude "the store accounts are ready": it fills the app-link settings (`.well-known/`) and runs the store builds.

## Within the first month
13. **Move your bills to the LLC** (a business card or the business bank account): HighLevel, Supabase, GitHub, Anthropic, Google Workspace or your email host, the domain, and anything else BuilderPro runs on. It keeps the business's costs out of personal accounts.
14. **Sales tax on software**: some states tax software subscriptions. Ask an accountant whether you have to charge it where you and your clients are; if you do, Stripe Tax (Stripe → Tax) adds it to invoices. The terms already say taxes are added where the law requires.
15. **Have a lawyer read the terms and privacy policy.** They were written carefully, but they're not legal advice. The parts to ask about:
    - the no-refunds rule
    - the liability limit (the fees paid in the last 12 months)
    - the texting-consent and AI sections
16. **Optional:** business insurance (general liability, plus cyber/technology errors and omissions), and a Google Business Profile for BuilderPro.

## Payroll: real checks and pay stubs for W-2 workers (after the LLC)
Today BuilderPro prints 1099 contractor checks (signed with the saved e-signature) and pay stubs, but it does no payroll tax: for W-2 employees the owner types the take-home pay and files the taxes elsewhere. The plan is to run real payroll inside BuilderPro through Gusto Embedded Payroll: Gusto does the tax math, withholding, filings, W-2s, 1099s and direct deposit; BuilderPro runs payroll from the crew's clock-in hours, shows the stubs, prints checks and posts labor to each job.
17. **Gusto Embedded application.** Needs the LLC (step 1's EIN and the legal name). The draft is `docs/partners/gusto-embedded-preapproval.md`. Tell Claude: *"Fill the Gusto application: legal name [ ], state [ ], EIN [ ], [number] contractor companies with about [number] workers, mainly in [states], payroll add-on price [idea], contact [name, email]."* The contact on the application should be the adult who signs for the LLC. Then submit it on Gusto's embedded payroll site.
18. **If Gusto says "come back when you have more customers":** ask Claude for the lighter version, which sends crew hours into each contractor's own Gusto account and brings the pay stubs back. No partner approval is needed.
19. **Once approved:** tell Claude "Gusto approved us". It builds company setup, worker onboarding (W-4, bank details), the payroll review screen with a two-step confirm, stubs and checks from Gusto's numbers, and labor posted to jobs.

## Sign in with Apple and Google (needs the Apple Developer account from step 9)
The buttons are already built and stay hidden until each provider is switched on in Supabase (Authentication > Sign In / Providers). Never paste the keys into a chat; type them into Supabase yourself.
20. **Google (free):** Google Cloud Console > OAuth client, type "Web application", authorized redirect URL `https://ttzwzouhiwdwamuimhpo.supabase.co/auth/v1/callback`. Paste the Client ID and Secret into Supabase > Google.
21. **Apple:** in the Apple Developer account, a Services ID with "Sign in with Apple" (same callback URL) and a Sign in with Apple key (.p8). Enter the Services ID, Team ID, Key ID and key in Supabase > Apple.
22. Supabase > Authentication > URL Configuration: make sure `https://builderpro-os.com/app` is an allowed redirect URL. Then tell Claude which one is on so it can test a real sign-in.

