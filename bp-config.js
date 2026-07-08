// BuilderPro portal — shared Supabase config
// The anon key is public by design (safe in the browser). Real security comes
// from Supabase Auth (server-side password checks) + Row Level Security.
const BP_SUPABASE_URL = "https://ttzwzouhiwdwamuimhpo.supabase.co";
const BP_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0end6b3VoaXdkd2FtdWltaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTc2NjgsImV4cCI6MjA5ODY5MzY2OH0.oVqdHZlZLWJd_8nkgPRA9VgAqY4ytg51N1mT3Hqekso";

// Create the client (supabase-js must be loaded before this file)
const bpClient = window.supabase.createClient(BP_SUPABASE_URL, BP_SUPABASE_ANON);
