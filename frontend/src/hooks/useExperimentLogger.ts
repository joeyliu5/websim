import { useEffect, useRef } from 'react';
import type { EventPayload, UserProfile } from '../types/experiment';
import { sendEvents } from '../lib/loggerApi';

interface LoggerConfig {
  pageId: string;
  condition: string;
  participantId: string;
  userProfile?: UserProfile | null;
}

function getScrollMetrics() {
  const root = document.documentElement;
  const scrollTop = root.scrollTop || document.body.scrollTop || 0;
  const scrollHeight = Math.max(root.scrollHeight, document.body.scrollHeight, 1);
  const clientHeight = Math.max(root.clientHeight, window.innerHeight, 1);
  const maxScrollable = Math.max(scrollHeight - clientHeight, 1);
  const depthPct = Math.min(100, Math.max(0, (scrollTop / maxScrollable) * 100));

  return { scrollTop, scrollHeight, clientHeight, maxScrollable, depthPct };
}

function extractTargetMeta(target: EventTarget | null) {
  const el = target instanceof Element ? (target as HTMLElement) : null;
  const tracked = el?.closest('[data-track]') as HTMLElement | null;
  const rawText = tracked?.textContent || el?.textContent || '';

  return {
    action: tracked?.dataset.track || 'dom_click',
    targetId: tracked?.dataset.trackId || tracked?.id || el?.id || undefined,
    tag: (tracked?.tagName || el?.tagName || '').toLowerCase(),
    className: (tracked?.className || el?.className || '').toString().slice(0, 120),
    textSample: rawText.replace(/\s+/g, ' ').slice(0, 50),
  };
}

