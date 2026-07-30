import { useEffect, useRef, useState } from 'react';
import { Image, Loader2, Send, Smile, X } from 'lucide-react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { api } from '../lib/api';
import { compressImage, formatBytes } from '../lib/compressImage';
import { useTheme } from '../lib/theme';

// `allowPhotos` es false en las salas: las fotos solo van por privado (el servidor
// también lo rechaza, esto es solo para no ofrecer el botón).
// `socketId` es lo que prueba ante el servidor que estamos en el chat al subir una foto.
export default function MessageInput({ onSend, allowPhotos = false, socketId = null }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sizes, setSizes] = useState(null); // { original, compressed }
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const isDark = useTheme() === 'dark';

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

  // Al cambiar de privado a sala se descarta la foto en cola
  useEffect(() => {
    if (!allowPhotos) clearFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowPhotos]);

  async function pickFile(e) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!picked) return;

    setError('');
    clearFile();
    setCompressing(true);
    try {
      const compressed = await compressImage(picked);
      setFile(compressed);
      setPreview(URL.createObjectURL(compressed));
      setSizes({ original: picked.size, compressed: compressed.size });
    } catch {
      setFile(picked);
      setPreview(URL.createObjectURL(picked));
      setSizes(null);
    }
    setCompressing(false);
  }

  function clearFile() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
    setSizes(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (compressing || (!trimmed && !file)) return;

    setError('');
    let imageUrl = null;

    if (file) {
      setUploading(true);
      try {
        const res = await api.uploadPhoto(file, socketId);
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
    <div className="p-4 bg-panel border-t border-edge shrink-0">
      {compressing && (
        <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 text-xs text-ink-faint">
          <Loader2 size={14} className="animate-spin" /> Comprimiendo foto…
        </div>
      )}
      {preview && (
        <div className="max-w-4xl mx-auto mb-2 flex items-center gap-3">
          <div className="relative">
            <img src={preview} alt="Vista previa" className="h-20 rounded-lg border border-edge shadow-sm" />
            <button
              onClick={clearFile}
              className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-0.5 hover:bg-red-500 transition"
              title="Quitar foto"
            >
              <X size={14} />
            </button>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-ink-faint truncate">{file?.name}</p>
            {sizes && (
              <p className="text-xs text-ink-faint">
                {sizes.compressed < sizes.original ? (
                  <>
                    <span className="line-through">{formatBytes(sizes.original)}</span>{' '}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {formatBytes(sizes.compressed)}
                    </span>
                  </>
                ) : (
                  formatBytes(sizes.compressed)
                )}
              </p>
            )}
          </div>
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
                theme={isDark ? Theme.DARK : Theme.LIGHT}
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
          className={`p-3 rounded-full transition hover:bg-muted ${
            showEmoji ? 'text-accent' : 'text-ink-faint hover:text-accent'
          }`}
          title="Emojis"
        >
          <Smile size={20} />
        </button>
        {allowPhotos && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={compressing}
            className="p-3 text-ink-faint hover:text-accent hover:bg-muted rounded-full transition disabled:opacity-50"
            title="Enviar foto"
          >
            {compressing ? <Loader2 size={20} className="animate-spin" /> : <Image size={20} />}
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje..."
          autoComplete="off"
          className="flex-1 bg-muted border-0 text-ink placeholder:text-ink-faint text-sm rounded-full focus:ring-2 focus:ring-accent focus:outline-none block w-full p-3 px-4 shadow-inner transition-colors"
        />
        <button
          type="submit"
          disabled={uploading || compressing}
          className="p-3 bg-accent hover:bg-accent-strong disabled:opacity-60 text-white rounded-full shadow-md transition transform hover:scale-105 active:scale-95"
          title={compressing ? 'Comprimiendo foto…' : uploading ? 'Subiendo foto…' : 'Enviar'}
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
