import { useEffect, useMemo, useState } from 'react';

type Summary = {
  eventCount: number;
  actionCount: number;
  commentCount: number;
  interactionCount: number;
};

type EventRow = {
  id: string;
  participant_id?: string | null;
  page?: string | null;
  event_name?: string | null;
  action?: string | null;
  target_id?: string | null;
  event_timestamp?: string | null;
};

type ActionRow = {
  id: string;
  participant_id?: string | null;
  action_name?: string | null;
  target_id?: string | null;
  received_at?: string | null;
};

type CommentRow = {
  id: string;
  target_id?: string | null;
  nickname?: string | null;
  content?: string | null;
  created_at?: string | null;
};

function getStoredToken() {
  return sessionStorage.getItem('weibsim_admin_token') || '';
}

async function fetchAdminJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || response.statusText);
  }

  return response.json() as Promise<T>;
}

export function AdminPage() {
  const [tokenInput, setTokenInput] = useState(() => getStoredToken());
  const [token, setToken] = useState(() => getStoredToken());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const exportHref = useMemo(() => {
    if (!token) return '';
    const params = new URLSearchParams({ adminToken: token, limit: '1000' });
    return `/api/admin/export/events.csv?${params.toString()}`;
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [summaryRes, eventsRes, actionsRes, commentsRes] = await Promise.all([
          fetchAdminJson<{ ok: true; summary: Summary }>('/api/admin/summary', token),
          fetchAdminJson<{ ok: true; rows: EventRow[] }>('/api/admin/events?limit=50', token),
          fetchAdminJson<{ ok: true; rows: ActionRow[] }>('/api/admin/actions?limit=50', token),
          fetchAdminJson<{ ok: true; rows: CommentRow[] }>('/api/admin/comments?limit=50', token),
        ]);

        if (cancelled) return;
        setSummary(summaryRes.summary);
        setEvents(eventsRes.rows);
        setActions(actionsRes.rows);
        setComments(commentsRes.rows);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-[#f5f0e8] px-4 py-6 text-[#1f1d1a]">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[28px] border border-[#d8cbb7] bg-[linear-gradient(135deg,#fff7eb_0%,#efe2cc_100%)] p-6 shadow-[0_16px_40px_rgba(92,70,35,0.08)]">
          <p className="text-xs uppercase tracking-[0.32em] text-[#8c6f45]">Admin Console</p>
          <h1 className="mt-2 text-3xl font-semibold">WeibSim behavior logs</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#6e5d46]">
            用管理员 token 查看实验行为日志、最近动作和评论，并直接导出事件 CSV。
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="ADMIN_TOKEN"
              className="w-full rounded-2xl border border-[#ccb794] bg-white/85 px-4 py-3 text-sm outline-none focus:border-[#9d7440]"
            />
            <button
              type="button"
              className="rounded-2xl bg-[#2f5d50] px-5 py-3 text-sm font-medium text-white"
              onClick={() => {
                sessionStorage.setItem('weibsim_admin_token', tokenInput.trim());
                setToken(tokenInput.trim());
              }}
            >
              进入后台
            </button>
            <button
              type="button"
              className="rounded-2xl border border-[#b99c72] px-5 py-3 text-sm text-[#6e5d46]"
              onClick={() => {
                sessionStorage.removeItem('weibsim_admin_token');
                setToken('');
                setTokenInput('');
                setSummary(null);
                setEvents([]);
                setActions([]);
                setComments([]);
              }}
            >
              退出
            </button>
            {exportHref ? (
              <a
                href={exportHref}
                className="rounded-2xl border border-[#2f5d50] px-5 py-3 text-sm font-medium text-[#2f5d50]"
              >
                导出 events.csv
              </a>
            ) : null}
          </div>
        </header>

        {error ? <p className="mt-4 rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm text-[#a34d2f]">{error}</p> : null}
        {loading ? <p className="mt-4 text-sm text-[#6e5d46]">正在加载后台数据...</p> : null}

        {summary ? (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[#92734e]">Events</p>
              <p className="mt-3 text-3xl font-semibold">{summary.eventCount}</p>
            </article>
            <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[#92734e]">Actions</p>
              <p className="mt-3 text-3xl font-semibold">{summary.actionCount}</p>
            </article>
            <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[#92734e]">Comments</p>
              <p className="mt-3 text-3xl font-semibold">{summary.commentCount}</p>
            </article>
            <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[#92734e]">Interactions</p>
              <p className="mt-3 text-3xl font-semibold">{summary.interactionCount}</p>
            </article>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 xl:grid-cols-3">
          <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
            <h2 className="text-lg font-semibold">Recent events</h2>
            <div className="mt-4 space-y-3">
              {events.map((row) => (
                <div key={row.id} className="rounded-2xl border border-[#efe4d3] px-3 py-3 text-sm">
                  <p className="font-medium">{row.event_name || 'event'}</p>
                  <p className="mt-1 text-[#6e5d46]">{row.page || '-'}</p>
                  <p className="mt-1 text-[#92734e]">{row.participant_id || '-'}</p>
                  <p className="mt-1 text-xs text-[#9b8a73]">{row.event_timestamp || '-'}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
            <h2 className="text-lg font-semibold">Recent actions</h2>
            <div className="mt-4 space-y-3">
              {actions.map((row) => (
                <div key={row.id} className="rounded-2xl border border-[#efe4d3] px-3 py-3 text-sm">
                  <p className="font-medium">{row.action_name || 'action'}</p>
                  <p className="mt-1 text-[#6e5d46]">target: {row.target_id || '-'}</p>
                  <p className="mt-1 text-[#92734e]">{row.participant_id || '-'}</p>
                  <p className="mt-1 text-xs text-[#9b8a73]">{row.received_at || '-'}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(92,70,35,0.08)]">
            <h2 className="text-lg font-semibold">Recent comments</h2>
            <div className="mt-4 space-y-3">
              {comments.map((row) => (
                <div key={row.id} className="rounded-2xl border border-[#efe4d3] px-3 py-3 text-sm">
                  <p className="font-medium">{row.nickname || 'anonymous'}</p>
                  <p className="mt-1 line-clamp-3 text-[#6e5d46]">{row.content || '-'}</p>
                  <p className="mt-1 text-[#92734e]">post: {row.target_id || '-'}</p>
                  <p className="mt-1 text-xs text-[#9b8a73]">{row.created_at || '-'}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
