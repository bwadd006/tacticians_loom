import { useEffect, useRef, useState } from 'react';
import type { CharacterPlanning } from '../../../shared/character_planning';

export function CharacterNoteEditor({ planning, onSave, onClear }: {
  planning: CharacterPlanning;
  onSave: (note: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(planning.note);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  useEffect(() => { if (!dirty) setDraft(planning.note); }, [planning.note, dirty]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function commit(value = draft) {
    if (timer.current) clearTimeout(timer.current);
    if (value === planning.note) { setDirty(false); setStatus('idle'); return; }
    const request = ++sequence.current;
    setStatus('saving');
    try {
      await onSave(value);
      if (request === sequence.current) { setDirty(false); setStatus('saved'); }
    } catch { if (request === sequence.current) setStatus('error'); }
  }
  function change(value: string) {
    setDraft(value); setDirty(true); setStatus('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(value), 700);
  }
  async function clear() {
    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');
    try { await onClear(); setDraft(''); setDirty(false); setStatus('saved'); }
    catch { setStatus('error'); }
  }
  return <div className="note_editor">
    <label><span className="visually_hidden">Personal note for {planning.characterId}</span><textarea value={draft} maxLength={10_000} placeholder="Add a personal note…" onChange={event => change(event.target.value)} onBlur={() => void commit()} /></label>
    <div className="note_status"><span role={status === 'error' ? 'alert' : 'status'} className={status === 'error' ? 'warning' : status === 'saved' ? 'feedback' : 'muted'}>{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved — edit or leave the field to retry.' : dirty ? 'Unsaved' : ''}</span>{(draft || planning.note) && <button className="quiet" onClick={() => void clear()}>Clear note</button>}</div>
  </div>;
}
