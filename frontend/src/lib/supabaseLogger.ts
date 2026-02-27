import { createClient } from '@supabase/supabase-js';

export type InteractionEventType = 'view' | 'click' | 'stay';

interface InteractionInput {
  postId: string;
  eventType: InteractionEventType;
  detail: Record<string, unknown>;
  timestamp?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      })
    : null;

let warnedMissingEnv = false;

export async function logInteraction(input: InteractionInput): Promise<void> {
  if (!supabase) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn('Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
    return;
  }

  const payload = {
    post_id: input.postId,
    event_type: input.eventType,
    detail: input.detail,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  const { error } = await supabase.from('interaction_logs').insert(payload);
  if (error) {
    console.error('Failed to write interaction log:', error.message);
  }
}
