import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useExperimentLogger } from '../hooks/useExperimentLogger';
import type { UserProfile } from '../types/experiment';
import './SaltCityExperimentPage.css';

export type SaltCityCondition = 'ordinary' | 'smart';

type Citation = { mid: string; index: number; name: string };
type AnswerBlock =
  | { kind: 'heading' | 'bullet' | 'paragraph'; text: string; citations: Citation[] }
  | { kind: 'media'; items: Array<{ mid: string; type: string; author: string; image: string }> };
type Source = { index: number; mid: string; name: string; url: string };
type Post = {
  id: string;
  bid: string;
  url: string;
  author: string;
  authorUrl: string;
  avatar: string;
  avatarHd: string;
  verified: boolean;
  createdAt: string;
  source: string;
  text: string;
  photos: string[];
  video: string;
  videoPoster: string;
  reposts: number;
  comments: number;
  likes: number;
};
type CaseBundle = {
  id: string;
  topic: string;
  posts: Post[];
  smart: { blocks: AnswerBlock[]; weiboReferenceCount: number; sources: Source[]; generatedAt?: number };
};
type CommentItem = { id: string; targetId: string; content: string; nickname: string; createdAt: number };
type Panel = { kind: 'comment' | 'repost'; targetId: string; label: string };
type ActionContextValue = {
  likedIds: Set<string>;
  repostedIds: Set<string>;
  addedComments: Record<string, number>;
  onLike: (targetId: string) => void;
  onComment: (targetId: string, label: string) => void;
  onRepost: (targetId: string, label: string) => void;
};
const ActionContext = createContext<ActionContextValue | null>(null);
type CaseId = 'saltcity' | 'starbucks' | 'teachers';

function localTime(raw: string) {
  const match = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)\s+(\d\d:\d\d)/.exec(raw);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return match ? `${months.indexOf(match[1]) + 1}月${Number(match[2])}日 ${match[3]}` : raw;
}

function richText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  );
}

async function recordAction(action: string, participantId: string, caseId: CaseId, condition: SaltCityCondition, targetId: string, detail: Record<string, unknown> = {}) {
  try {
    const response = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, participantId, condition: `${caseId}_${condition}`, targetId, page: `${caseId}_${condition}`, ts: Date.now(), ...detail }),
      keepalive: true,
    });
    return response.ok;
  } catch {
    // The experiment remains readable if logging is temporarily unavailable.
    return false;
  }
}

function readSavedIds(key: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch { return new Set(); }
}

function ActionBar({ targetId, label, reposts = 0, comments = 0, likes = 0 }: {
  targetId: string; label: string; reposts?: number; comments?: number; likes?: number;
}) {
  const actions = useContext(ActionContext);
  if (!actions) return null;
  const liked = actions.likedIds.has(targetId);
  const reposted = actions.repostedIds.has(targetId);
  const commentCount = comments + (actions.addedComments[targetId] || 0);
  return <div className="salt-post-actions" aria-label={`${label}互动`}>
    <button type="button" onClick={() => actions.onRepost(targetId, label)} data-track="open_repost" data-track-id={targetId}>↗ <span>{reposted ? '已转发' : '转发'}{reposts + (reposted ? 1 : 0) ? ` ${reposts + (reposted ? 1 : 0)}` : ''}</span></button>
    <button type="button" onClick={() => actions.onComment(targetId, label)} data-track="open_comment" data-track-id={targetId}>▢ <span>评论{commentCount ? ` ${commentCount}` : ''}</span></button>
    <button type="button" onClick={() => actions.onLike(targetId)} data-track="toggle_like" data-track-id={targetId} aria-pressed={liked} className={liked ? 'salt-action-active' : ''}>♡ <span>{liked ? '已赞' : '点赞'}{likes + (liked ? 1 : 0) ? ` ${likes + (liked ? 1 : 0)}` : ''}</span></button>
  </div>;
}

function Header({ topic, condition }: { topic: string; condition: SaltCityCondition }) {
  return (
    <header className="salt-header">
      <div className="salt-header-inner">
        <div className="salt-brand" aria-label="微博">weibo<span className="salt-brand-dot">●</span></div>
        <div className="salt-search" aria-label="搜索词"><span className="salt-magnifier">⌕</span><span>{topic}</span></div>
        <div className="salt-header-icons" aria-hidden="true">⌂　✉　☰</div>
      </div>
      <nav className="salt-nav" aria-label="当前搜索类别">
        <span className="salt-nav-selected">{condition === 'smart' ? '智搜' : '综合'}</span>
      </nav>
    </header>
  );
}

