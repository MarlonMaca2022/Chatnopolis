import { useEffect, useRef } from 'react';
import { Lock, Shield } from 'lucide-react';

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
            data.type === 'system-error' ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {data.text}
        </span>
      </div>
    );
  }

  let avatarColor = isMe
    ? 'bg-brand-100 text-brand-600'
    : isAdminMsg
      ? 'bg-amber-100 text-amber-600'
      : 'bg-indigo-100 text-indigo-600';
  let bubbleColor = isMe
    ? 'bg-brand-500 text-white'
    : isAdminMsg
      ? 'bg-amber-50 border border-amber-200 text-amber-900'
      : 'bg-white text-slate-700 border border-slate-100';

  if (isPrivate) {
    avatarColor = 'bg-rose-100 text-rose-600';
    bubbleColor = isMe
      ? 'bg-rose-500 text-white shadow-md'
      : 'bg-rose-50 border border-rose-100 text-rose-900';
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
              isMe ? 'text-brand-900' : isAdminMsg ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {data.username}
            {isAdminMsg && !isMe && <Shield size={12} className="text-amber-500" />}
          </span>
          <span className="text-xs text-slate-400">{formatTime(data.createdAt)}</span>
        </div>
        <div
          className={`${bubbleColor} p-3 rounded-2xl ${
            isMe ? 'rounded-tr-none' : 'rounded-tl-none'
          } shadow-sm text-sm leading-relaxed`}
        >
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
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
      {messages.map((m, i) => (
        <Message key={i} data={m} currentUsername={currentUsername} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
