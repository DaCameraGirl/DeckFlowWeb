// DeckPanel — everything for one deck: load button, track name, waveform, the mixer
// strip (DeckControls), and transport. Driven by a UseDeck, so deck A and deck B are
// the same component with different state.

import { useRef, useState } from 'react';
import type { UseDeck } from '../useDeck';
import Waveform from './Waveform';

interface Props {
  deck: UseDeck;
  label: string;
  ensureAudio: () => Promise<void>; // boots the AudioContext on first user gesture
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DeckPanel({ deck, label, ensureAudio }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      await ensureAudio();
      await deck.load(file);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const { track } = deck.state;

  return (
    <section className="deck">
      <header className="deck-head">
        <span className="deck-label">{label}</span>
        <button className="btn ghost" onClick={() => fileInputRef.current?.click()} disabled={loading}>
          {loading ? 'Loading…' : 'Load track'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.flac,.aiff,.aif"
          onChange={onPickFile}
          hidden
        />
      </header>

      <div className="track-name">{track ? track.name : 'No track loaded'}</div>

      <div className="waveform-wrap">
        <Waveform
          peaks={track?.peaks ?? null}
          position={deck.position}
          onSeek={deck.seek}
          loopEnabled={deck.state.loopEnabled}
          loopIn={deck.state.loopIn}
          loopOut={deck.state.loopOut}
          cuePoint={deck.state.cuePoint}
        />
      </div>

      <div className="transport">
        <button
          className={`btn ${deck.state.playing ? 'stop' : 'start'}`}
          onClick={deck.togglePlay}
          disabled={!track}
        >
          {deck.state.playing ? '◼ Pause' : '▶ Play'}
        </button>
        <span className="time">
          {track ? `${fmt(deck.position * track.duration)} / ${fmt(track.duration)}` : '0:00 / 0:00'}
        </span>
      </div>

      <div className="tempo-control">
        <label>TEMPO</label>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.01}
          value={deck.state.tempo}
          onChange={(e) => deck.setTempo(parseFloat(e.target.value))}
          onDoubleClick={() => deck.setTempo(1.0)}
          disabled={!track}
          title="Double-click to reset to 100%"
        />
        <span className="tempo-value">{(deck.state.tempo * 100).toFixed(0)}%</span>
      </div>

      <div className="loop-controls">
        <button
          className="btn btn-sm"
          onClick={() => deck.setLoopIn(deck.position)}
          disabled={!track}
          title="Set loop start point at current position"
        >
          Loop In
        </button>
        <button
          className="btn btn-sm"
          onClick={() => deck.setLoopOut(deck.position)}
          disabled={!track}
          title="Set loop end point at current position"
        >
          Loop Out
        </button>
        <button
          className={`btn btn-sm ${deck.state.loopEnabled ? 'active' : ''}`}
          onClick={deck.toggleLoop}
          disabled={!track || (deck.state.loopOut - deck.state.loopIn) < 0.01}
          title="Toggle loop on/off"
        >
          Loop {deck.state.loopEnabled ? 'ON' : 'OFF'}
        </button>
        {deck.state.loopEnabled && (
          <button 
            className="btn btn-sm btn-exit" 
            onClick={deck.exitLoop}
            title="Exit loop and continue playback"
          >
            Exit Loop
          </button>
        )}
      </div>

      <div className="cue-controls">
        <button
          className="btn btn-sm"
          onClick={() => deck.setCue(deck.position)}
          disabled={!track}
          title="Set cue point at current position"
        >
          Set Cue
        </button>
        <button
          className="btn btn-sm btn-cue"
          onClick={deck.jumpToCue}
          disabled={!track || deck.state.cuePoint < 0}
          title="Jump to cue point"
        >
          Jump to Cue
        </button>
        {deck.state.cuePoint >= 0 && (
          <span className="cue-info">
            Cue: {fmt(deck.state.cuePoint * (track?.duration ?? 0))}
          </span>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