function PostMedia({ post, openImage }: { post: Post; openImage: (url: string) => void }) {
  if (post.video) {
    return (
      <div className="salt-video-wrap">
        <video controls playsInline preload="metadata" poster={post.videoPoster} src={post.video} aria-label={`${post.author}的视频`} />
      </div>
    );
  }
  if (!post.photos.length) return null;
  return (
    <div className={`salt-photos ${post.photos.length === 1 ? 'salt-photos-single' : ''}`}>
      {post.photos.map((photo, index) => (
        <button key={photo} type="button" onClick={() => openImage(photo)} data-track="open_post_image" data-track-id={`${post.id}_${index}`}>
          <img src={photo} alt={`${post.author}发布的图片${index + 1}`} />
        </button>
      ))}
    </div>
  );
}

function PostCard({ post, onOpen, onImage }: {
  post: Post;
  onOpen: () => void;
  onImage: (url: string) => void;
}) {
  return (
    <article className="salt-post" data-observe-id={`post_${post.id}`}>
      <div className="salt-post-author">
        <img src={post.avatar} alt={`${post.author}头像`} />
        <div className="salt-post-identity">
          <div><span className="salt-author-name">{post.author}</span>{post.verified && <span className="salt-verified" aria-label="认证账号">V</span>}</div>
          <p>{localTime(post.createdAt)}{post.source ? `　来自 ${post.source}` : ''}</p>
        </div>
        <button className="salt-more" type="button" onClick={onOpen} aria-label="查看微博正文">···</button>
      </div>
      <button type="button" className="salt-post-text" onClick={onOpen} data-track="open_post_detail" data-track-id={post.id}>{post.text}</button>
      <PostMedia post={post} openImage={onImage} />
      <ActionBar targetId={post.id} label={`${post.author}的微博`} reposts={post.reposts} comments={post.comments} likes={post.likes} />
    </article>
  );
}

function DetailOverlay({ post, onClose, onImage, caseId, condition, participantId }: {
  post: Post; onClose: () => void; onImage: (url: string) => void; caseId: CaseId; condition: SaltCityCondition; participantId: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="salt-overlay" role="dialog" aria-modal="true" aria-label={`${post.author}的微博正文`}>
      <div className="salt-detail">
        <div className="salt-detail-header"><button type="button" onClick={onClose} data-track="close_post_detail">←</button><strong>微博正文</strong><a href={post.url} target="_blank" rel="noopener noreferrer" onClick={() => void recordAction('open_original_weibo', participantId, caseId, condition, post.id)}>原微博 ↗</a></div>
        <PostCard post={post} onOpen={() => undefined} onImage={onImage} />
      </div>
    </div>
  );
}

