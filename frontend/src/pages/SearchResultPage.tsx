import { useEffect, useMemo, useRef, useState } from 'react';
import { useExperimentLogger } from '../hooks/useExperimentLogger';
import { logInteraction } from '../lib/supabaseLogger';
import type { UserProfile } from '../types/experiment';

type LabPost = {
  post_id: string;
  post_url?: string;
  author_name: string;
  author_url?: string;
  author_avatar_url?: string;
  content_text: string;
  created_at?: string;
  source?: string;
  reposts_count?: number | string;
  comments_count?: number | string;
  attitudes_count?: number | string;
  images?: string[];
  video_url?: string;
  video_stream_url?: string;
  video_poster?: string;
};

type LabBundle = {
  topic: string;
  generated_at?: number | null;
  smart?: {
    title?: string;
    summary?: string;
    answer_text?: string;
    intro?: string;
    gallery?: string[];
    link_list?: string[];
    source_links?: Array<{
      scheme?: string;
      mid?: string;
      search_url?: string;
    }>;
  };
  posts: LabPost[];
};

type CommentItem = {
  id: string;
  targetId: string;
  content: string;
  nickname: string;
  participantId?: string;
  createdAt: number;
  likes?: number;
};

interface SearchResultPageProps {
  participantId?: string;
  userProfile: UserProfile;
  forcedKeyword?: string;
}

function n(v: number | string | undefined) {
  if (typeof v === 'number') return v;
  const parsed = Number(v || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(text: string): string {
  return (text || '').replace(/\s+/g, ' ').replace(/展开c/g, '').trim();
}

function renderTopicText(text: string) {
  const cleaned = cleanText(text);
  const parts = cleaned.split(/(#.+?#)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (/^#.+#$/.test(part)) {
      return (
        <span key={`tag_${idx}`} className="text-[#5472a8]">
          {part}
        </span>
      );
    }
    return <span key={`txt_${idx}`}>{part}</span>;
  });
}

function getViewerNick() {
  const existing = sessionStorage.getItem('weibsim_nick');
  if (existing) return existing;
  const pool = ['土豆观察员', '理性路人', '高速记录员', '城市通勤者', '认真吃瓜', '安稳返程', '观察小站'];
  const nick = `${pool[Math.floor(Math.random() * pool.length)]}${Math.floor(10 + Math.random() * 90)}`;
  sessionStorage.setItem('weibsim_nick', nick);
  return nick;
}

function parseMidFromLink(link: string): string {
  const m = /mblogid=(\d+)/.exec(link || '');
  return m?.[1] || '';
}

function normalizeSmartAnswer(raw: string): string {
  let text = raw || '';
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  text = text.replace(/```wbCustomBlock[\s\S]*?```/g, '');
  text = text.replace(/<media-block>[\s\S]*?<\/media-block>/g, '');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/\\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function parseHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function saveAction(payload: Record<string, unknown>) {
  try {
    await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // no-op
  }
}

async function fetchComments(targetId: string): Promise<CommentItem[]> {
  try {
    const res = await fetch(`/api/comments?targetId=${encodeURIComponent(targetId)}`);
    const json = (await res.json()) as { comments?: CommentItem[] };
    return Array.isArray(json.comments) ? json.comments : [];
  } catch {
    return [];
  }
}

async function sendComment(payload: {
  targetId: string;
  content: string;
  nickname: string;
  participantId: string;
}): Promise<CommentItem | null> {
  try {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { comment?: CommentItem };
    return json.comment || null;
  } catch {
    return null;
  }
}

function SourceCapsule({
  post,
  onOpen,
}: {
  post?: LabPost;
  onOpen: (post: LabPost) => void;
}) {
  if (!post) return null;
  const c1 = Math.max(1, Math.min(9, Math.floor(n(post.reposts_count) / 20) || 1));
  const c2 = Math.max(1, Math.min(9, Math.floor(n(post.comments_count) / 100) || 5));
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <button
        type="button"
        className="inline-flex h-6 max-w-[10.5rem] items-center rounded-full bg-[#f1f1f1] px-2 text-[14px] leading-none text-[#7a7a7a]"
        data-post-id={post.post_id}
        data-action="open_source_capsule"
        onClick={() => onOpen(post)}
      >
        <span className="truncate">@{post.author_name}</span>
      </button>
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f1f1f1] px-2 text-[13px] text-[#7a7a7a]">{c1}</span>
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f1f1f1] px-2 text-[13px] text-[#7a7a7a]">{c2}</span>
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f1f1f1] px-2 text-[13px] text-[#7a7a7a]">···</span>
    </span>
  );
}

function AutoPlayVideo({
  postId,
  streamUrl,
  pageUrl,
  poster,
}: {
  postId: string;
  streamUrl?: string;
  pageUrl?: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const playable = Boolean(streamUrl && /\.(mp4|webm|m3u8)(\?|$)/i.test(streamUrl));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playable) return;
    video.muted = muted;
    if (muted) {
      void video.play().catch(() => undefined);
    }
  }, [muted, playable]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playable) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
            void video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0.2, 0.55, 0.8] }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [playable]);

  if (!playable || failed) {
    return (
      <button
        type="button"
        className="relative mt-2 block w-full overflow-hidden rounded-md bg-black"
        data-post-id={postId}
        data-action="open_video_page"
        onClick={() => pageUrl && window.open(pageUrl, '_blank', 'noopener,noreferrer')}
      >
        {poster ? <img src={poster} alt="video-poster" className="h-52 w-full object-cover" /> : <div className="h-52 w-full bg-black" />}
        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white">▶</span>
      </button>
    );
  }

  return (
    <div className="relative mt-2 overflow-hidden rounded-md bg-black">
      <video
        ref={videoRef}
        src={streamUrl}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="h-52 w-full object-cover"
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[12px] text-white"
        data-post-id={postId}
        data-action="toggle_video_mute"
        onClick={() => setMuted((v) => !v)}
      >
        {muted ? '静音' : '有声'}
      </button>
      {pageUrl ? (
        <button
          type="button"
          className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[12px] text-white"
          data-post-id={postId}
          data-action="open_video_page"
          onClick={() => window.open(pageUrl, '_blank', 'noopener,noreferrer')}
        >
          原视频
        </button>
      ) : null}
    </div>
  );
}

