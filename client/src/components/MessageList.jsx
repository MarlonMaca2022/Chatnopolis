import { useEffect, useRef, useState } from 'react';
import { ImageOff, Lock, Reply, Shield, SmilePlus, Trash2 } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { REACTIONS, quoteLabel } from '../lib/messages';

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

// `selected`: en el celular no hay hover, así que las acciones aparecen al tocar la
// burbuja. `picking`: el popover de emojis de este mensaje está abierto.
function Message({ data, currentUsername, canDelete, selected, picking, onSelect, onPick, onReact, onReply, onDelete }) {
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
  // Burbujas llenas (las propias) llevan la cita en blanco translúcido
  const solidBubble = isMe;

  if (isPrivate) {
    avatarColor = 'bg-rose-100 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300';
    bubbleColor = isMe
      ? 'bg-rose-500 text-white shadow-md dark:bg-rose-600'
      : 'bg-rose-50 border border-rose-100 text-rose-900 dark:bg-rose-400/10 dark:border-rose-400/25 dark:text-rose-100';
  }

  // Los mensajes sin id (los que llegaron antes de esta versión) no tienen acciones
  const interactive = data.id != null;
  const reactions = Object.entries(data.reactions || {}).filter(([, who]) => who.length > 0);

  return (
    <div className={`group flex gap-4 message-enter ${isMe ? 'flex-row-reverse' : ''}`}>
      <Avatar name={data.username} className={`${avatarColor} shadow-sm`} />
      <div className={`flex flex-col gap-1 max-w-[75%] min-w-0 ${isMe ? 'items-end' : ''}`}>
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

        <div className={`relative flex items-center gap-1 ${isMe ? 'flex-row-reverse' : ''}`}>
          <div
            onClick={(e) => {
              if (!interactive) return;
              e.stopPropagation();
              onSelect(data.id);
            }}
            className={`${bubbleColor} p-3 rounded-2xl ${
              isMe ? 'rounded-tr-none' : 'rounded-tl-none'
            } shadow-sm text-sm leading-relaxed min-w-0`}
          >
            {data.replyTo && (
              <div
                className={`mb-2 pl-2 pr-3 py-1 rounded-md border-l-2 text-xs ${
                  solidBubble ? 'bg-white/15 border-white/60' : 'bg-muted border-accent'
                }`}
              >
                {!data.replyTo.deleted && <p className="font-semibold">{data.replyTo.username}</p>}
                <p className={`truncate opacity-80 ${data.replyTo.deleted ? 'italic' : ''}`}>
                  {quoteLabel(data.replyTo)}
                </p>
              </div>
            )}
            {data.imageExpired && !data.imageUrl && (
              <p className="flex items-center gap-1.5 text-xs opacity-60 italic mb-1">
                <ImageOff size={12} className="shrink-0" /> Foto vencida
              </p>
            )}
            {data.imageUrl && (
              <a href={data.imageUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
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
                <span className="min-w-0">{data.text}</span>
              </p>
            )}
          </div>

          {interactive && (
            <div
              className={`flex items-center shrink-0 transition-opacity ${
                selected || picking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <ActionButton title="Reaccionar" onClick={() => onPick(picking ? null : data.id)}>
                <SmilePlus size={15} />
              </ActionButton>
              <ActionButton title="Responder" onClick={() => onReply(data)}>
                <Reply size={15} />
              </ActionButton>
              {canDelete && (
                <ActionButton title="Borrar mensaje" danger onClick={() => onDelete(data)}>
                  <Trash2 size={15} />
                </ActionButton>
              )}
            </div>
          )}

          {picking && (
            <div
              className={`absolute bottom-full mb-1 z-30 flex gap-0.5 p-1 bg-panel border border-edge rounded-full shadow-lg ${
                isMe ? 'right-0' : 'left-0'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(data.id, emoji);
                    onPick(null);
                  }}
                  className="w-8 h-8 rounded-full text-lg leading-none hover:bg-muted hover:scale-110 transition"
                  aria-label={`Reaccionar con ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 ${isMe ? 'justify-end' : ''}`}>
            {reactions.map(([emoji, who]) => {
              const mine = who.includes(currentUsername);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(data.id, emoji)}
                  title={who.join(', ')}
                  className={`px-2 py-0.5 rounded-full text-xs border flex items-center gap-1 transition ${
                    mine
                      ? 'bg-accent-soft border-accent/50 text-accent-ink'
                      : 'bg-surface border-edge text-ink-soft hover:bg-muted'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="font-medium">{who.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ title, danger, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-full text-ink-faint hover:bg-muted transition ${
        danger ? 'hover:text-red-500' : 'hover:text-accent'
      }`}
    >
      {children}
    </button>
  );
}

// `canDelete`: el admin, y solo en salas (los privados no se moderan desde acá).
export default function MessageList({ messages, currentUsername, canDelete, onReact, onReply, onDelete }) {
  const bottomRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [pickerId, setPickerId] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  // Tocar fuera cierra el popover y las acciones abiertas
  useEffect(() => {
    const close = () => {
      setSelectedId(null);
      setPickerId(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-app">
      {messages.map((m, i) => (
        <Message
          key={m.id ?? `s${i}`}
          data={m}
          currentUsername={currentUsername}
          canDelete={canDelete}
          selected={selectedId === m.id}
          picking={pickerId === m.id}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          onPick={setPickerId}
          onReact={onReact}
          onReply={(msg) => {
            setSelectedId(null);
            onReply(msg);
          }}
          onDelete={onDelete}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
