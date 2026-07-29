import { useEffect, useRef } from 'react';
import { ImageOff, Lock, Shield } from 'lucide-react';

function formatTime(iso) {
  if (!iso) return 'Ahora';
  try {
    return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function Message({ data, currentUsername }) {
  const isMe = data.username === currentUsername;
  const isAdminMsg = data.role === 'admin';
  const isPrivate = data.isPrivate;

  if (data.type === 'system' || data.type === 'system-error') {
    return (
      <div className="flex justify-center my-4">
        <span
          className={`px-4 py-1 rounded-full text-xs font-medium shadow-sm ${
            data.type === 'system-error'
              ? 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300'
              : 'bg-muted text-ink-soft'
          }`}
        >
          {data.text}
        </span>
      </div>
    );
  }

  let avatarColor = isMe
    ? 'bg-accent-soft text-accent-ink'
    : isAdminMsg
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
      : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300';
  let bubbleColor = isMe
    ? 'bg-accent text-white'
    : isAdminMsg
      ? 'bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-400/10 dark:border-amber-400/25 dark:text-amber-100'
      : 'bg-surface text-ink border border-edge';

  if (isPrivate) {
    avatarColor = 'bg-rose-100 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300';
    bubbleColor = isMe
      ? 'bg-rose-500 text-white shadow-md dark:bg-rose-600'
      : 'bg-rose-50 border border-rose-100 text-rose-900 dark:bg-rose-400/10 dark:border-rose-400/25 dark:text-rose-100';
  }

  return (
    <div className={`flex gap-4 message-enter ${isMe ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full ${avatarColor} flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm`}
      >
        {data.username.charAt(0).toUpperCase()}
      </div>
      <div className={`flex flex-col gap-1 max-w-[75%] ${isMe ? 'items-end' : ''}`}>
        <div className={`flex items-baseline gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
          <span
            className={`text-sm font-semibold flex items-center gap-1 ${
              isMe
                ? 'text-accent-ink'
                : isAdminMsg
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-ink'
            }`}
          >
            {data.username}
            {isAdminMsg && !isMe && <Shield size={12} className="text-amber-500" />}
          </span>
          <span className="text-xs text-ink-faint">{formatTime(data.createdAt)}</span>
        </div>
        <div
          className={`${bubbleColor} p-3 rounded-2xl ${
            isMe ? 'rounded-tr-none' : 'rounded-tl-none'
          } shadow-sm text-sm leading-relaxed`}
        >
          {data.imageExpired && !data.imageUrl && (
            <p className="flex items-center gap-1.5 text-xs opacity-60 italic mb-1">
              <ImageOff size={12} className="shrink-0" /> Foto vencida
            </p>
          )}
          {data.imageUrl && (
            <a href={data.imageUrl} target="_blank" rel="noreferrer">
              <img
                src={data.imageUrl}
                alt="Foto compartida"
                className="rounded-lg max-w-full max-h-64 object-contain mb-1"
                loading="lazy"
              />
            </a>
          )}
          {data.text && (
            <p className="flex items-start gap-1 break-words">
              {isPrivate && <Lock size={10} className="mt-1 opacity-40 shrink-0" />}
              <span>{data.text}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ messages, currentUsername }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-app">
      {messages.map((m, i) => (
        <Message key={i} data={m} currentUsername={currentUsername} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
