export type AIGSPosition = 'top' | 'middle' | 'none';
export type SourceType = 'mainstream' | 'we-media';
export type NewsType = 'hard' | 'soft';

export interface Condition {
  aigsPosition: AIGSPosition;
  source: SourceType;
  groupKey: string;
}

export interface UserProfile {
  age: number;
  occupation: string;
}

export interface NewsMaterial {
  id: string;
  keyword: string;
  title: string;
  type: NewsType;
  topicTag: string;
  aiSummary: string;
  aiFullText: string;
  sourceProfiles: {
    mainstream: {
      name: string;
      verified: boolean;
      avatar: string;
    };
    'we-media': {
      name: string;
      verified: boolean;
      avatar: string;
    };
  };
  feedPosts: Array<{
    id: string;
    text: string;
    images: string[];
    likes: number;
    comments: number;
    reposts: number;
  }>;
  detail: {
    fullText: string;
    comments: Array<{
      id: string;
      user: string;
      text: string;
      likes: number;
    }>;
  };
}

export type EventName =
  | 'page_enter'
  | 'page_exit'
  | 'scroll'
  | 'click'
  | 'heartbeat'
  | 'touch_start'
  | 'touch_move'
  | 'touch_end'
  | 'visibility_change'
  | 'focus'
  | 'blur'
  | 'input'
  | 'route_update';

export interface EventPayload {
  seq: number;
  timestamp: number;
  event: EventName;
  page: string;
  pageSessionId: string;
  sessionId: string;
  condition: string;
  participantId: string;
  dwellMs?: number;
  depth?: string;
  action?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}
