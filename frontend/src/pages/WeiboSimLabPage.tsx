import { useEffect, useMemo, useRef, useState } from 'react';
import zhisouData from '../material/zhisou-data.json';
import { logInteraction } from '../lib/supabaseLogger';

type RawPost = {
  post_id: string;
  author_name: string;
  author_avatar_url?: string;
  content_text: string;
  created_at?: string;
  source?: string;
  reposts_count?: number | string;
  comments_count?: number | string;
  attitudes_count?: number | string;
  media_image_urls?: string[];
};

type FeedPost = {
  postId: string;
  authorName: string;
  avatar: string;
  content: string;
  createdAt: string;
  source: string;
  reposts: number;
  comments: number;
  likes: number;
  images: string[];
  videoUrl?: string;
};

type StatsMap = Record<string, { reposts: number; comments: number; likes: number }>;

const TOPIC_KEYWORD = '晚5秒要付1700高速费当事人发声';
const VIDEO_FALLBACKS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
];
const TOPIC_MATCHER = /晚5秒|1700|1724|夫妻晚5秒|错过免费高速|高速费当事人发声/;

function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/展开c/g, '').trim();
}

function pickPosts(raw: RawPost[]): FeedPost[] {
  const candidates = raw.filter((item) => TOPIC_MATCHER.test(item.content_text));
  const source = candidates.length ? candidates : raw;
  let videoCursor = 0;

  return source.slice(0, 12).map((item) => {
    const cleaned = compactText(item.content_text);
    const cleanImages = (item.media_image_urls || [])
      .filter((url) => typeof url === 'string' && !url.includes('svvip'))
      .slice(0, 9);
    const hasVideoHint = /微博视频|视频/.test(item.content_text);
    const videoUrl = hasVideoHint && videoCursor < VIDEO_FALLBACKS.length ? VIDEO_FALLBACKS[videoCursor++] : undefined;

    return {
      postId: item.post_id,
      authorName: item.author_name,
      avatar: item.author_avatar_url || '',
      content: cleaned,
      createdAt: item.created_at || '刚刚',
      source: item.source || '来自微博',
      reposts: toNumber(item.reposts_count),
      comments: toNumber(item.comments_count),
      likes: toNumber(item.attitudes_count),
      images: cleanImages,
      videoUrl,
    };
  });
}

function buildInitialStats(posts: FeedPost[]): StatsMap {
  return posts.reduce<StatsMap>((acc, post) => {
    acc[post.postId] = {
      reposts: post.reposts,
      comments: post.comments,
      likes: post.likes,
    };
    return acc;
  }, {});
}

function WeiboVideo({ postId, src, poster }: { postId: string; src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (muted) {
      void video.play().catch(() => undefined);
    }
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            void video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0.2, 0.6, 0.9] }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative mt-2 overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="h-60 w-full object-cover"
      />
      <button
        type="button"
        data-post-id={postId}
        data-action="toggle_video_mute"
        className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white"
        onClick={() => setMuted((value) => !value)}
      >
        {muted ? '静音播放' : '有声播放'}
      </button>
    </div>
  );
}

function ImageGrid({ postId, images }: { postId: string; images: string[] }) {
  if (!images.length) return null;
  const single = images.length === 1;

  return (
    <div className={`mt-2 grid gap-1.5 ${single ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {images.map((src, index) => (
        <button
          type="button"
          key={`${postId}_${index}`}
          data-post-id={postId}
          data-action="open_image"
          data-image-index={String(index)}
          className={`overflow-hidden rounded-xl bg-[#edf0f7] ${single ? '' : 'aspect-square'}`}
        >
          <img
            src={src}
            alt={`${postId}_img_${index}`}
            loading="lazy"
            className={`h-full w-full object-cover ${single ? 'max-h-80' : ''}`}
          />
        </button>
      ))}
    </div>
  );
}

