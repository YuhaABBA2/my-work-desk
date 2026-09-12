import { sb } from './supabase.js';
import { state } from './state.js';

// VAPID 공개키 (공개해도 안전 — 신원 확인용). 발급: `npx web-push generate-vapid-keys`.
const VAPID_PUBLIC_KEY = 'BHGA0T1_fXL29CjRmF5bxsNf4CrkMuOZQ0naIdDhgLZrzB-jEQLBvzAfI1sx-2rBG8yXfrwdcwksVrWw91eNl_w';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// { supported, permission, subscribed }
export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: 'default', subscribed: false };
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, permission: Notification.permission, subscribed: !!sub };
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.');
  let reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림 권한이 필요합니다.');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({
    endpoint: j.endpoint,
    user_id: state.user.id,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    ua: (navigator.userAgent || '').slice(0, 200),
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
