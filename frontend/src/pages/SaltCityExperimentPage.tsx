import { useEffect, useMemo, useState } from 'react';
import { useExperimentLogger } from '../hooks/useExperimentLogger';
import type { UserProfile } from '../types/experiment';
import './SaltCityExperimentPage.css';

export type SaltCityCondition = 'ordinary' | 'smart';

type Citation = { mid: string; index: number; name: string };
type AnswerBlock =
  | { kind: 'heading' | 'bullet' | 'paragraph'; text: string; citations: Citation[] }
  | { kind: 'media'; items: Array<{ mid: string; type: string; author: string; image: string }> };
type Source = { index: number; mid: string; name: string; url: string; preview: string; createdAt: string };
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
  smart: { answerRaw: string; blocks: AnswerBlock[]; weiboReferenceCount: number; sources: Source[]; suggestions: string[]; generatedAt?: number };
};

function localTime(raw: string) {
  const match = /\b(Oct)\s+(\d+)\s+(\d\d:\d\d)/.exec(raw);
  return match ? `10月${Number(match[2])}日 ${match[3]}` : raw;
}

function richText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  );
}

async function recordAction(action: string, participantId: string, condition: SaltCityCondition, targetId: string) {
  try {
    await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, participantId, condition, targetId, page: `saltcity_${condition}`, ts: Date.now() }),
      keepalive: true,
    });
  } catch {
    // The experiment remains readable if logging is temporarily unavailable.
  }
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

function PostCard({ post, onOpen, onImage, condition, participantId }: {
  post: Post;
  onOpen: () => void;
  onImage: (url: string) => void;
  condition: SaltCityCondition;
  participantId: string;
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
      <div className="salt-post-actions">
        <button type="button" onClick={() => void recordAction('click_repost', participantId, condition, post.id)} data-track="click_repost" data-track-id={post.id}>↗ <span>{post.reposts}</span></button>
        <button type="button" onClick={() => void recordAction('click_comment', participantId, condition, post.id)} data-track="click_comment" data-track-id={post.id}>▢ <span>{post.comments}</span></button>
        <button type="button" onClick={() => void recordAction('click_like', participantId, condition, post.id)} data-track="click_like" data-track-id={post.id}>♡ <span>{post.likes}</span></button>
      </div>
    </article>
  );
}

function DetailOverlay({ post, onClose, onImage, condition, participantId }: {
  post: Post; onClose: () => void; onImage: (url: string) => void; condition: SaltCityCondition; participantId: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="salt-overlay" role="dialog" aria-modal="true" aria-label={`${post.author}的微博正文`}>
      <div className="salt-detail">
        <div className="salt-detail-header"><button type="button" onClick={onClose} data-track="close_post_detail">←</button><strong>微博正文</strong><a href={post.url} target="_blank" rel="noopener noreferrer" onClick={() => void recordAction('open_original_weibo', participantId, condition, post.id)}>原微博 ↗</a></div>
        <PostCard post={post} onOpen={() => undefined} onImage={onImage} condition={condition} participantId={participantId} />
      </div>
    </div>
  );
}

