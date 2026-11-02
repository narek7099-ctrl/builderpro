# BuilderPro login emails (Supabase)

Supabase sends the login emails: team invites, password resets, sign-in links, email changes
and sign-up confirmations. These templates add the BuilderPro logo and match the other emails.
Supabase only accepts them through its dashboard, so they're pasted in by hand, once.

**Supabase → Authentication → Emails → Templates.** For each one: set the subject, switch the body
to source (`<>`), replace everything with the file's contents, and save.

| Template in Supabase | Subject | File |
|---|---|---|
| Invite user | You're invited to BuilderPro | `invite.html` |
| Reset password | Reset your BuilderPro password | `recovery.html` |
| Magic link | Your BuilderPro sign-in link | `magic_link.html` |
| Change email address | Confirm your new BuilderPro email | `email_change.html` |
| Confirm signup | Confirm your BuilderPro email | `confirmation.html` |

Used today: **Invite user** (Team → invite) and **Reset password** (Forgot password). The other
three are ready for when they're used.

**Before real clients: set up your own email sender (SMTP).** Supabase's built-in sender only
delivers to addresses on your Supabase team and only a few an hour, so a client's crew invite or
password reset may never arrive. Supabase → Authentication → Emails → SMTP settings, using Resend
(the same service the supplier-order emails use): host `smtp.resend.com`, port 465, user `resend`,
password = a Resend API key, sender `BuilderPro <no-reply@builderpro-os.com>`. The
builderpro-os.com domain must be verified in Resend first.
