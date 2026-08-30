import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  const { data, error } = await supabase
    .from("experiment_comments")
    .select("id, author_email, author_name, body, created_at")
    .eq("experiment_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ comments: [], pending: true });
    }
    console.error("Failed to load comments", error);
    return NextResponse.json({ error: "Database read failed" }, { status: 502 });
  }

  return NextResponse.json({
    comments: (data ?? []).map((c) => ({
      id: c.id,
      author: c.author_name || c.author_email,
      authorEmail: c.author_email,
      body: c.body,
      createdAt: c.created_at,
      canDelete: c.author_email === viewer.email,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;

  try {
    const { body } = (await request.json()) as { body?: string };
    const text = (body ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("experiment_comments")
      .insert({
        experiment_id: id,
        author_email: viewer.email,
        author_name: viewer.name ?? "",
        body: text,
      })
      .select("id, author_email, author_name, body, created_at")
      .single();

    if (error) {
      console.error("Failed to save comment", error);
      return NextResponse.json({ error: "Database write failed" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      comment: {
        id: data.id,
        author: data.author_name || data.author_email,
        authorEmail: data.author_email,
        body: data.body,
        createdAt: data.created_at,
        canDelete: true,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId");
  if (!commentId) {
    return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("experiment_comments")
    .select("author_email")
    .eq("id", commentId)
    .eq("experiment_id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (existing.author_email !== viewer.email) {
    return NextResponse.json({ error: "You can only delete your own comments" }, { status: 403 });
  }

  const { error } = await supabase
    .from("experiment_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    console.error("Failed to delete comment", error);
    return NextResponse.json({ error: "Database write failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