function MediaGrid({ postId, images }: { postId: string; images: string[] }) {
  if (!images.length) return null;
  const single = images.length === 1;
  return (
    <div className={`mt-2 grid gap-1 ${single ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {images.map((img, idx) => (
        <button
          type="button"
          key={`${postId}_${idx}`}
          data-post-id={postId}
          data-action="open_image"
          data-image-index={String(idx)}
          className={`overflow-hidden rounded-md bg-[#f2f2f2] ${single ? '' : 'h-24'}`}
          onClick={() => window.open(img, '_blank', 'noopener,noreferrer')}
        >
          <img src={img} alt={`${postId}_${idx}`} className={`w-full object-cover ${single ? 'max-h-80' : 'h-24'}`} loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function ComposeModal({
  open,
  initialText,
  cardTitle,
  cardSummary,
  cardImage,
  nickname,
  onClose,
  onSend,
}: {
  open: boolean;
  initialText: string;
  cardTitle: string;
  cardSummary: string;
  cardImage: string;
  nickname: string;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
        <button type="button" className="text-[16px] text-gray-600" onClick={onClose}>取消</button>
        <div className="text-center">
          <p className="text-[22px] font-semibold">发微博</p>
          <p className="text-[12px] text-gray-500">{nickname}</p>
        </div>
        <button
          type="button"
          className="rounded bg-[#ff9d1a] px-4 py-1.5 text-white"
          onClick={() => {
            onSend(text.trim());
            onClose();
          }}
        >
          发送
        </button>
      </header>
      <div className="px-3 py-3">
        <textarea
          className="h-44 w-full resize-none border-none text-[18px] outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          data-track="compose_input"
        />
        <div className="mt-4 flex gap-3 rounded bg-[#f5f5f5] p-2">
          {cardImage ? <img src={cardImage} alt="thumb" className="h-16 w-24 rounded object-cover" /> : <div className="h-16 w-24 rounded bg-gray-200" />}
          <div className="min-w-0">
            <p className="truncate text-[15px]">{cardTitle}</p>
            <p className="mt-1 line-clamp-2 text-[14px] text-gray-500">{cardSummary}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65] bg-black/30" onClick={onClose}>
      <div className="absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-[16px] font-medium">分享成功</p>
        <p className="mt-2 text-center text-[14px] text-gray-500">已生成分享卡片，可继续实验记录</p>
        <button type="button" className="mt-3 w-full rounded bg-[#ff9d1a] py-2 text-white" onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}

function OriginalModal({
  post,
  onOpenCompose,
  onOpenShare,
  liked,
  likeCount,
  onLikePost,
  onClose,
}: {
  post: LabPost;
  onOpenCompose: () => void;
  onOpenShare: () => void;
  liked: boolean;
  likeCount: number;
  onLikePost: () => void;
  onClose: () => void;
}) {
  const images = (post.images || []).slice(0, 9);
  const hasVideo = Boolean(post.video_url || post.video_stream_url);

  return (
    <div className="fixed inset-0 z-50 bg-black/20" data-observe-id={`original_${post.post_id}`} data-post-id={post.post_id}>
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-y-auto bg-white">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <button type="button" onClick={onClose} data-track="close_original">←</button>
          <h2 className="text-lg font-semibold">微博正文</h2>
          <span>···</span>
        </header>

        <div className="px-4 pb-24 pt-3 text-[#2c2c2c]">
          <div className="text-sm text-gray-500">公开</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {post.author_avatar_url ? (
                <img src={post.author_avatar_url} alt={post.author_name} className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="h-11 w-11 rounded-full bg-gray-200" />
              )}
              <div className="min-w-0">
                <div className="truncate text-[20px] font-semibold text-[#f1761f]">{post.author_name}</div>
                <div className="truncate text-[12px] text-gray-500">{post.created_at || ''} {post.source || ''}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {post.post_url ? (
                <button
                  type="button"
                  className="rounded-full border border-[#d4d7df] px-3 py-1 text-[13px] text-[#616a7f]"
                  data-post-id={post.post_id}
                  data-action="open_original_url"
                  onClick={() => window.open(post.post_url, '_blank', 'noopener,noreferrer')}
                >
                  查看原文
                </button>
              ) : null}
              <button type="button" className="rounded-full border border-orange-300 px-3 py-1 text-orange-500">+关注</button>
            </div>
          </div>

          <p className="mt-3 text-[15px] leading-7">{cleanText(post.content_text)}</p>

          {hasVideo ? (
            <AutoPlayVideo
              postId={post.post_id}
              streamUrl={post.video_stream_url}
              pageUrl={post.video_url || post.post_url}
              poster={post.video_poster || images[0]}
            />
          ) : (
            <MediaGrid postId={post.post_id} images={images} />
          )}

          <div className="mt-4 flex items-center justify-around border-t border-gray-100 pt-3 text-base text-gray-700">
            <button type="button" data-track="orig_comment" onClick={onOpenCompose}>评论 {n(post.comments_count)}</button>
            <button type="button" data-track="orig_share" onClick={onOpenShare}>分享 {n(post.reposts_count)}</button>
            <button type="button" data-track="orig_like" onClick={onLikePost} className={liked ? 'text-[#ff8a00]' : ''}>点赞 {likeCount}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function SearchResultPage({ participantId = 'p001', userProfile, forcedKeyword = '#晚5秒要付1700高速费当事人发声#' }: SearchResultPageProps) {
  const [bundle, setBundle] = useState<LabBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeNav, setActiveNav] = useState<'comprehensive' | 'smart'>('comprehensive');
  const [showSmartDetail, setShowSmartDetail] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [activePost, setActivePost] = useState<LabPost | null>(null);
  const [smartComments, setSmartComments] = useState<CommentItem[]>([]);
  const [postComments, setPostComments] = useState<CommentItem[]>([]);
  const [liked, setLiked] = useState(15);
  const [smartLike, setSmartLike] = useState(() => {
    const likedOnce = sessionStorage.getItem(`weibsim_smart_liked_${participantId}`) === '1';
    return likedOnce ? 20 : 19;
  });
  const [smartLiked, setSmartLiked] = useState(() => sessionStorage.getItem(`weibsim_smart_liked_${participantId}`) === '1');
  const [composeContext, setComposeContext] = useState({
    targetId: 'smart_detail_main',
    initialText: forcedKeyword,
    title: forcedKeyword.replace(/#/g, ''),
    summary: '点击发送参与讨论',
    image: '',
  });
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(() => {
    const cached = sessionStorage.getItem(`weibsim_comment_likes_${participantId}`);
    if (!cached) return new Set<string>();
    try {
      return new Set<string>(JSON.parse(cached) as string[]);
    } catch {
      return new Set<string>();
    }
  });
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(() => {
    const cached = sessionStorage.getItem(`weibsim_post_likes_${participantId}`);
    if (!cached) return new Set<string>();
    try {
      return new Set<string>(JSON.parse(cached) as string[]);
    } catch {
      return new Set<string>();
    }
  });
  const [postLikeCounts, setPostLikeCounts] = useState<Record<string, number>>({});

  const zhiSouRef = useRef<HTMLDivElement | null>(null);
  const viewerNick = useMemo(() => getViewerNick(), []);
  const viewedRef = useRef<Set<string>>(new Set());
  const currentPageId = activePost ? 'original_detail' : showSmartDetail ? 'smart_detail' : 'comprehensive_feed';
  const normalizeObservedId = (rawId: string) => rawId.replace(/^post_/, '').replace(/^original_/, '');

  useExperimentLogger({
    pageId: currentPageId,
    condition: 'lab_default',
    participantId,
    userProfile,
  });

  useEffect(() => {
    let active = true;
    void fetch('/data/lab_bundle.json')
      .then((r) => r.json())
      .then((data: LabBundle) => {
        if (!active) return;
        if (!data || !Array.isArray(data.posts)) {
          setError('lab_bundle.json 格式无效');
          setBundle(null);
        } else {
          setBundle(data);
          setError('');
        }
      })
      .catch(() => {
        if (!active) return;
        setError('无法加载 /data/lab_bundle.json，请先执行话题构建脚本');
        setBundle(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    setSmartComments([]);

    return () => {
      active = false;
    };
  }, []);

  const posts = bundle?.posts || [];
  const keyword = forcedKeyword || bundle?.topic || '#晚5秒要付1700高速费当事人发声#';
  const smartTitle = bundle?.smart?.title || keyword;
  const smartSummary = bundle?.smart?.summary || bundle?.smart?.intro || '';
  const smartAnswerText = useMemo(
    () => normalizeSmartAnswer(bundle?.smart?.answer_text || smartSummary || ''),
    [bundle?.smart?.answer_text, smartSummary]
  );
  const smartAnswerParagraphs = useMemo(
    () => smartAnswerText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
    [smartAnswerText]
  );
  const smartGallery = (bundle?.smart?.gallery || []).slice(0, 3);

  const postById = useMemo(() => {
    const m = new Map<string, LabPost>();
    posts.forEach((p) => m.set(p.post_id, p));
    return m;
  }, [posts]);

  const smartSourceLinks = useMemo(() => {
    const raw = bundle?.smart?.source_links;
    const fallback = (bundle?.smart?.link_list || []).map((scheme) => ({
      scheme,
      mid: parseMidFromLink(scheme),
      search_url: '',
    }));
    const list = Array.isArray(raw) && raw.length ? raw : fallback;
    const deduped: Array<{ scheme: string; mid: string; search_url: string }> = [];
    const seen = new Set<string>();
    list.forEach((item) => {
      const scheme = String(item?.scheme || '').trim();
      const mid = String(item?.mid || parseMidFromLink(scheme) || '').trim();
      const search_url = String(item?.search_url || '').trim();
      if (!scheme && !search_url && !mid) return;
      const key = `${scheme}|${mid}|${search_url}`;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push({ scheme, mid, search_url });
    });
    return deduped;
  }, [bundle?.smart?.source_links, bundle?.smart?.link_list]);

  const smartSourcePosts = useMemo(() => {
    const out: LabPost[] = [];
    const seen = new Set<string>();
    smartSourceLinks.forEach((source) => {
      if (!source.mid || seen.has(source.mid)) return;
      seen.add(source.mid);
      const hit = postById.get(source.mid);
      if (hit) out.push(hit);
    });
    return out;
  }, [postById, smartSourceLinks]);

  const headlinePost =
    posts.find((p) => p.post_id === '5270471789774972') ||
    posts.find((p) => Boolean(p.video_url || p.video_stream_url)) ||
    posts[0];
  const feedPosts = posts.filter((p) => p.post_id !== headlinePost?.post_id);
  const topicThumb = smartGallery[0] || headlinePost?.video_poster || headlinePost?.images?.[0] || '';
  const smartMedia = useMemo(() => {
    const merged: string[] = [];
    const seen = new Set<string>();
    [...smartGallery, ...(smartSourcePosts[0]?.images || []), ...(smartSourcePosts[1]?.images || []), ...(smartSourcePosts[2]?.images || [])].forEach((img) => {
      if (!img || seen.has(img)) return;
      seen.add(img);
      merged.push(img);
    });
    return merged.slice(0, 3);
  }, [smartGallery, smartSourcePosts]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('button,[data-track]') as HTMLElement | null;
      if (!el) return;
      const scope = el.closest('[data-post-id],[data-observe-id]') as HTMLElement | null;
      const postId = el.dataset.postId || scope?.dataset.postId || scope?.dataset.observeId || 'global';
      const action = el.dataset.action || el.dataset.track || 'click';

      void logInteraction({
        postId,
        eventType: 'click',
        detail: {
          action,
          page: currentPageId,
          participant_id: participantId,
          target_post_id: normalizeObservedId(postId),
          label: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
          image_index: el.dataset.imageIndex ? Number(el.dataset.imageIndex) : null,
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
        },
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [participantId, currentPageId]);

  useEffect(() => {
    const observedNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-observe-id]'));
    if (!observedNodes.length) return;

    const pending = new Map<string, number>();
    const staying = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          const postId = element.dataset.observeId;
          if (!postId) return;

          if (entry.isIntersecting) {
            if (!viewedRef.current.has(postId)) {
              viewedRef.current.add(postId);
              void logInteraction({
                postId,
                eventType: 'view',
                detail: {
                  trigger: 'midline_enter',
                  page: currentPageId,
                  participant_id: participantId,
                  target_post_id: normalizeObservedId(postId),
                },
              });
            }

            if (!pending.has(postId) && !staying.has(postId)) {
              const timer = window.setTimeout(() => {
                pending.delete(postId);
                staying.set(postId, Date.now());
              }, 1000);
              pending.set(postId, timer);
            }
            return;
          }

          const waitTimer = pending.get(postId);
          if (waitTimer) {
            window.clearTimeout(waitTimer);
            pending.delete(postId);
          }

          const startedAt = staying.get(postId);
          if (!startedAt) return;
          staying.delete(postId);
          const dwellMs = Date.now() - startedAt;
          if (dwellMs <= 0) return;

          void logInteraction({
            postId,
            eventType: 'stay',
            detail: {
              dwell_ms: dwellMs,
              trigger: 'midline_leave',
              page: currentPageId,
              participant_id: participantId,
              target_post_id: normalizeObservedId(postId),
            },
          });
          void saveAction({
            action: 'dwell',
            page: currentPageId,
            targetId: postId,
            targetPostId: normalizeObservedId(postId),
            dwellMs,
            participantId,
            nickname: viewerNick,
            ts: Date.now(),
          });
        });
      },
      {
        root: null,
        threshold: [0],
        rootMargin: '-49% 0px -49% 0px',
      }
    );

    observedNodes.forEach((node) => observer.observe(node));
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      const now = Date.now();
      staying.forEach((startedAt, postId) => {
        const dwellMs = now - startedAt;
        if (dwellMs > 0) {
          void logInteraction({
            postId,
            eventType: 'stay',
            detail: {
              dwell_ms: dwellMs,
              trigger: 'observer_cleanup',
              page: currentPageId,
              participant_id: participantId,
              target_post_id: normalizeObservedId(postId),
            },
          });
          void saveAction({
            action: 'dwell',
            page: currentPageId,
            targetId: postId,
            targetPostId: normalizeObservedId(postId),
            dwellMs,
            participantId,
            nickname: viewerNick,
            ts: Date.now(),
          });
        }
      });
      observer.disconnect();
    };
  }, [posts, showSmartDetail, activePost, currentPageId, participantId, viewerNick]);

  const openPostDetail = (post: LabPost) => {
    setActivePost(post);
    setPostComments([]);
    void saveAction({
      action: 'open_post_detail',
      page: currentPageId,
      targetId: post.post_id,
      targetPostId: post.post_id,
      targetAuthor: post.author_name,
      targetSnippet: cleanText(post.content_text).slice(0, 60),
      participantId,
      nickname: viewerNick,
      ts: Date.now(),
    });
  };

  const gotoZhiSou = () => {
    setActiveNav('smart');
    setShowSmartDetail(true);
    zhiSouRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getSmartSourceLabel = (source: { scheme: string; mid: string; search_url: string }, idx: number) => {
    if (source.mid) {
      const post = postById.get(source.mid);
      if (post) return `@${post.author_name}`;
      return `微博原文 ${source.mid.slice(-6)}`;
    }
    if (source.scheme.startsWith('historyweibo://')) return `历史微博 ${idx + 1}`;
    if (source.scheme.startsWith('http')) {
      const host = parseHost(source.scheme);
      return host ? `网页来源 ${host}` : `网页来源 ${idx + 1}`;
    }
    if (source.search_url) {
      const host = parseHost(source.search_url);
      return host ? `来源 ${host}` : `来源 ${idx + 1}`;
    }
    return `来源 ${idx + 1}`;
  };

  const openSmartSource = (source: { scheme: string; mid: string; search_url: string }, idx: number) => {
    void saveAction({
      action: 'open_smart_source_link',
      page: currentPageId,
      targetId: `smart_source_${idx}`,
      targetPostId: source.mid || '',
      sourceScheme: source.scheme,
      sourceSearchUrl: source.search_url,
      participantId,
      nickname: viewerNick,
      ts: Date.now(),
    });

    const post = source.mid ? postById.get(source.mid) : undefined;
    if (post) {
      openPostDetail(post);
      return;
    }

    let targetUrl = '';
    if (source.scheme.startsWith('http')) {
      targetUrl = source.scheme;
    } else if (source.search_url) {
      targetUrl = source.search_url;
    } else if (source.mid) {
      targetUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(source.mid)}&page=1`;
    }

    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const likeSmart = () => {
    const next = !smartLiked;
    setSmartLiked(next);
    setSmartLike((v) => Math.max(0, v + (next ? 1 : -1)));
    if (next) sessionStorage.setItem(`weibsim_smart_liked_${participantId}`, '1');
    else sessionStorage.removeItem(`weibsim_smart_liked_${participantId}`);
    void saveAction({
      action: next ? 'like_smart' : 'unlike_smart',
      page: currentPageId,
      targetId: 'smart_detail_main',
      targetPostId: 'smart_detail_main',
      participantId,
      nickname: viewerNick,
      ts: Date.now(),
    });
  };

  const togglePostLike = (post: LabPost) => {
    const alreadyLiked = likedPostIds.has(post.post_id);
    const next = new Set(likedPostIds);
    if (alreadyLiked) next.delete(post.post_id);
    else next.add(post.post_id);
    setLikedPostIds(next);
    sessionStorage.setItem(`weibsim_post_likes_${participantId}`, JSON.stringify(Array.from(next)));
    setPostLikeCounts((prev) => ({
      ...prev,
      [post.post_id]: Math.max(0, (prev[post.post_id] ?? n(post.attitudes_count)) + (alreadyLiked ? -1 : 1)),
    }));
    void saveAction({
      action: alreadyLiked ? 'unlike_post' : 'like_post',
      page: currentPageId,
      targetId: post.post_id,
      targetPostId: post.post_id,
      targetAuthor: post.author_name,
      targetSnippet: cleanText(post.content_text).slice(0, 60),
      participantId,
      nickname: viewerNick,
      ts: Date.now(),
    });
  };

  const likeComment = (id: string) => {
    if (likedCommentIds.has(id)) return;
    const next = new Set(likedCommentIds);
    next.add(id);
    setLikedCommentIds(next);
    sessionStorage.setItem(`weibsim_comment_likes_${participantId}`, JSON.stringify(Array.from(next)));

    if (activePost) {
      setPostComments((prev) => prev.map((c) => (c.id === id ? { ...c, likes: (c.likes || 0) + 1 } : c)));
    } else {
      setSmartComments((prev) => prev.map((c) => (c.id === id ? { ...c, likes: (c.likes || 0) + 1 } : c)));
    }
    void saveAction({ action: 'like_comment', page: currentPageId, targetId: id, participantId, nickname: viewerNick, ts: Date.now() });
  };

  const handleSendComment = (text: string) => {
    if (!text) return;
    void sendComment({ targetId: composeContext.targetId, content: text, nickname: viewerNick, participantId }).then((comment) => {
      if (!comment) return;
      if (composeContext.targetId === 'smart_detail_main') setSmartComments((prev) => [...prev, comment]);
      else setPostComments((prev) => [...prev, comment]);
    });
    void saveAction({ action: 'create_comment', page: currentPageId, targetId: composeContext.targetId, participantId, nickname: viewerNick, contentLength: text.length, ts: Date.now() });
  };

  const quickAction = (action: 'repost' | 'comment' | 'like', post: LabPost) => {
    if (action === 'like') togglePostLike(post);
    if (action === 'comment') {
      setComposeContext({
        targetId: post.post_id,
        initialText: keyword,
        title: keyword.replace(/#/g, ''),
        summary: cleanText(post.content_text).slice(0, 60),
        image: post.images?.[0] || post.video_poster || smartGallery[0] || '',
      });
      setShowCompose(true);
    }
    if (action === 'repost') setShowShare(true);
    void saveAction({
      action: `feed_${action}`,
      page: currentPageId,
      targetId: post.post_id,
      targetPostId: post.post_id,
      targetAuthor: post.author_name,
      targetSnippet: cleanText(post.content_text).slice(0, 60),
      participantId,
      nickname: viewerNick,
      ts: Date.now(),
    });
  };

  const handleHeaderBack = () => {
    if (activePost) {
      setActivePost(null);
      void saveAction({ action: 'back_from_original', page: 'original_detail', targetId: activePost.post_id, participantId, nickname: viewerNick, ts: Date.now() });
      return;
    }
    if (showCompose) {
      setShowCompose(false);
      void saveAction({ action: 'close_compose', page: currentPageId, targetId: composeContext.targetId, participantId, nickname: viewerNick, ts: Date.now() });
      return;
    }
    if (showShare) {
      setShowShare(false);
      void saveAction({ action: 'close_share', page: currentPageId, targetId: 'share', participantId, nickname: viewerNick, ts: Date.now() });
      return;
    }
    if (showSmartDetail || activeNav === 'smart') {
      setShowSmartDetail(false);
      setActiveNav('comprehensive');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      void saveAction({ action: 'back_to_comprehensive', page: currentPageId, targetId: 'comprehensive_feed', participantId, nickname: viewerNick, ts: Date.now() });
      return;
    }
    void saveAction({ action: 'back_ignored', page: currentPageId, targetId: 'root', participantId, nickname: viewerNick, ts: Date.now() });
  };

  if (loading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f4f4f5] p-4 text-sm text-gray-500">
        正在加载话题素材...
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-[#f4f4f5] p-4 text-sm text-red-500">
        {error}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[#f2f3f6] pb-16 text-[#222]">
      <header className="sticky top-0 z-20 shadow-sm">
        <div className="bg-gradient-to-r from-[#82878f] to-[#767573] px-3 pb-2 pt-3 text-white">
          <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
            <span>13:14</span>
            <span>5G · 59%</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <button type="button" className="text-3xl leading-none text-white/95" data-track="back_search" data-post-id="search_header" onClick={handleHeaderBack}>←</button>
            <div className="flex h-11 flex-1 items-center rounded-full bg-[#ececef] px-4 text-[#414651]">
              <span className="truncate text-[16px]">{keyword}</span>
              <span className="ml-2 text-[20px] leading-none text-[#7f8591]">⊗</span>
            </div>
            <button type="button" className="text-2xl text-white/95" data-track="open_header_menu" data-post-id="search_header">···</button>
          </div>
          {!showSmartDetail ? (
            <div className="mb-1 flex items-start gap-2 rounded-t-xl bg-white px-2 pt-2 text-[#3f4652]" data-observe-id="smart_topic_banner" data-post-id="smart_topic_banner">
              {topicThumb ? (
                <img src={topicThumb} alt="topic-thumb" className="h-16 w-16 rounded-md object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-md bg-gray-200" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#f9f9f9]">
                  <span className="text-[#f3f4f6]">{smartTitle}</span>
                  <span className="ml-1 rounded bg-[#ff8a00] px-1 text-[11px] text-white">热搜</span>
                </p>
                <div className="mt-1 rounded-t-md bg-white px-2 py-1.5 text-[#7f8696]">
                  <p className="truncate text-[14px]">阅读量 532.6万  讨论量 905  〉</p>
                  <p className="truncate text-[14px]">主持人：新浪热点 | 113家媒体发布</p>
                </div>
                <div className="mb-1 mt-1 flex items-center gap-2 text-[12px]">
                  <span className="rounded-full bg-[#fff1e6] px-2 py-1 text-[#ff8a00]">热搜TOP2〉</span>
                  <span className="rounded-full bg-[#fff1e6] px-2 py-1 text-[#ff8a00]">社会TOP2〉</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <nav className="flex items-center justify-between border-b border-[#eceef3] bg-white px-3 py-2 text-[18px] text-[#98a0b0]">
          <button
            type="button"
            className={`relative py-1 ${activeNav === 'comprehensive' && !showSmartDetail ? 'font-semibold text-[#2c2c2c]' : ''}`}
            onClick={() => {
              setActiveNav('comprehensive');
              setShowSmartDetail(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            data-track="nav_comprehensive"
          >
            综合
            {activeNav === 'comprehensive' && !showSmartDetail ? <span className="absolute -bottom-2 left-0 h-1 w-7 rounded bg-[#ff8a00]" /> : null}
          </button>
          <button
            type="button"
            className={`relative py-1 ${activeNav === 'smart' || showSmartDetail ? 'font-semibold text-[#2c2c2c]' : ''}`}
            onClick={gotoZhiSou}
            data-track="nav_smart"
          >
            智搜
            {activeNav === 'smart' || showSmartDetail ? <span className="absolute -bottom-2 left-0 h-1 w-7 rounded bg-[#ff8a00]" /> : null}
          </button>
          <span className="relative py-1">
            实时
            <i className="absolute -right-2.5 top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#ff3a30]" />
          </span>
          <span>视频</span>
          <span>图片</span>
          <span>关注</span>
          <span>热门</span>
          <span>＋</span>
        </nav>
      </header>

      {showSmartDetail ? (
        <section className="bg-white pb-20" data-observe-id="smart_detail_main" data-post-id="smart_detail_main">
          <div className="px-4 pt-4">
            <h2 className="text-[22px] font-semibold text-[#2d2f35]">{smartTitle}</h2>
            <div className="mt-2 flex items-center justify-between text-[16px] text-[#8e94a3]">
              <span>◔ 回答 · 深度思考 ▾</span>
              <span>时间：54分钟前</span>
            </div>

            <div className="mt-2">
              <p className="text-[14px] text-[#8e94a3]">完整回答（{smartAnswerText.length}字）</p>
            </div>

            {smartMedia.length ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {smartMedia.map((img, idx) => (
                  <button
                    key={img}
                    type="button"
                    data-post-id="smart_detail_main"
                    data-action="open_smart_gallery"
                    data-image-index={String(idx)}
                    className="h-24 overflow-hidden rounded bg-gray-100"
                    onClick={() => window.open(img, '_blank', 'noopener,noreferrer')}
                  >
                    <img src={img} alt={`smart_${idx}`} className="h-24 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {smartAnswerParagraphs.length ? (
                smartAnswerParagraphs.map((paragraph, idx) => (
                  <p key={`answer_${idx}`} className="text-[15px] leading-7 text-[#2d2f35]">
                    {paragraph}
                  </p>
                ))
              ) : (
                <p className="text-[15px] leading-7 text-[#2d2f35]">{smartSummary}</p>
              )}
            </div>

            <div className="mt-5">
              <h3 className="text-[18px] font-semibold text-[#2d2f35]">
                原文跳转（{smartSourceLinks.length}）
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {smartSourceLinks.map((source, idx) => (
                  <button
                    key={`${source.scheme}_${source.mid}_${idx}`}
                    type="button"
                    data-post-id={source.mid || `smart_source_${idx}`}
                    data-action="open_smart_source_capsule"
                    className="rounded-full border border-[#e5e8ef] bg-[#f7f8fb] px-3 py-1.5 text-[13px] text-[#4a556b]"
                    onClick={() => openSmartSource(source, idx)}
                  >
                    {getSmartSourceLabel(source, idx)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="fixed bottom-[64px] left-0 right-0 z-30 mx-auto w-full max-w-[430px] px-2">
            <div className="flex items-center justify-between rounded-xl border border-[#e9eaef] bg-white px-3 py-2 shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ff8a00] text-xl text-white">◔</span>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-[#ff7e1a]">微博智搜</p>
                  <p className="truncate text-[13px] text-[#8e94a3]">你的专属AI助手，随时帮你看懂微博</p>
                </div>
              </div>
              <button type="button" className="rounded-full bg-[#ff9800] px-4 py-1.5 text-[14px] text-white" data-track="follow_zhisou_float">+关注</button>
            </div>
          </div>

          <footer className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex w-full max-w-[430px] items-center gap-2 border-t border-gray-200 bg-white px-3 py-2">
            <button type="button" className="flex h-10 flex-1 items-center justify-center rounded-full bg-[#f3f3f3] text-sm text-[#3a3a3a]" data-track="open_follow_up">继续问智搜 625人正在追问</button>
            <button
              type="button"
              className="w-10 text-center text-sm"
              data-track="open_compose"
              onClick={() => {
                setComposeContext({
                  targetId: 'smart_detail_main',
                  initialText: keyword,
                  title: keyword.replace(/#/g, ''),
                  summary: (smartAnswerText || smartSummary).slice(0, 60),
                  image: smartGallery[0] || '',
                });
                setShowCompose(true);
              }}
            >
              ✎ 91
            </button>
            <button type="button" className="w-10 text-center text-sm" data-track="open_share" onClick={() => setShowShare(true)}>⤴ 31</button>
            <button
              type="button"
              className={`w-12 text-center text-sm ${smartLiked ? 'text-[#ff8a00]' : 'text-[#444b5e]'}`}
              data-track="click_like_smart"
              data-post-id="smart_detail_main"
              data-action="smart_like"
              onClick={likeSmart}
            >
              👍 {smartLike}
            </button>
          </footer>
        </section>
      ) : (
        <>
          <section className="bg-white pb-20">
            {headlinePost ? (
              <article className="border-b border-gray-100 bg-white px-4 py-3" data-observe-id={`post_${headlinePost.post_id}`} data-post-id={headlinePost.post_id}>
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    {headlinePost.author_avatar_url ? (
                      <img src={headlinePost.author_avatar_url} alt={headlinePost.author_name} className="h-10 w-10 rounded-full bg-gray-100 object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-medium text-[#f1761f]">
                        {headlinePost.author_name}
                        <span className="ml-1 text-[14px] text-[#d6872d]">♛Ⅲ</span>
                      </div>
                      <div className="truncate text-[12px] text-gray-500">
                        <span className="mr-1 rounded border border-[#ff6f61] px-1 text-[#ff6f61]">置顶</span>
                        昨天 07:24 新浪热点官方微博... 已编辑
                      </div>
                    </div>
                  </div>
                  <button type="button" className="rounded-full border border-orange-300 px-3 py-1 text-orange-500">+关注</button>
                </div>

                <button
                  type="button"
                  className="mt-2 w-full text-left text-[15px] leading-8 text-[#2f3542]"
                  data-track="open_feed_detail"
                  data-track-id={`post_${headlinePost.post_id}`}
                  onClick={() => openPostDetail(headlinePost)}
                >
                  {renderTopicText(headlinePost.content_text)}
                  <span className="ml-1 text-[#5472a8]">全文</span>
                </button>

                <button
                  type="button"
                  className="mt-2 block w-full overflow-hidden rounded-md"
                  data-post-id={headlinePost.post_id}
                  data-action="open_pinned_media"
                  onClick={() => openPostDetail(headlinePost)}
                >
                  <img
                    src={headlinePost.images?.[0] || headlinePost.video_poster || topicThumb}
                    alt={headlinePost.author_name}
                    className="w-full rounded-md object-cover"
                  />
                </button>

                <div className="mt-3 flex items-center justify-around border-t border-gray-100 pt-2 text-[#6f7688]">
                  <button type="button" className="text-[15px]" data-post-id={headlinePost.post_id} data-action="topic_repost" onClick={() => quickAction('repost', headlinePost)}>↗ {n(headlinePost.reposts_count)}</button>
                  <button type="button" className="text-[15px]" data-post-id={headlinePost.post_id} data-action="topic_comment" onClick={() => quickAction('comment', headlinePost)}>💬 {n(headlinePost.comments_count)}</button>
                  <button type="button" className={`text-[15px] ${likedPostIds.has(headlinePost.post_id) ? 'text-[#ff8a00]' : ''}`} data-post-id={headlinePost.post_id} data-action="topic_like" onClick={() => quickAction('like', headlinePost)}>👍 {postLikeCounts[headlinePost.post_id] ?? n(headlinePost.attitudes_count)}</button>
                </div>
              </article>
            ) : null}

            <div ref={zhiSouRef}>
              <article className="border-b border-gray-100 bg-[#fffcf8] px-4 py-3" data-track="zhisou_card" data-observe-id="smart_brief_card" data-post-id="smart_brief_card">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ff8a00] text-white text-xl">◔</span>
                    <div>
                      <div className="text-[18px] font-semibold text-[#ff7e1a]">微博智搜</div>
                      <div className="text-[12px] text-gray-500">
                        <span className="mr-1 rounded border border-[#ffb16e] px-1 text-[#ff8b23]">回答</span>
                        刚刚 深度思考(DS-R1·AI生成)
                      </div>
                    </div>
                  </div>
                  <button type="button" data-post-id="smart_brief_card" data-action="follow_zhisou" className="rounded-full border border-orange-300 px-3 py-1 text-orange-500">+关注</button>
                </div>

                <p className="text-[15px] leading-7 text-[#2b2b2b]">{smartSummary}</p>

                {smartGallery.length ? (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {smartGallery.map((img, idx) => (
                      <img key={img} src={img} alt={`smart_${idx}`} className="h-24 w-full rounded bg-gray-100 object-cover" />
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-3 w-full border-t border-[#efefef] py-2 text-center text-[16px] text-gray-500"
                  data-track="open_more_zhisou"
                  data-post-id="smart_brief_card"
                  onClick={() => {
                    setShowSmartDetail(true);
                    setActiveNav('smart');
                  }}
                >
                  查看更多 〉
                </button>
              </article>
            </div>

            {feedPosts.map((post) => {
              const images = (post.images || []).slice(0, 9);
              const hasVideo = Boolean(post.video_url || post.video_stream_url);
              const likeCount = postLikeCounts[post.post_id] ?? n(post.attitudes_count);

              return (
                <article
                  key={post.post_id}
                  className="border-b border-gray-100 bg-white px-4 py-3"
                  data-track="feed_post"
                  data-track-id={`feed_${post.post_id}`}
                  data-observe-id={`post_${post.post_id}`}
                  data-post-id={post.post_id}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      {post.author_avatar_url ? <img src={post.author_avatar_url} alt={post.author_name} className="h-10 w-10 rounded-full bg-gray-100 object-cover" /> : <div className="h-10 w-10 rounded-full bg-gray-200" />}
                      <div className="min-w-0">
                        <div className="truncate text-[17px] font-medium text-[#f1761f]">{post.author_name}</div>
                        <div className="truncate text-[12px] text-gray-500">{post.created_at || '刚刚'} {post.source || ''}</div>
                      </div>
                    </div>
                    <button type="button" className="rounded-full border border-orange-300 px-3 py-1 text-orange-500">+关注</button>
                  </div>

                  <button
                    type="button"
                    className="w-full text-left"
                    data-track="open_feed_detail"
                    data-track-id={`post_${post.post_id}`}
                    onClick={() => openPostDetail(post)}
                  >
                    <p className="text-[15px] leading-7 text-[#2b2b2b]">{cleanText(post.content_text)}</p>
                  </button>

                  {hasVideo ? (
                    <AutoPlayVideo
                      postId={post.post_id}
                      streamUrl={post.video_stream_url}
                      pageUrl={post.video_url || post.post_url}
                      poster={post.video_poster || images[0]}
                    />
                  ) : (
                    <MediaGrid postId={post.post_id} images={images} />
                  )}

                  <div className="mt-3 flex items-center justify-around border-t border-gray-100 pt-2 text-gray-500">
                    <button type="button" data-track="click_repost" className="inline-flex items-center gap-2 text-[#f28a1b]" onClick={() => quickAction('repost', post)}>
                      <span className="text-lg">↗</span>
                      <span className="text-[14px]">{n(post.reposts_count)}</span>
                    </button>
                    <button type="button" data-track="click_comment" className="inline-flex items-center gap-2 text-gray-500" onClick={() => quickAction('comment', post)}>
                      <span className="text-lg">💬</span>
                      <span className="text-[14px]">{n(post.comments_count)}</span>
                    </button>
                    <button type="button" data-track="click_like" className={`inline-flex items-center gap-2 ${likedPostIds.has(post.post_id) ? 'text-[#ff8a00]' : 'text-gray-500'}`} onClick={() => quickAction('like', post)}>
                      <span className="text-lg">👍</span>
                      <span className="text-[14px]">{likeCount}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          <footer className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex w-full max-w-[430px] items-center gap-2 border-t border-gray-200 bg-white px-3 py-2">
            <button type="button" className="flex h-11 flex-1 items-center justify-center rounded-full bg-[#f4f5f7] text-[16px] text-[#434a58]" data-track="open_write_panel">
              ✎ 和大家一起讨论
              <span className="ml-2 text-[12px] text-[#70798e]">2402人正在讨论</span>
            </button>
            <button type="button" className="w-12 text-center text-[13px] text-[#444b5e]" data-track="click_post">讨论</button>
            <button type="button" className="w-12 text-center text-[13px] text-[#444b5e]" data-track="click_share">分享</button>
            <button type="button" className="w-14 text-center text-[13px] text-[#444b5e]" data-track="click_like_bottom" onClick={() => setLiked((v) => v + 1)}>👍 {liked}</button>
          </footer>
        </>
      )}

      <ComposeModal
        open={showCompose}
        initialText={composeContext.initialText}
        cardTitle={composeContext.title}
        cardSummary={composeContext.summary}
        cardImage={composeContext.image}
        nickname={viewerNick}
        onClose={() => setShowCompose(false)}
        onSend={handleSendComment}
      />

      <ShareModal open={showShare} onClose={() => setShowShare(false)} />

      {activePost ? (
        <OriginalModal
          post={activePost}
          onOpenCompose={() => {
            setComposeContext({
              targetId: activePost.post_id,
              initialText: keyword,
              title: keyword.replace(/#/g, ''),
              summary: cleanText(activePost.content_text).slice(0, 60),
              image: activePost.images?.[0] || activePost.video_poster || smartGallery[0] || '',
            });
            setShowCompose(true);
          }}
          onOpenShare={() => setShowShare(true)}
          liked={likedPostIds.has(activePost.post_id)}
          likeCount={postLikeCounts[activePost.post_id] ?? n(activePost.attitudes_count)}
          onLikePost={() => togglePostLike(activePost)}
          onClose={() => setActivePost(null)}
        />
      ) : null}

    </main>
  );
}