function SmartContent({ bundle, onSource }: {
  bundle: CaseBundle;
  onSource: (mid: string, fallback?: string) => void;
}) {
  const sourcesByMid = useMemo(() => new Map(bundle.smart.sources.filter((item) => item.mid).map((item) => [item.mid, item])), [bundle.smart.sources]);
  const weiboSources = bundle.smart.sources.filter((item) => item.mid);
  const externalSources = bundle.smart.sources.filter((item) => !item.mid);
  return (
    <article className="salt-ai">
      <div className="salt-ai-query">{bundle.topic}</div>
      <div className="salt-ai-answer-title"><span className="salt-ai-symbol">✦</span><strong>回答</strong><span className="salt-ai-thinking">深度思考</span></div>
      <div className="salt-ai-generated">{bundle.smart.generatedAt ? `时间：${new Date(bundle.smart.generatedAt * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '智搜回答'}</div>
      <div className="salt-ai-answer">
        {bundle.smart.blocks.map((block, index) => {
          if (block.kind === 'media') {
            return <div className="salt-ai-media" key={`block_${index}`}>{block.items.map((item, i) => <button type="button" key={`${item.mid}_${i}`} onClick={() => onSource(item.mid)} data-track="open_ai_media_source" data-track-id={item.mid}><img src={item.image} alt={`${item.author}来源媒体`} /><span>{item.type === 'v' ? '▶' : '▣'} {item.author}</span></button>)}</div>;
          }
          const content = <>{richText(block.text)}{block.citations.length > 0 && <span className="salt-citations">{block.citations.map((cite, i) => {
            const source = sourcesByMid.get(cite.mid);
            return <button key={`${cite.mid}_${i}`} type="button" onClick={() => onSource(cite.mid, source?.url)} data-track="open_ai_citation" data-track-id={cite.mid}>@{cite.name || source?.name || '微博原文'} <sup>{cite.index || source?.index}</sup></button>;
          })}</span>}</>;
          if (block.kind === 'heading') return <h2 key={`block_${index}`}>{content}</h2>;
          if (block.kind === 'bullet') return <p className="salt-ai-bullet" key={`block_${index}`}>• {content}</p>;
          return <p key={`block_${index}`}>{content}</p>;
        })}
      </div>
      <div className="salt-ai-trace"><strong>信源追溯</strong><span>参考{bundle.smart.weiboReferenceCount}篇博文</span><small>媒体17%　金橙V75%　认证用户4%　普通用户4%</small><small>内容由AI生成</small></div>
      <section className="salt-source-section" aria-label="智搜引用微博">
        <h2>参考博文 <span>共{bundle.smart.weiboReferenceCount}篇</span></h2>
        {weiboSources.map((source) => <button className="salt-source-card" key={source.index} type="button" onClick={() => onSource(source.mid, source.url)} data-track="open_ai_reference" data-track-id={source.mid}><span className="salt-source-meta"><strong>{source.name}</strong><small>结果{source.index}　{localTime(source.createdAt)}</small></span><span className="salt-source-preview">{source.preview || '查看微博原文'}</span><span className="salt-source-open">查看原文 ›</span></button>)}
        {externalSources.length > 0 && <details className="salt-external-sources"><summary>其他参考链接（{externalSources.length}）</summary>{externalSources.map((source) => <a key={source.index} href={source.url} target="_blank" rel="noopener noreferrer" data-track="open_ai_external_source" data-track-id={String(source.index)}>参考来源 {source.index} ↗</a>)}</details>}
      </section>
    </article>
  );
}

function SaltCityContent({ participantId, userProfile, condition }: { participantId: string; userProfile: UserProfile; condition: SaltCityCondition }) {
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Post | null>(null);
  const [image, setImage] = useState('');
  useExperimentLogger({ pageId: detail ? 'saltcity_post_detail' : `saltcity_${condition}`, condition: `saltcity_${condition}`, participantId, userProfile });

  useEffect(() => {
    void fetch('/data/saltcity_case.json').then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<CaseBundle>;
    }).then((data) => setBundle(data)).catch(() => setError('实验素材加载失败，请刷新页面。'));
    void recordAction('assigned_condition', participantId, condition, 'saltcity_202610');
  }, [participantId, condition]);

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

  const openPost = (post: Post) => {
    const url = new URL(window.location.href);
    url.searchParams.set('post', post.bid);
    window.history.pushState({ postId: post.id }, '', url);
    setDetail(post);
    void recordAction('open_post_detail', participantId, condition, post.id);
  };
  const closePost = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    window.history.replaceState({}, '', url);
    setDetail(null);
  };
  const openSource = (mid: string, fallback?: string) => {
    if (!bundle) return;
    void recordAction('open_ai_source', participantId, condition, mid);
    const post = bundle.posts.find((item) => item.id === mid);
    if (post) { openPost(post); return; }
    const url = fallback || bundle.smart.sources.find((item) => item.mid === mid)?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (error) return <main className="salt-status">{error}</main>;
  if (!bundle) return <main className="salt-status">正在加载实验素材…</main>;
  return (
    <main className="salt-page">
      <Header topic={bundle.topic} condition={condition} />
      <div className="salt-main">
        <div className="salt-content">
          {condition === 'ordinary'
            ? <section aria-label="普通微博新闻">{bundle.posts.map((post) => <PostCard key={post.id} post={post} onOpen={() => openPost(post)} onImage={setImage} condition={condition} participantId={participantId} />)}</section>
            : <SmartContent bundle={bundle} onSource={openSource} />}
        </div>
      </div>
      {detail && <DetailOverlay post={detail} onClose={closePost} onImage={setImage} condition={condition} participantId={participantId} />}
      {image && <div className="salt-image-viewer" role="dialog" aria-modal="true" onClick={() => setImage('')}><button type="button" aria-label="关闭图片">×</button><img src={image} alt="微博图片大图" /></div>}
    </main>
  );
}

export function SaltCityExperimentPage(props: { participantId: string; userProfile: UserProfile; condition: SaltCityCondition }) {
  return <SaltCityContent {...props} />;
}
