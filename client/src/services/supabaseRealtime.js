/**
 * TSE Lead Generator Supabase Realtime Synchronization Service
 * 
 * Provides instant cross-session broadcast synchronization between multiple
 * logged-in users (e.g. Mac & Deborah in 'tse' workspace) while keeping the
 * SQLite / Express backend as the authoritative source of truth.
 */

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL)
  ? process.env.VITE_SUPABASE_URL
  : ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL)
      ? import.meta.env.VITE_SUPABASE_URL
      : 'https://cbdfjdxqhqajzjblysqd.supabase.co');

const SUPABASE_KEY = (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  : ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
      : 'sb_publishable_Ys5D-QcdSw_gac9YkmKMZg_eLGCfmK5');

// Initialize singleton Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    params: {
      eventsPerSecond: 20
    }
  }
});

// Unique Client / Session ID to prevent self-echo and infinite update loops
export function getClientId() {
  if (typeof window === 'undefined') return 'server_or_worker';
  if (!window.__TSE_LG_CLIENT_ID__) {
    window.__TSE_LG_CLIENT_ID__ = 'lg_client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  }
  return window.__TSE_LG_CLIENT_ID__;
}

// Realtime Event Names
export const REALTIME_EVENTS = {
  SAVED_SEARCHES_CHANGED: 'saved_searches_changed',
  SHORTLIST_CHANGED: 'shortlist_changed',
  PACKS_CHANGED: 'packs_changed',
  EXCLUSIONS_CHANGED: 'exclusions_changed',
  SETTINGS_CHANGED: 'settings_changed',
  CONTACT_HISTORY_CHANGED: 'contact_history_changed',
  EMAIL_TEMPLATES_CHANGED: 'email_templates_changed'
};

const channelsMap = new Map();
const listenersMap = new Map();

function getChannelName(workspace = 'tse') {
  const ws = String(workspace || 'tse').toLowerCase().trim();
  return `tse-leadgen-workspace-${ws}`;
}

/**
 * Ensures the singleton broadcast channel for the given workspace is subscribed.
 */
function getOrCreateSharedChannel(workspace = 'tse') {
  const ws = String(workspace || 'tse').toLowerCase().trim();
  const channelName = getChannelName(ws);

  if (channelsMap.has(ws)) {
    return channelsMap.get(ws);
  }

  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: false }
    }
  });

  if (!listenersMap.has(ws)) {
    listenersMap.set(ws, new Set());
  }

  // Listen to all broadcast events on this channel
  channel.on('broadcast', { event: '*' }, (message) => {
    const { event, payload } = message || {};
    if (!event || !payload) return;

    // Strict self-echo prevention: ignore messages originating from this browser session
    const currentClientId = getClientId();
    if (payload.senderId && payload.senderId === currentClientId) {
      return;
    }

    // Ensure workspace matches
    if (payload.workspace && payload.workspace !== ws) {
      return;
    }

    // Dispatch to all active component listeners for this workspace
    const listeners = listenersMap.get(ws);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event, payload);
        } catch (err) {
          console.error('[LeadGen Realtime] Listener error:', err);
        }
      });
    }
  });

  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log(`[LeadGen Realtime] Connected to channel: ${channelName}`);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.warn(`[LeadGen Realtime] Channel ${channelName} status:`, status, err || '');
    }
  });

  channelsMap.set(ws, channel);
  return channel;
}

function registerChannelListener(workspace, listener) {
  const ws = String(workspace || 'tse').toLowerCase().trim();
  if (!listenersMap.has(ws)) {
    listenersMap.set(ws, new Set());
  }
  listenersMap.get(ws).add(listener);
}

function unregisterChannelListener(workspace, listener) {
  const ws = String(workspace || 'tse').toLowerCase().trim();
  if (listenersMap.has(ws)) {
    listenersMap.get(ws).delete(listener);
  }
}

/**
 * Broadcast an event to all other open Lead Generator sessions in the workspace.
 * 
 * @param {string} eventType - One of REALTIME_EVENTS
 * @param {object} payload - Event payload (workspace, data, etc.)
 */
export async function broadcastLeadGenEvent(eventType, payload = {}) {
  try {
    const ws = String(payload.workspace || 'tse').toLowerCase().trim();
    const ch = getOrCreateSharedChannel(ws);
    const senderId = getClientId();
    const fullPayload = {
      ...payload,
      senderId,
      workspace: ws,
      timestamp: Date.now()
    };

    await ch.send({
      type: 'broadcast',
      event: eventType,
      payload: fullPayload
    });
  } catch (err) {
    console.warn('[LeadGen Realtime] Broadcast error:', err);
  }
}

/**
 * Custom React Hook to subscribe to realtime Lead Generator workspace updates.
 * Automatically cleans up on component unmount, avoids duplicate registrations,
 * and maintains private UI state.
 */
export function useLeadGenRealtime(workspace = 'tse', handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const ws = String(workspace || 'tse').toLowerCase().trim();
    getOrCreateSharedChannel(ws);

    const listener = (event, payload) => {
      const h = handlersRef.current || {};
      switch (event) {
        case REALTIME_EVENTS.SAVED_SEARCHES_CHANGED:
          if (typeof h.onSavedSearchesChanged === 'function') h.onSavedSearchesChanged(payload);
          break;
        case REALTIME_EVENTS.SHORTLIST_CHANGED:
          if (typeof h.onShortlistChanged === 'function') h.onShortlistChanged(payload);
          break;
        case REALTIME_EVENTS.PACKS_CHANGED:
          if (typeof h.onPacksChanged === 'function') h.onPacksChanged(payload);
          break;
        case REALTIME_EVENTS.EXCLUSIONS_CHANGED:
          if (typeof h.onExclusionsChanged === 'function') h.onExclusionsChanged(payload);
          break;
        case REALTIME_EVENTS.SETTINGS_CHANGED:
          if (typeof h.onSettingsChanged === 'function') h.onSettingsChanged(payload);
          break;
        case REALTIME_EVENTS.CONTACT_HISTORY_CHANGED:
          if (typeof h.onContactHistoryChanged === 'function') h.onContactHistoryChanged(payload);
          break;
        case REALTIME_EVENTS.EMAIL_TEMPLATES_CHANGED:
          if (typeof h.onEmailTemplatesChanged === 'function') h.onEmailTemplatesChanged(payload);
          break;
        default:
          break;
      }
    };

    registerChannelListener(ws, listener);

    // Reconnection / tab focus refresh
    const handleFocus = () => {
      if (handlersRef.current && typeof handlersRef.current.onReconnect === 'function') {
        handlersRef.current.onReconnect();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      unregisterChannelListener(ws, listener);
      window.removeEventListener('focus', handleFocus);
    };
  }, [workspace]);
}
