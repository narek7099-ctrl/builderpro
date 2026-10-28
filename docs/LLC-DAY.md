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
