// The Software Team's specialists: one AI per feature of BuilderPro OS.
// The Software Team (key "support") hands a client's problem to the right
// specialist with ask_specialist; the owner can also open a specialist and
// talk to it directly in the Command Center (agent key "sw_<key>").
// Specialists only read: the feature's own tables (feature_data), client
// accounts, support requests and HighLevel reads. Anything that changes a
// client's data or contacts a customer still waits for the owner.

export type Spec = { key: string; name: string; short: string; tables: string[]; knows: string };

// tables whose owner column is user_id instead of owner
export const OWNER_COL: Record<string, string> = { accounts: "user_id", client_settings: "user_id", usage_month: "user_id", device_tokens: "user_id", bp_directory: "user_id" };

const PAUSED = "HighLevel is paused on purpose until there are paying clients, so anything that runs through it (Lisa's calls and texts, the texting inbox, GHL deposit invoices, GHL automations) does not work right now. Say so plainly instead of treating it as a bug.";

export const SPECS: Spec[] = [
  { key: "leads", name: "Leads & Contacts", short: "Leads, contacts, calculators, lead sources",
    tables: ["contacts", "lead_log", "lead_sources", "lead_events", "roof_checks", "calculator_pricing", "embed_themes"],
    knows: `The Leads page (Leads > Contacts first, then Automations, Calculator leads, Calculators). Contacts live in the contacts table and are merged with the client's HighLevel contacts. Website forms, booking pages and the free calculators (cost calculators and roof health/damage checks a contractor embeds on their own site) send leads through the lead-in / lead-intake functions: each one lands in lead_log (with ghl_status saying whether it reached HighLevel), and calculator results land in roof_checks. Calculator leads and Calculators are locked on the Foundation ($99) plan. The status label on a contact comes from its tags (new lead, contacted, estimate sent, won, inspection booked, missed call). CSV import and export are on the Contacts tab. Lead sources (Angi, Thumbtack...) track cost per lead.` },
  { key: "estimates", name: "Estimates & Contracts", short: "Good/Better/Best estimates, e-sign, change orders",
    tables: ["estimate_options", "contracts", "customer_change_orders", "user_signatures"],
    knows: `Estimates are built step by step; a Good/Better/Best estimate (estimate_options) has three tiers. The contractor either sends their pick or lets the customer choose; every send is a link to a BuilderPro web page (token), never an attachment. Status goes sent > viewed > chosen. Contracts (contracts) go sent > viewed > signed or declined; the customer signs on the web page. Change orders on a job go to the homeowner for approval (customer_change_orders). After signing, the deposit invoice is created in HighLevel. ${PAUSED}` },
  { key: "payments", name: "Invoices & Payments", short: "Invoices, Stripe card payments, finances, QuickBooks",
    tables: ["stripe_accounts", "stripe_payments", "portal_finance", "qb_connections", "qb_sync_log"],
    knows: `Contractors connect their own Stripe account (Stripe Connect, stripe_accounts) to take card payments from customers; payments are in stripe_payments (amounts in cents). Finances (income, expenses, payment plans) live in portal_finance as JSON (fin, payplans). QuickBooks sync is in qb_connections / qb_sync_log. BuilderPro's own billing of the contractor (their plan) is the Accounts specialist's area. Stripe is live: never suggest test card payments. ${PAUSED}` },
  { key: "jobs", name: "Jobs & Calendar", short: "Jobs, phases, calendar, inspections, storm alerts",
    tables: ["portal_finance", "calendar_notes", "booking_closed_days", "inspection_reports", "notifications", "storm_alerts"],
    knows: `Jobs are stored in portal_finance.jobs (a JSON array per contractor: name, customer, address, status, phases with dates, crew, photos, starred). Jobs is locked on the Foundation ($99) plan. The calendar shows jobs, inspections, booked appointments and calendar_notes (to-dos and notes); booking_closed_days blocks days on the public booking page. Inspection reports are written in the app. Storm alerts flag hail and wind near jobs. Notifications drive the bell (the badge counts only action items).` },
  { key: "crew", name: "Crew & Subcontractors", short: "Crew app, time clock, subs and their documents",
    tables: ["employees", "team_members", "time_clock", "time_entries", "time_breaks", "subcontractors", "sub_documents", "worker_reviews", "team_threads"],
    knows: `Employees (kind must be 'w2' or '1099') get the crew app: tabs Job, Photos, Materials, Files, More, and they clock in and out (time_clock, then time_entries with hours and overtime). A crew member signs in with the email the owner added under Employees; if they see "ask your boss to add you", the email doesn't match. Subcontractors get the sub app (Job, Money, Photos, Files, More) and have compliance documents (insurance, license, W-9) with expiry dates. team_members are extra office logins on the account. Crew ratings come from customers (worker_reviews).` },
  { key: "portal", name: "Customer Portal", short: "Homeowner project pages, messages, reviews, Find a pro",
    tables: ["customer_portal_links", "homeowner_links", "customer_messages", "review_requests", "bp_directory"],
    knows: `Each job can have a customer project page (a link with a token: app.html#home=<token>). The homeowner sees a timeline of the job's phases, photos, documents, payments, change orders and can message the contractor (customer_messages; unanswered ones matter). If the homeowner makes a free account, opened links are linked to it (homeowner_links) and they see all their projects under My projects. Review requests go out after a job. bp_directory is the 'Find a pro' listing of contractors. A link can be turned off by the contractor, then the page says so.` },
  { key: "phone", name: "Phone, Texts & Lisa", short: "AI receptionist, business number, texting inbox",
    tables: ["ai_brain", "ghl_events", "integrations", "support_requests"],
    knows: `Lisa is the AI receptionist (the contractor can rename her): she answers calls and texts and books appointments, using the knowledge in ai_brain (services, pricing, hours, area, FAQs). Each client has a HighLevel sub-account with a business number (number requests come in as support_requests), A2P texting registration, and the Conversations inbox, which reads HighLevel. ghl_events logs what HighLevel sent back. ${PAUSED}` },
  { key: "supply", name: "Supply & Materials", short: "Suppliers, material orders, kits, equipment",
    tables: ["suppliers", "supplier_items", "purchase_orders", "parts_lists", "job_kits", "assets", "asset_services"],
    knows: `Supply is locked on the Foundation ($99) plan. Contractors keep suppliers and their prices, build material lists and kits per job type, and send purchase orders (PO number, status, sent and picked up, invoice match). Equipment/assets (with nameplate scan) and their service history are tracked per job or customer.` },
  { key: "ai", name: "AI Team (in the app)", short: "The contractor's AI assistants and the Ask AI helper",
    tables: ["cai_threads", "cai_approvals", "cai_usage", "ceo_reports", "ceo_asks"],
    knows: `The AI Team inside the contractor's app is on the Enterprise ($299) plan: assistants (Sales, Marketing, Research, Client Care, Office, Projects, Permits, Workflows, and an AI CEO with reports) chat with the contractor, read the app pages their role allows, and queue actions for the contractor's approval (cai_approvals). Usage is counted in cai_usage. The 'Ask AI' button in the top bar is a separate in-app helper that answers how-to questions; it does not need HighLevel.` },
  { key: "marketing", name: "Website & Marketing", short: "Contractor websites, visits, social posts, email",
    tables: ["site_events", "social_posts", "competitors", "farm_campaigns", "campaign_requests", "mail_connections", "mail_templates", "google_connections"],
    knows: `Marketing is locked on the Foundation ($99) plan. Contractors get a website (a $49/month add-on), visit tracking (site_events), social posts to Facebook/Instagram, competitor tracking, neighborhood 'farm' campaigns after a job, and connected email (Gmail/Outlook in mail_connections) with templates. Google connections cover Google Business and Analytics.` },
  { key: "account", name: "Accounts, Plans & Setup", short: "Sign-up, trial, plan locks, settings, phone app",
    tables: ["accounts", "client_settings", "usage_month", "device_tokens", "notification_prefs"],
    knows: `Plans: Foundation $99, BuilderPro OS $199, Enterprise $299, 14 days free, card taken at sign-up by Stripe, no setup fee. Foundation locks Jobs, Supply, AI Team, Marketing, Calculator leads and Calculators. accounts holds plan, status (trial, active, past_due, cancelled), trial end, the HighLevel location id and the setup log; client_settings holds company info, branding (logo), and app settings. The phone app (iOS/Android) uses device_tokens for push notifications. Logins reset through 'Forgot password'. Never share or ask for passwords.` },
];

export const SPEC_BY_KEY: Record<string, Spec> = Object.fromEntries(SPECS.map((s) => [s.key, s]));
export const SPEC_TABLES = [...new Set(SPECS.flatMap((s) => s.tables))];
