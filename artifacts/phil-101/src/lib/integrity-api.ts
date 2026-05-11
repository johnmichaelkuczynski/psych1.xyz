/** Ad-hoc fetch helpers for routes that don't go through the OpenAPI client. */

const API = `${import.meta.env.BASE_URL}api`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export interface DraftRow {
  id: number;
  studentId: number;
  moduleId: string;
  content: string;
  feedback: string | null;
  feedbackAt: string | null;
  locked: boolean;
}

export const integrityApi = {
  // Drafts
  getDraft: (moduleId: string) =>
    req<{ draft: DraftRow | null }>(`/drafts/${moduleId}`),
  postDraft: (moduleId: string, content: string) =>
    req<{ draft: DraftRow | null }>(`/drafts/${moduleId}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  // Canvas autosave / score
  getCanvas: (moduleId: string) =>
    req<{
      session: {
        content: string;
        keystrokes: unknown[];
        scoreHistory: unknown[];
        updatedAt: string;
      } | null;
    }>(`/canvas/${moduleId}`),
  autosave: (
    moduleId: string,
    payload: {
      content: string;
      keystrokes: unknown[];
      scoreHistory: unknown[];
    },
  ) =>
    req<void>(`/canvas/${moduleId}/autosave`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  score: (moduleId: string, text: string) =>
    req<{
      aiScore: number | null;
      aiClass: string | null;
      sentences: { text: string; generatedProb: number }[];
      accommodated: boolean;
    }>(`/canvas/${moduleId}/score`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  processScore: (
    moduleId: string,
    payload: { events: unknown[]; content: string },
  ) =>
    req<{ score: number | null; class: string | null }>(
      `/canvas/${moduleId}/processScore`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  // Integrity ack
  ack: () => req<void>(`/integrity/ack`, { method: "POST" }),
  becomeAdmin: () => req<{ ok: true }>(`/admin/bootstrap`, { method: "POST" }),

  // Admin
  listSubmissions: () =>
    req<{
      submissions: {
        id: number;
        moduleId: string;
        createdAt: string;
        aiScore: number | null;
        aiClass: string | null;
        aiStatus: string;
        flaggedOnSubmit: boolean;
        reviewStatus: string;
        studentId: number;
        studentName: string | null;
        studentEmail: string | null;
      }[];
    }>(`/admin/submissions`),
  getSubmission: (id: number) =>
    req<{
      submission: {
        id: number;
        studentId: number;
        studentName: string | null;
        studentEmail: string | null;
        moduleId: string;
        content: string;
        createdAt: string;
        aiScore: number | null;
        aiClass: string | null;
        aiStatus: string;
        keystrokes: unknown[] | null;
        scoreHistory: unknown[] | null;
        activityReport: Record<string, unknown> | null;
        flaggedOnSubmit: boolean;
        reviewStatus: string;
        processScore: number | null;
        processClass: "human" | "mixed" | "likelyAI" | null;
        processFeatures: Record<string, unknown> | null;
        processFlags: string[] | null;
      };
    }>(`/admin/submissions/${id}`),
  review: (id: number, status: "pending" | "reviewed" | "flagged") =>
    req<void>(`/admin/submissions/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  listStudents: () =>
    req<{
      students: {
        id: number;
        name: string;
        email: string;
        isAdmin: boolean;
        accommodated: boolean;
      }[];
    }>(`/admin/students`),
  setAccommodated: (id: number, accommodated: boolean) =>
    req<void>(`/admin/students/${id}/accommodate`, {
      method: "POST",
      body: JSON.stringify({ accommodated }),
    }),
};
