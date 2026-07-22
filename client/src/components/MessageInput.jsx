import { useRef, useState } from 'react';
import { Image, Send, Smile, X } from 'lucide-react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import { api } from '../lib/api';

export default function MessageInput({ onSend }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  function insertEmoji(emoji) {
    const input = inputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    if (input && start != null && end != null) {
      const next = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      // Reposiciona el cursor justo después del emoji insertado
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + emoji.length;
        input.setSelectionRange(pos, pos);
      });
    } else {
      setText((prev) => prev + emoji);
    }
  }

  function pickFile(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError('');
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    e.target.value = ''; // permite volver a elegir el mismo archivo
  }

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !file) return;

    setError('');
    let imageUrl = null;

    if (file) {
      setUploading(true);
      try {
        const res = await api.uploadPhoto(file);
        imageUrl = res.url;
      } catch (err) {
        setError(err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend({ text: trimmed, imageUrl });
    setText('');
    clearFile();
    inputRef.current?.focus();
  }

  return (
    <div className="p-4 bg-white border-t border-slate-200 shrink-0">
      {preview && (
        <div className="max-w-4xl mx-auto mb-2 flex items-center gap-3">
          <div className="relative">
            <img src={preview} alt="Vista previa" className="h-20 rounded-lg border border-slate-200 shadow-sm" />
            <button
              onClick={clearFile}
              className="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full p-0.5 hover:bg-red-500 transition"
              title="Quitar foto"
            >
              <X size={14} />
            </button>
          </div>
          <span className="text-xs text-slate-400">{file?.name}</span>
        </div>
      )}
      {error && <p className="max-w-4xl mx-auto mb-2 text-xs text-red-500">{error}</p>}

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative flex items-center gap-2">
        {showEmoji && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
            <div className="absolute bottom-full left-0 mb-2 z-50">
              <EmojiPicker
                onEmojiClick={(e) => insertEmoji(e.emoji)}
                emojiStyle={EmojiStyle.NATIVE}
                theme="light"
                lazyLoadEmojis
                width={320}
                height={400}
                searchPlaceholder="Buscar emoji…"
                previewConfig={{ showPreview: false }}
              />
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={pickFile}
        />
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className={`p-3 rounded-full transition hover:bg-slate-50 ${
            showEmoji ? 'text-brand-600' : 'text-slate-400 hover:text-brand-600'
          }`}
          title="Emojis"
        >
          <Smile size={20} />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3 text-slate-400 hover:text-brand-600 hover:bg-slate-50 rounded-full transition"
          title="Enviar foto"
        >
          <Image size={20} />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje..."
          autoComplete="off"
          className="flex-1 bg-slate-50 border-0 text-slate-900 text-sm rounded-full focus:ring-2 focus:ring-brand-500 focus:outline-none block w-full p-3 px-4 shadow-inner transition-colors"
        />
        <button
          type="submit"
          disabled={uploading}
          className="p-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white rounded-full shadow-md transition transform hover:scale-105 active:scale-95"
          title={uploading ? 'Subiendo foto…' : 'Enviar'}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