function SmartContent({ bundle, onSource }: {
  bundle: CaseBundle;
  onSource: (mid: string, fallback?: string) => void;
}) {
  const sourcesByMid = useMemo(() => new Map(bundle.smart.sources.map((item) => [item.mid, item])), [bundle.smart.sources]);
  return (
    <article className="salt-ai">
      <div className="salt-ai-query">{bundle.topic}</div>
      <div className="salt-ai-answer-title"><span className="salt-ai-symbol">✦</span><strong>回答</strong><span className="salt-ai-thinking">深度思考</span></div>
      <div className="salt-ai-generated">{bundle.smart.generatedAt ? `时间：${new Date(bundle.smart.generatedAt * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '智搜回答'}</div>
      <div className="salt-ai-answer">
        {bundle.smart.blocks.map((block, index) => {
          if (block.kind === 'media') {
            const items = block.items.filter((item) => sourcesByMid.has(item.mid));
            return items.length ? <div className="salt-ai-media" key={`block_${index}`}>{items.map((item, i) => <button type="button" key={`${item.mid}_${i}`} onClick={() => onSource(item.mid)} data-track="open_ai_media_source" data-track-id={item.mid}><img src={item.image} alt={`${item.author}来源媒体`} /><span>{item.type === 'v' ? '▶' : '▣'} {item.author}</span></button>)}</div> : null;
          }
          const citations = block.citations.filter((cite) => sourcesByMid.has(cite.mid));
          const content = <>{richText(block.text)}{citations.length > 0 && <span className="salt-citations">{citations.map((cite, i) => {
            const source = sourcesByMid.get(cite.mid);
            return <button key={`${cite.mid}_${i}`} type="button" onClick={() => onSource(cite.mid, source?.url)} data-track="open_ai_citation" data-track-id={cite.mid}>@{cite.name || source?.name || '微博原文'} <sup>{cite.index || source?.index}</sup></button>;
          })}</span>}</>;
          if (block.kind === 'heading') return <h2 key={`block_${index}`}>{content}</h2>;
          if (block.kind === 'bullet') return <p className="salt-ai-bullet" key={`block_${index}`}>• {content}</p>;
          return <p key={`block_${index}`}>{content}</p>;
        })}
      </div>
      <div className="salt-ai-trace"><small>内容由AI生成</small></div>
      <ActionBar targetId={`${bundle.id}_ai`} label="微博智搜回答" />
    </article>
  );
}

function InteractionPanel({ panel, draft, onDraft, onClose, onSubmit, comments, loading, sending, error }: {
  panel: Panel;
  draft: string;
  onDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  comments: CommentItem[];
  loading: boolean;
  sending: boolean;
  error: string;
}) {
  return <div className="salt-interaction-backdrop" role="dialog" aria-modal="true" aria-label={`${panel.kind === 'comment' ? '评论' : '转发'}${panel.label}`}>
    <section className="salt-interaction-panel">
      <header><button type="button" onClick={onClose} aria-label="关闭">×</button><strong>{panel.kind === 'comment' ? '评论' : '转发微博'}</strong><span>{panel.label}</span></header>
      {panel.kind === 'comment' && <div className="salt-comment-list">
        {loading ? <p>正在加载评论…</p> : comments.length ? comments.map((comment) => <div className="salt-comment" key={comment.id}><strong>{comment.nickname}</strong><p>{comment.content}</p></div>) : <p>还没有实验评论</p>}
      </div>}
      <div className="salt-interaction-compose">
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} maxLength={500} placeholder={panel.kind === 'comment' ? '写下你的评论…' : '说说你转发这条内容的想法…'} data-track={panel.kind === 'comment' ? 'comment_input' : 'repost_input'} />
        {error && <p className="salt-interaction-error">{error}</p>}
        <div><small>{draft.length}/500</small><button type="button" disabled={!draft.trim() || sending} onClick={onSubmit} data-track={panel.kind === 'comment' ? 'submit_comment' : 'submit_repost'} data-track-id={panel.targetId}>{sending ? '提交中…' : panel.kind === 'comment' ? '发布评论' : '转发'}</button></div>
      </div>
    </section>
  </div>;
}

function SaltCityContent({ participantId, userProfile, condition, caseId }: { participantId: string; userProfile: UserProfile; condition: SaltCityCondition; caseId: CaseId }) {
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Post | null>(null);
  const [image, setImage] = useState('');
  const likesKey = `weibsim_${caseId}_likes_${participantId}`;
  const repostsKey = `weibsim_${caseId}_reposts_${participantId}`;
  const [likedIds, setLikedIds] = useState(() => readSavedIds(likesKey));
  const [repostedIds, setRepostedIds] = useState(() => readSavedIds(repostsKey));
  const [addedComments, setAddedComments] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [draft, setDraft] = useState('');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [panelError, setPanelError] = useState('');
  useExperimentLogger({ pageId: detail ? `${caseId}_post_detail` : `${caseId}_${condition}`, condition: `${caseId}_${condition}`, participantId, userProfile });

  useEffect(() => {
    void fetch(`/data/${caseId}_case.json`).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<CaseBundle>;
    }).then((data) => setBundle(data)).catch(() => setError('实验素材加载失败，请刷新页面。'));
    void recordAction('assigned_condition', participantId, caseId, condition, caseId);
  }, [participantId, caseId, condition]);

  useEffect(() => { document.title = '微博搜索 - 微博'; }, []);

  useEffect(() => {
    if (!bundle) return;
    const syncDetailFromUrl = () => {
      const bid = new URLSearchParams(window.location.search).get('post');
      setDetail(bundle.posts.find((item) => item.bid === bid) || null);
    };
    syncDetailFromUrl();
    window.addEventListener('popstate', syncDetailFromUrl);
    return () => window.removeEventListener('popstate', syncDetailFromUrl);
  }, [bundle]);

  useEffect(() => {
    if (!panel || panel.kind !== 'comment') return;
    const targetId = panel.targetId;
    setCommentsLoading(true);
    void fetch(`/api/comments?targetId=${encodeURIComponent(targetId)}`)
      .then((response) => response.json() as Promise<{ comments?: CommentItem[] }>)
      .then((data) => setComments(Array.isArray(data.comments) ? data.comments : []))
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [panel]);

  const toggleLike = (targetId: string) => {
    const next = new Set(likedIds);
    const action = next.has(targetId) ? 'unlike' : 'like';
    if (next.has(targetId)) next.delete(targetId); else next.add(targetId);
    setLikedIds(next);
    localStorage.setItem(likesKey, JSON.stringify([...next]));
    void recordAction(action, participantId, caseId, condition, targetId);
  };
  const openPanel = (kind: Panel['kind'], targetId: string, label: string) => {
    setPanel({ kind, targetId, label });
    setDraft('');
    setPanelError('');
    setComments([]);
    void recordAction(`open_${kind}`, participantId, caseId, condition, targetId);
  };
  const submitPanel = async () => {
    if (!panel || !draft.trim() || sending) return;
    setSending(true);
    setPanelError('');
    const text = draft.trim();
    try {
      if (panel.kind === 'comment') {
        const response = await fetch('/api/comments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: panel.targetId, content: text, nickname: `实验用户${participantId.slice(-4)}`, participantId }),
        });
        if (!response.ok) throw new Error('评论保存失败，请重试');
        const result = await response.json() as { comment?: CommentItem };
        if (!result.comment) throw new Error('评论保存失败，请重试');
        setComments((current) => [...current, result.comment!]);
        setAddedComments((current) => ({ ...current, [panel.targetId]: (current[panel.targetId] || 0) + 1 }));
        setDraft('');
        void recordAction('submit_comment', participantId, caseId, condition, panel.targetId);
      } else {
        const saved = await recordAction('submit_repost', participantId, caseId, condition, panel.targetId, { content: text });
        if (!saved) throw new Error('转发记录保存失败，请重试');
        const next = new Set(repostedIds);
        next.add(panel.targetId);
        setRepostedIds(next);
        localStorage.setItem(repostsKey, JSON.stringify([...next]));
        setPanel(null);
      }
    } catch (cause) {
      setPanelError(cause instanceof Error ? cause.message : '提交失败，请重试');
    } finally { setSending(false); }
  };

  const openPost = (post: Post) => {
    const url = new URL(window.location.href);
    url.searchParams.set('post', post.bid);
    window.history.pushState({ postId: post.id }, '', url);
    setDetail(post);
    void recordAction('open_post_detail', participantId, caseId, condition, post.id);
  };
  const closePost = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    window.history.replaceState({}, '', url);
    setDetail(null);
  };
  const openSource = (mid: string, fallback?: string) => {
    if (!bundle) return;
    void recordAction('open_ai_source', participantId, caseId, condition, mid);
    const post = bundle.posts.find((item) => item.id === mid);
    if (post) { openPost(post); return; }
    const url = fallback || bundle.smart.sources.find((item) => item.mid === mid)?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (error) return <main className="salt-status">{error}</main>;
  if (!bundle) return <main className="salt-status">正在加载实验素材…</main>;
  return (
    <ActionContext.Provider value={{ likedIds, repostedIds, addedComments, onLike: toggleLike, onComment: (targetId, label) => openPanel('comment', targetId, label), onRepost: (targetId, label) => openPanel('repost', targetId, label) }}>
    <main className="salt-page">
      <Header topic={bundle.topic} condition={condition} />
      <div className="salt-main">
        <div className="salt-content">
          {condition === 'ordinary'
            ? <section aria-label="普通微博新闻">{bundle.posts.map((post) => <PostCard key={post.id} post={post} onOpen={() => openPost(post)} onImage={setImage} />)}</section>
            : <SmartContent bundle={bundle} onSource={openSource} />}
        </div>
      </div>
      {detail && <DetailOverlay post={detail} onClose={closePost} onImage={setImage} caseId={caseId} condition={condition} participantId={participantId} />}
      {image && <div className="salt-image-viewer" role="dialog" aria-modal="true" onClick={() => setImage('')}><button type="button" aria-label="关闭图片">×</button><img src={image} alt="微博图片大图" /></div>}
      {panel && <InteractionPanel panel={panel} draft={draft} onDraft={setDraft} onClose={() => setPanel(null)} onSubmit={() => void submitPanel()} comments={comments} loading={commentsLoading} sending={sending} error={panelError} />}
    </main>
    </ActionContext.Provider>
  );
}

export function SaltCityExperimentPage(props: { participantId: string; userProfile: UserProfile; condition: SaltCityCondition; caseId: CaseId }) {
  return <SaltCityContent {...props} />;
}