function FeedPostCard({
  post,
  stats,
  onAction,
  bindRef,
}: {
  post: FeedPost;
  stats: { reposts: number; comments: number; likes: number };
  onAction: (postId: string, key: 'reposts' | 'comments' | 'likes') => void;
  bindRef: (el: HTMLElement | null) => void;
}) {
  return (
    <article ref={bindRef} data-post-id={post.postId} className="border-b border-[#f0f1f6] bg-white px-3 py-3">
      <div className="flex items-start gap-2.5">
        {post.avatar ? (
          <img src={post.avatar} alt={post.authorName} className="h-10 w-10 rounded-full bg-[#e5e8ef] object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[#e5e8ef]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-[#30374a]">{post.authorName}</p>
              <p className="truncate text-[12px] text-[#8891a7]">
                {post.createdAt} · {post.source}
              </p>
            </div>
            <button
              type="button"
              data-post-id={post.postId}
              data-action="follow_user"
              className="rounded-full border border-[#7f7ff4] px-3 py-1 text-xs text-[#4f59d5]"
            >
              +关注
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-[#1f2433]">{post.content}</p>

          {post.videoUrl ? (
            <WeiboVideo postId={post.postId} src={post.videoUrl} poster={post.images[0]} />
          ) : (
            <ImageGrid postId={post.postId} images={post.images} />
          )}

          <div className="mt-3 flex items-center justify-between border-t border-[#f2f3f8] pt-2 text-[13px] text-[#7f879a]">
            <button
              type="button"
              data-post-id={post.postId}
              data-action="click_repost"
              className="rounded-lg px-2 py-1"
              onClick={() => onAction(post.postId, 'reposts')}
            >
              转发 {stats.reposts}
            </button>
            <button
              type="button"
              data-post-id={post.postId}
              data-action="click_comment"
              className="rounded-lg px-2 py-1"
              onClick={() => onAction(post.postId, 'comments')}
            >
              评论 {stats.comments}
            </button>
            <button
              type="button"
              data-post-id={post.postId}
              data-action="click_like"
              className="rounded-lg px-2 py-1"
              onClick={() => onAction(post.postId, 'likes')}
            >
              点赞 {stats.likes}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function WeiboSimLabPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [statsMap, setStatsMap] = useState<StatsMap>({});
  const postElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const aiSummaryParagraphs = useMemo(() => {
    const source = zhisouData?.sources?.xxcb?.paragraphs || [];
    return source.slice(0, 3);
  }, []);

  useEffect(() => {
    document.title = 'Weibo_Sim_Lab';
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/data/linked_posts.json')
      .then((res) => res.json())
      .then((rows: RawPost[]) => {
        if (!active) return;
        const selected = pickPosts(Array.isArray(rows) ? rows : []);
        setPosts(selected);
        setStatsMap(buildInitialStats(selected));
      })
      .catch(() => {
        if (!active) return;
        setPosts([]);
        setStatsMap({});
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button) return;

      const scopedPost = button.closest('[data-post-id]') as HTMLElement | null;
      const postId = button.dataset.postId || scopedPost?.dataset.postId || 'global';
      const label = button.innerText.replace(/\s+/g, ' ').trim().slice(0, 40);

      void logInteraction({
        postId,
        eventType: 'click',
        detail: {
          action: button.dataset.action || 'button_click',
          label,
          image_index: button.dataset.imageIndex ? Number(button.dataset.imageIndex) : null,
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
        },
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!posts.length) return;

    const pending = new Map<string, number>();
    const staying = new Map<string, number>();
    const viewedOnce = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          const postId = el.dataset.postId;
          if (!postId) return;

          if (entry.isIntersecting) {
            if (!viewedOnce.has(postId)) {
              viewedOnce.add(postId);
              void logInteraction({
                postId,
                eventType: 'view',
                detail: { trigger: 'midline_enter' },
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
            },
          });
        });
      },
      {
        root: null,
        threshold: [0],
        rootMargin: '-49% 0px -49% 0px',
      }
    );

    postElementsRef.current.forEach((element, postId) => {
      element.dataset.postId = postId;
      observer.observe(element);
    });

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
            },
          });
        }
      });
      observer.disconnect();
    };
  }, [posts]);

  const bump = (postId: string, key: 'reposts' | 'comments' | 'likes') => {
    setStatsMap((prev) => {
      const current = prev[postId] || { reposts: 0, comments: 0, likes: 0 };
      return {
        ...prev,
        [postId]: {
          ...current,
          [key]: current[key] + 1,
        },
      };
    });
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden bg-[#f4f5f9] pb-8">
      <header className="sticky top-0 z-20 border-b border-[#ebedf5] bg-white/95 px-3 pb-2 pt-2 backdrop-blur">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            data-post-id="search_bar"
            data-action="open_search"
            className="flex h-9 flex-1 items-center rounded-full bg-[#f2f4fb] px-3 text-left text-[14px] text-[#6d7690]"
          >
            🔍 {TOPIC_KEYWORD}
          </button>
          <button type="button" data-post-id="search_bar" data-action="open_menu" className="text-[20px] text-[#68718a]">
            ⋯
          </button>
        </div>
        <nav className="flex gap-5 text-[14px] text-[#8891a7]">
          <span className="font-semibold text-[#30374a]">综合</span>
          <span>智搜</span>
          <span>实时</span>
          <span>视频</span>
          <span>图片</span>
        </nav>
      </header>

      <section className="mx-3 mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4b86ff] via-[#6063ff] to-[#8f5fff] p-4 text-white shadow-[0_12px_30px_rgba(78,96,255,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[18px] font-bold">微博智搜</p>
            <p className="mt-0.5 text-xs text-white/80">热点事件 AI 总结</p>
          </div>
          <button
            type="button"
            data-post-id="zhisou_card"
            data-action="follow_zhisou"
            className="rounded-full border border-white/50 px-3 py-1 text-xs"
          >
            +关注
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-6 text-white/95">{zhisouData.intro}</p>
        <ul className="mt-2 space-y-1 text-[13px] leading-5 text-white/90">
          {aiSummaryParagraphs.map((line: string, idx: number) => (
            <li key={idx}>• {line}</li>
          ))}
        </ul>
        <button
          type="button"
          data-post-id="zhisou_card"
          data-action="open_zhisou_detail"
          className="mt-3 w-full rounded-xl bg-white/20 py-2 text-sm"
        >
          查看完整智搜解读
        </button>
      </section>

      <section className="mt-3">
        {posts.map((post) => {
          const stats = statsMap[post.postId] || { reposts: 0, comments: 0, likes: 0 };
          return (
            <FeedPostCard
              key={post.postId}
              post={post}
              stats={stats}
              onAction={bump}
              bindRef={(el) => {
                if (el) {
                  postElementsRef.current.set(post.postId, el);
                } else {
                  postElementsRef.current.delete(post.postId);
                }
              }}
            />
          );
        })}
      </section>
    </main>
  );
}