export function useExperimentLogger({ pageId, condition, participantId, userProfile }: LoggerConfig) {
  const sessionIdRef = useRef<string>('');

  const pageSessionIdRef = useRef<string>(`pg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const enterAtRef = useRef<number>(Date.now());
  const hiddenAtRef = useRef<number | null>(null);
  const maxDepthRef = useRef<number>(0);
  const seqRef = useRef<number>(0);
  const queueRef = useRef<EventPayload[]>([]);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTsRef = useRef<number>(Date.now());
  const flushingRef = useRef<boolean>(false);

  if (!sessionIdRef.current) {
    const existing = sessionStorage.getItem('weibsim_session_id');
    if (existing) {
      sessionIdRef.current = existing;
    } else {
      const next = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem('weibsim_session_id', next);
      sessionIdRef.current = next;
    }
  }

  const currentSessionId = sessionIdRef.current;

  const push = (partial: Omit<EventPayload, 'seq' | 'timestamp' | 'page' | 'pageSessionId' | 'sessionId' | 'condition' | 'participantId'> & { timestamp?: number }) => {
    const ts = partial.timestamp ?? Date.now();
    queueRef.current.push({
      seq: ++seqRef.current,
      timestamp: ts,
      page: pageId,
      pageSessionId: pageSessionIdRef.current,
      sessionId: currentSessionId,
      condition,
      participantId,
      ...partial,
      meta: {
        age: userProfile?.age,
        occupation: userProfile?.occupation,
        visibility: document.visibilityState,
        ...(partial.meta || {}),
      },
    });
  };

  useEffect(() => {
    enterAtRef.current = Date.now();
    const initialMetrics = getScrollMetrics();
    maxDepthRef.current = initialMetrics.depthPct;

    push({
      event: 'page_enter',
      depth: `${initialMetrics.depthPct.toFixed(2)}%`,
      meta: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    });

    const onScroll = () => {
      const now = Date.now();
      const metrics = getScrollMetrics();
      const deltaY = metrics.scrollTop - lastScrollTopRef.current;
      const deltaT = Math.max(now - lastScrollTsRef.current, 1);
      const velocityPxPerSec = (deltaY / deltaT) * 1000;
      maxDepthRef.current = Math.max(maxDepthRef.current, metrics.depthPct);
      lastScrollTopRef.current = metrics.scrollTop;
      lastScrollTsRef.current = now;

      push({
        event: 'scroll',
        depth: `${metrics.depthPct.toFixed(2)}%`,
        meta: {
          scrollTop: Math.round(metrics.scrollTop),
          scrollHeight: metrics.scrollHeight,
          clientHeight: metrics.clientHeight,
          deltaY: Math.round(deltaY),
          velocityPxPerSec: Number(velocityPxPerSec.toFixed(2)),
          maxDepthPct: Number(maxDepthRef.current.toFixed(2)),
        },
      });
    };

    const onClick = (e: MouseEvent) => {
      const targetMeta = extractTargetMeta(e.target);
      push({
        event: 'click',
        action: targetMeta.action,
        targetId: targetMeta.targetId,
        meta: {
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
          ...targetMeta,
        },
      });
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      push({
        event: 'touch_start',
        meta: {
          x: Math.round(t.clientX),
          y: Math.round(t.clientY),
          touchCount: e.touches.length,
        },
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      push({
        event: 'touch_move',
        meta: {
          x: Math.round(t.clientX),
          y: Math.round(t.clientY),
          touchCount: e.touches.length,
        },
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches?.[0];
      if (!t) return;
      push({
        event: 'touch_end',
        meta: {
          x: Math.round(t.clientX),
          y: Math.round(t.clientY),
          touchCount: e.touches.length,
        },
      });
    };

    const onVisibilityChange = () => {
      const now = Date.now();
      const hidden = document.visibilityState === 'hidden';
      if (hidden) {
        hiddenAtRef.current = now;
      }
      push({
        event: 'visibility_change',
        meta: {
          state: document.visibilityState,
          hiddenDurationMs: !hidden && hiddenAtRef.current ? now - hiddenAtRef.current : 0,
        },
      });
    };

    const onFocus = () => push({ event: 'focus' });
    const onBlur = () => push({ event: 'blur' });

    const onInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;
      const value = typeof target.value === 'string' ? target.value : '';
      push({
        event: 'input',
        action: 'input_change',
        targetId: target.id || target.name || target.getAttribute('data-track') || undefined,
        meta: {
          fieldType: target.type || 'text',
          valueLength: value.length,
        },
      });
    };

    const onPopState = () => {
      push({
        event: 'route_update',
        meta: { url: window.location.href },
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('input', onInput, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('popstate', onPopState);

    const sampleTimer = window.setInterval(() => {
      const metrics = getScrollMetrics();
      maxDepthRef.current = Math.max(maxDepthRef.current, metrics.depthPct);

      push({
        event: 'heartbeat',
        depth: `${metrics.depthPct.toFixed(2)}%`,
        meta: {
          scrollTop: Math.round(metrics.scrollTop),
          scrollHeight: metrics.scrollHeight,
          clientHeight: metrics.clientHeight,
          maxDepthPct: Number(maxDepthRef.current.toFixed(2)),
          activeMs: Date.now() - enterAtRef.current,
          online: navigator.onLine,
        },
      });
    }, 100);

    const flush = async () => {
      if (flushingRef.current) return;
      const batch = queueRef.current.splice(0, queueRef.current.length);
      if (!batch.length) return;

      flushingRef.current = true;
      try {
        await sendEvents(batch);
      } catch {
        queueRef.current.unshift(...batch);
      } finally {
        flushingRef.current = false;
      }
    };

    const flushTimer = window.setInterval(() => {
      void flush();
    }, 400);

    const handleUnload = () => {
      const now = Date.now();
      const payloads: EventPayload[] = [
        {
          seq: ++seqRef.current,
          timestamp: now,
          event: 'page_exit',
          page: pageId,
          pageSessionId: pageSessionIdRef.current,
          sessionId: currentSessionId,
          condition,
          participantId,
          dwellMs: now - enterAtRef.current,
          depth: `${maxDepthRef.current.toFixed(2)}%`,
          meta: {
            age: userProfile?.age,
            occupation: userProfile?.occupation,
          },
        },
        ...queueRef.current,
      ];

      navigator.sendBeacon('/api/events', JSON.stringify({ events: payloads }));
      queueRef.current = [];
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      const now = Date.now();
      push({
        event: 'page_exit',
        timestamp: now,
        dwellMs: now - enterAtRef.current,
        depth: `${maxDepthRef.current.toFixed(2)}%`,
      });

      window.clearInterval(sampleTimer);
      window.clearInterval(flushTimer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);

      void flush();
    };
  }, [pageId, condition, participantId, currentSessionId, userProfile?.age, userProfile?.occupation]);
}
