import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return null;

  const { data } = await supabase
    .from("allowed_users")
    .select("role")
    .eq("email", session.user.email.toLowerCase())
    .single();

  return data?.role === "admin" ? session : null;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("allowed_users")
    .select("id, email, role, name, invited_by, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load users" }, { status: 502 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { email, name, role } = await request.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const { error } = await supabase.from("allowed_users").insert({
    email: email.toLowerCase(),
    name: name || null,
    role: role || "member",
    invited_by: session.user?.email,
  });

  if (error?.code === "23505") {
    return NextResponse.json({ error: "User already invited" }, { status: 409 });
  }
  if (error) {
    return NextResponse.json({ error: "Failed to invite user" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email });
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { email } = await request.json();

  if (email === session.user?.email) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const { error } = await supabase
    .from("allowed_users")
    .delete()
    .eq("email", email.toLowerCase());

  if (error) {
    return NextResponse.json({ error: "Failed to remove user" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
