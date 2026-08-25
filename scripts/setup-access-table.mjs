import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setup() {
  // Try inserting the admin user - if table doesn't exist, we'll know
  const { error: checkError } = await supabase
    .from("allowed_users")
    .select("email")
    .limit(1);

  if (checkError?.code === "PGRST205") {
    console.error(
      "\n⚠️  Table 'allowed_users' does not exist yet.\n" +
      "Please run this SQL in your Supabase Dashboard → SQL Editor:\n\n" +
      `CREATE TABLE allowed_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  name text,
  invited_by text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO allowed_users (email, role, name)
VALUES ('saloni.kedia@squadstack.ai', 'admin', 'Saloni Kedia')
ON CONFLICT (email) DO NOTHING;\n`
    );
    process.exit(1);
  }

  // Table exists - seed admin
  const { error: insertError } = await supabase
    .from("allowed_users")
    .upsert(
      { email: "saloni.kedia@squadstack.ai", role: "admin", name: "Saloni Kedia" },
      { onConflict: "email" }
    );

  if (insertError) {
    console.error("Failed to seed admin:", insertError);
    process.exit(1);
  }

  console.log("✓ Admin user seeded: saloni.kedia@squadstack.ai");
}

setup();
