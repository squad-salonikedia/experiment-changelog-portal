import { NextResponse } from "next/server";
import { getViewer } from "@/lib/identity";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * parent_id and edited_at arrive with migration 007. Until it has been run the
 * columns are absent, so each is probed once per server process and the feature
 * degrades to flat, uneditable comments rather than every write failing.
 */
const probes = new Map<string, Promise<boolean>>();
function hasColumn(name: string): Promise<boolean> {
  if (!probes.has(name)) {
    probes.set(
      name,
      (async () => {
        const { error } = await supabase.from("experiment_comments").select(name).limit(1);
        return !error;
      })()
    );
  }
  return probes.get(name)!;
}
const hasThreading = () => hasColumn("parent_id");
const hasEditedAt = () => hasColumn("edited_at");

type CommentRow = {
  id: string;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
  parent_id?: string | null;
  edited_at?: string | null;
};

function toComment(row: CommentRow, viewerEmail: string) {
  return {
    id: row.id,
    author: row.author_name || row.author_email,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    parentId: row.parent_id ?? null,
    canDelete: row.author_email === viewerEmail,
    canEdit: row.author_email === viewerEmail,
  };
}

async function selectColumns() {
  const columns = ["id", "author_email", "author_name", "body", "created_at"];
  if (await hasThreading()) columns.push("parent_id");
  if (await hasEditedAt()) columns.push("edited_at");
  return columns.join(", ");
}

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
    .select(await selectColumns())
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
    comments: ((data ?? []) as unknown as CommentRow[]).map((c) => toComment(c, viewer.email)),
    threading: await hasThreading(),
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
    const { body, parentId } = (await request.json()) as {
      body?: string;
      parentId?: string | null;
    };
    const text = (body ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
    }

    const record: Record<string, unknown> = {
      experiment_id: id,
      author_email: viewer.email,
      author_name: viewer.name ?? "",
      body: text,
    };

    if (parentId && (await hasThreading())) {
      const { data: parent } = await supabase
        .from("experiment_comments")
        .select("id, parent_id, experiment_id")
        .eq("id", parentId)
        .maybeSingle();

      if (!parent || parent.experiment_id !== id) {
        return NextResponse.json(
          { error: "That comment is not on this experiment." },
          { status: 400 }
        );
      }
      // One level only. A reply to a reply joins the same thread rather than
      // starting a deeper one nothing in the UI can render.
      record.parent_id = parent.parent_id ?? parent.id;
    }

    const { data, error } = await supabase
      .from("experiment_comments")
      .insert(record)
      .select(await selectColumns())
      .single();

    if (error) {
      console.error("Failed to save comment", error);
      return NextResponse.json({ error: "Database write failed" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      comment: toComment(data as unknown as CommentRow, viewer.email),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/** Edit your own comment. Only the text changes — never the author or the thread. */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentId = new URL(request.url).searchParams.get("commentId");
  if (!commentId) {
    return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
  }

  let text = "";
  try {
    const { body } = (await request.json()) as { body?: string };
    text = (body ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
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
    return NextResponse.json(
      { error: "You can only edit your own comments" },
      { status: 403 }
    );
  }

  const patch: Record<string, unknown> = { body: text };
  if (await hasEditedAt()) patch.edited_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("experiment_comments")
    .update(patch)
    .eq("id", commentId)
    .select(await selectColumns())
    .single();

  if (error) {
    console.error("Failed to edit comment", error);
    return NextResponse.json({ error: "Database write failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    comment: toComment(data as unknown as CommentRow, viewer.email),
  });
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

  // Replies cascade in the database once migration 007 is in; without it they
  // would be left pointing at nothing, so clear them here too.
  if (await hasThreading()) {
    await supabase.from("experiment_comments").delete().eq("parent_id", commentId);
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
