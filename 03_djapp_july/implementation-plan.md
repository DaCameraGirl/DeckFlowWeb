# Phase 4 Implementation Plan: Varispeed, Loops, and Cue Points

## High-Level Overview

### Current State (Phase 3)
The application currently has:
- Two-deck audio playback with independent transport controls
- Per-deck mixer strip: 3-band EQ, DJ filter, volume fader with level meter
- Equal-power crossfader for smooth mixing between decks
- Master volume control
- Waveform visualization with click-to-seek functionality

### Phase 4 Goals
Add DJ performance features:
1. **Varispeed tempo control** - Adjust playback speed (0.5x to 2.0x)
2. **Manual looping** - Set loop in/out points with seamless wrapping
3. **Cue points** - Set and jump to specific positions
4. **Visual markers** - Display loop regions and cue points on waveform

### Architecture Impact
- **Data Model**: Extend `DeckState` with loop and cue fields
- **Audio Graph**: Add loop wrapping logic using floored-modulo
- **State Management**: Add 7 new action types to deck reducer
- **UI Components**: Add tempo slider, loop controls, cue controls
- **Waveform**: Add marker rendering for loops and cue points

---

## Feature 1: Varispeed Tempo Control

### Overview
Allow users to adjust playback speed from 50% to 200% of original tempo. This is varispeed (pitch changes with tempo), not time-stretching.

### Data Model Changes

**File: `src/deck.ts`**

The `tempo` field already exists in `DeckState` but is hardcoded to 1.0:
```typescript
export interface DeckState {
  // ... existing fields ...
  tempo: number; // playback rate ratio; currently 1.0
}
```

No changes needed - the field is already there and the audio graph already uses it:
```typescript
const incPerSample = s.tempo / Math.max(1, totalFrames - 1);
```

### State Management

**File: `src/useDeck.ts`**

Add action type:
```typescript
type Action =
  | { type: 'LOAD'; track: DeckState['track'] }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; norm: number }
  | { type: 'END' }
  | { type: 'SET_VOLUME'; value: number }
  | { type: 'SET_EQ'; band: EqBand; value: number }
  | { type: 'SET_FILTER'; value: number }
  | { type: 'SET_TEMPO'; value: number }; // NEW
```

Add reducer case:
```typescript
function reducer(s: DeckState, a: Action): DeckState {
  switch (a.type) {
    // ... existing cases ...
    case 'SET_TEMPO':
      return { ...s, tempo: Math.max(0.5, Math.min(2.0, a.value)) };
    default:
      return s;
  }
}
```

Export method:
```typescript
export interface UseDeck {
  // ... existing ...
  setTempo: (value: number) => void;
}

export function useDeck(id: string, audioReady: boolean): UseDeck {
  // ... existing code ...
  
  const setTempo = useCallback(
    (value: number) => dispatch({ type: 'SET_TEMPO', value }),
    []
  );

  return { 
    // ... existing ...
    setTempo 
  };
}
```

### UI Component

**File: `src/components/DeckPanel.tsx`**

Add tempo control in the transport section (after the play/pause button):

```tsx
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

{/* NEW: Tempo control */}
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
```

### CSS Styling

**File: `src/index.css`**

```css
.tempo-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  padding: 8px;
  background: rgba(43, 48, 61, 0.5);
  border-radius: 4px;
}

.tempo-control label {
  font-size: 11px;
  font-weight: 600;
  color: #8b92a7;
  min-width: 50px;
}

.tempo-control input[type="range"] {
  flex: 1;
  height: 4px;
  background: #2b303d;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.tempo-control input[type="range"]::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  background: #4cc2ff;
  border-radius: 50%;
  cursor: pointer;
}

.tempo-control .tempo-value {
  font-size: 12px;
  font-weight: 600;
  color: #4cc2ff;
  min-width: 45px;
  text-align: right;
}
```

### Optional Enhancement: Tempo Smoothing

To prevent zipper noise from rapid tempo changes, add smoothing in the audio graph:

**File: `src/deck.ts`**

```typescript
export function buildDeckSignal(s: DeckState): DeckSignal | null {
  if (!s.track) return null;

  const { pathL, pathR, totalFrames } = s.track;
  
  // Smooth tempo changes to prevent zipper noise
  const smoothedTempo = el.smooth(
    el.tau2pole(0.02),
    el.const({ key: `${s.id}_tempo`, value: s.tempo })
  );
  const incPerSample = el.div(
    smoothedTempo,
    el.const({ value: Math.max(1, totalFrames - 1) })
  );

  const inc = el.mul(
    el.const({ key: `${s.id}_playing`, value: s.playing ? 1 : 0 }),
    incPerSample
  );
  
  // ... rest of the function
}
```

### Testing Checklist
- [ ] Tempo slider changes playback speed smoothly
- [ ] Range is correctly limited to 0.5x - 2.0x
- [ ] Double-click resets to 100%
- [ ] Tempo control is disabled when no track is loaded
- [ ] No audio glitches or zipper noise during tempo changes
- [ ] Tempo persists when pausing/resuming playback

---

## Feature 2: Manual Looping

### Overview
Allow users to set loop in/out points and enable seamless looping playback. The audio graph wraps the playhead position using floored-modulo when loop is enabled.

### Data Model Changes

**File: `src/deck.ts`**

Add loop fields to `DeckState`:
```typescript
export interface DeckState {
  id: string;
  track: TrackData | null;
  playing: boolean;
  baseNorm: number;
  seekGen: number;
  tempo: number;
  volume: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filterCutoff: number;
  
  // NEW: Loop state
  loopEnabled: boolean;
  loopIn: number;      // normalized position 0..1
  loopOut: number;     // normalized position 0..1
}
```

Update `initialDeckState()`:
```typescript
export function initialDeckState(id: string): DeckState {
  return {
    id,
    track: null,
    playing: false,
    baseNorm: 0,
    seekGen: 0,
    tempo: 1,
    volume: 1,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filterCutoff: 0,
    loopEnabled: false,
    loopIn: 0,
    loopOut: 1,
  };
}
```

### Audio Graph Implementation

**File: `src/deck.ts`**

Modify `buildDeckSignal()` to implement loop wrapping:

```typescript
export function buildDeckSignal(s: DeckState): DeckSignal | null {
  if (!s.track) return null;

  const { pathL, pathR, totalFrames } = s.track;
  const incPerSample = s.tempo / Math.max(1, totalFrames - 1);

  const inc = el.const({ key: `${s.id}_inc`, value: s.playing ? incPerSample : 0 });
  const seekTrig = el.const({ key: `${s.id}_seek`, value: s.seekGen });
  const base = el.const({ key: `${s.id}_base`, value: s.baseNorm });

  // Unwrapped position for snapshot reporting
  const position = el.add(base, el.accum(inc, seekTrig));

  // Apply loop wrapping if enabled
  let playPosition = position;
  if (s.loopEnabled && s.loopOut > s.loopIn) {
    const loopLen = s.loopOut - s.loopIn;
    const loopInConst = el.const({ key: `${s.id}_loopIn`, value: s.loopIn });
    const loopLenConst = el.const({ key: `${s.id}_loopLen`, value: loopLen });
    
    // Floored modulo: offset - len·floor(offset/len)
    // This wraps the position within [loopIn, loopOut)
    const offset = el.sub(position, loopInConst);
    const wrapped = el.sub(
      offset,
      el.mul(loopLenConst, el.floor(el.div(offset, loopLenConst)))
    );
    playPosition = el.add(loopInConst, wrapped);
  }

  // Use playPosition for audio playback
  const leftRaw = el.table({ key: `${s.id}_tblL`, path: pathL }, playPosition);
  const rightRaw = el.table({ key: `${s.id}_tblR`, path: pathR }, playPosition);

  let left = channelChain(leftRaw, s);
  const right = channelChain(rightRaw, s);

  left = el.meter({ key: `${s.id}_metertap`, name: `${s.id}${METER_EVENT_SUFFIX}` }, left);

  // Report unwrapped position for UI (so we can detect loop boundaries)
  const posTap = el.snapshot(
    { key: `${s.id}_postap`, name: `${s.id}${POS_EVENT_SUFFIX}` },
    el.metro({ key: `${s.id}_posmetro`, interval: 33 }),
    position
  );
  left = el.add(left, el.mul(el.const({ value: 0 }), posTap));

  return { left, right };
}
```

### State Management

**File: `src/useDeck.ts`**

Add action types:
```typescript
type Action =
  | { type: 'LOAD'; track: DeckState['track'] }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; norm: number }
  | { type: 'END' }
  | { type: 'SET_VOLUME'; value: number }
  | { type: 'SET_EQ'; band: EqBand; value: number }
  | { type: 'SET_FILTER'; value: number }
  | { type: 'SET_TEMPO'; value: number }
  | { type: 'SET_LOOP_IN'; norm: number }
  | { type: 'SET_LOOP_OUT'; norm: number }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'EXIT_LOOP'; currentPos: number };
```

Add reducer cases:
```typescript
function reducer(s: DeckState, a: Action): DeckState {
  switch (a.type) {
    // ... existing cases ...
    
    case 'SET_LOOP_IN':
      return s.track ? { ...s, loopIn: clamp01(a.norm) } : s;

    case 'SET_LOOP_OUT':
      // Validate that loopOut is after loopIn
      const newOut = clamp01(a.norm);
      return s.track && newOut > s.loopIn
        ? { ...s, loopOut: newOut }
        : s;

    case 'TOGGLE_LOOP':
      // Only allow enabling loop if length is reasonable
      const minLoopLen = 0.01; // 1% of track minimum
      const canLoop = s.track && (s.loopOut - s.loopIn) >= minLoopLen;
      return canLoop ? { ...s, loopEnabled: !s.loopEnabled } : s;

    case 'EXIT_LOOP':
      // Re-base transport to current position to continue seamlessly
      return s.track && s.loopEnabled
        ? { 
            ...s, 
            loopEnabled: false, 
            baseNorm: clamp01(a.currentPos), 
            seekGen: s.seekGen + 1 
          }
        : s;
    
    default:
      return s;
  }
}
```

Export methods with position tracking:
```typescript
export function useDeck(id: string, audioReady: boolean): UseDeck {
  const [state, dispatch] = useReducer(reducer, id, initialDeckState);
  const [position, setPosition] = useState(0);
  const [level, setLevel] = useState(0);

  // Track position in a ref for EXIT_LOOP action
  const positionRef = useRef(0);
  useEffect(() => { 
    positionRef.current = position; 
  }, [position]);

  // ... existing code ...

  const setLoopIn = useCallback(
    (norm: number) => dispatch({ type: 'SET_LOOP_IN', norm }),
    []
  );

  const setLoopOut = useCallback(
    (norm: number) => dispatch({ type: 'SET_LOOP_OUT', norm }),
    []
  );

  const toggleLoop = useCallback(
    () => dispatch({ type: 'TOGGLE_LOOP' }),
    []
  );

  const exitLoop = useCallback(() => {
    dispatch({ type: 'EXIT_LOOP', currentPos: positionRef.current });
  }, []);

  return { 
    state, 
    position, 
    level, 
    load, 
    togglePlay, 
    seek, 
    setVolume, 
    setEq, 
    setFilter,
    setTempo,
    setLoopIn,
    setLoopOut,
    toggleLoop,
    exitLoop,
  };
}
```

Update interface:
```typescript
export interface UseDeck {
  state: DeckState;
  position: number;
  level: number;
  load: (file: File) => Promise<void>;
  togglePlay: () => void;
  seek: (norm: number) => void;
  setVolume: (value: number) => void;
  setEq: (band: EqBand, value: number) => void;
  setFilter: (value: number) => void;
  setTempo: (value: number) => void;
  setLoopIn: (norm: number) => void;
  setLoopOut: (norm: number) => void;
  toggleLoop: () => void;
  exitLoop: () => void;
}
```

### UI Component

**File: `src/components/DeckPanel.tsx`**

Add loop controls after tempo control:

```tsx
{/* Loop controls */}
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
```

### CSS Styling

**File: `src/index.css`**

```css
.loop-controls {
  display: flex;
  gap: 4px;
  margin: 8px 0;
  padding: 8px;
  background: rgba(43, 48, 61, 0.5);
  border-radius: 4px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 11px;
}

.btn.active {
  background: #4cc2ff;
  color: #1a1d26;
  font-weight: 600;
}

.btn-exit {
  background: #ff6b6b;
  color: white;
}

.btn-exit:hover {
  background: #ff5252;
}
```

### Testing Checklist
- [ ] Loop In button sets start point at current position
- [ ] Loop Out button sets end point at current position
- [ ] Loop Out must be after Loop In (validation works)
- [ ] Loop toggle enables/disables wrapping
- [ ] Playback wraps seamlessly at loop boundaries
- [ ] No audio glitches at loop point
- [ ] Exit Loop continues from current position without jump
- [ ] Loop works correctly with different tempo values
- [ ] Minimum loop length validation prevents too-short loops
- [ ] Loop controls disabled when no track loaded

---

## Feature 3: Cue Points

### Overview
Allow users to set a single cue point and jump to it instantly. This is simpler than loops - just store a position and seek to it.

### Data Model Changes

**File: `src/deck.ts`**

Add cue field to `DeckState`:
```typescript
export interface DeckState {
  // ... existing fields ...
  loopEnabled: boolean;
  loopIn: number;
  loopOut: number;
  
  // NEW: Cue point
  cuePoint: number;    // normalized position 0..1, -1 = not set
}
```

Update `initialDeckState()`:
```typescript
export function initialDeckState(id: string): DeckState {
  return {
    // ... existing fields ...
    loopEnabled: false,
    loopIn: 0,
    loopOut: 1,
    cuePoint: -1,  // -1 means no cue point set
  };
}
```

### State Management

**File: `src/useDeck.ts`**

Add action types:
```typescript
type Action =
  // ... existing actions ...
  | { type: 'SET_CUE'; norm: number }
  | { type: 'JUMP_TO_CUE' };
```

Add reducer cases:
```typescript
function reducer(s: DeckState, a: Action): DeckState {
  switch (a.type) {
    // ... existing cases ...
    
    case 'SET_CUE':
      return s.track ? { ...s, cuePoint: clamp01(a.norm) } : s;

    case 'JUMP_TO_CUE':
      return s.track && s.cuePoint >= 0
        ? { ...s, baseNorm: s.cuePoint, seekGen: s.seekGen + 1 }
        : s;
    
    default:
      return s;
  }
}
```

Export methods:
```typescript
export function useDeck(id: string, audioReady: boolean): UseDeck {
  // ... existing code ...

  const setCue = useCallback(
    (norm: number) => dispatch({ type: 'SET_CUE', norm }),
    []
  );

  const jumpToCue = useCallback(
    () => dispatch({ type: 'JUMP_TO_CUE' }),
    []
  );

  return { 
    // ... existing ...
    setCue,
    jumpToCue,
  };
}
```

Update interface:
```typescript
export interface UseDeck {
  // ... existing ...
  setCue: (norm: number) => void;
  jumpToCue: () => void;
}
```

### UI Component

**File: `src/components/DeckPanel.tsx`**

Add cue controls after loop controls:

```tsx
{/* Cue point controls */}
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
```

### CSS Styling

**File: `src/index.css`**

```css
.cue-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0;
  padding: 8px;
  background: rgba(43, 48, 61, 0.5);
  border-radius: 4px;
}

.btn-cue {
  background: #ffcc00;
  color: #1a1d26;
  font-weight: 600;
}

.btn-cue:hover:not(:disabled) {
  background: #ffd700;
}

.cue-info {
  font-size: 11px;
  color: #ffcc00;
  margin-left: 8px;
}
```

### Testing Checklist
- [ ] Set Cue button stores current position
- [ ] Jump to Cue instantly seeks to stored position
- [ ] Cue info displays correct timestamp
- [ ] Jump to Cue disabled when no cue is set
- [ ] Cue point persists across play/pause
- [ ] Cue controls disabled when no track loaded

---

## Feature 4: Waveform Markers

### Overview
Visually display loop regions and cue points on the waveform canvas. Loop regions show as highlighted areas with boundary lines, cue points show as triangle markers.

### Component Updates

**File: `src/components/Waveform.tsx`**

Add props for markers:
```typescript
interface Props {
  peaks: TrackPeaks | null;
  position: number;
  onSeek: (norm: number) => void;
  // NEW: Marker props
  loopEnabled?: boolean;
  loopIn?: number;
  loopOut?: number;
  cuePoint?: number;
}
```

Update the `draw()` function to render markers:

```typescript
const draw = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return;

  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cache = cacheRef.current;
  if (!cache) {
    ctx.strokeStyle = '#2b303d';
    ctx.beginPath();
    ctx.moveTo(0, cssH / 2);
    ctx.lineTo(cssW, cssH / 2);
    ctx.stroke();
    return;
  }

  const total = cache.width;
  const { start, win } = windowFor(total);

  // Blit the waveform
  ctx.drawImage(cache, start, 0, win, cache.height, 0, 0, cssW, cssH);

  // NEW: Draw loop region if enabled
  if (loopEnabled && loopIn !== undefined && loopOut !== undefined) {
    const loopStartX = ((loopIn * total - start) / win) * cssW;
    const loopEndX = ((loopOut * total - start) / win) * cssW;
    
    // Only draw if visible in current window
    if (loopEndX >= 0 && loopStartX <= cssW) {
      // Semi-transparent fill for loop region
      ctx.fillStyle = 'rgba(76, 194, 255, 0.15)';
      ctx.fillRect(
        Math.max(0, loopStartX), 
        0, 
        Math.min(cssW, loopEndX) - Math.max(0, loopStartX), 
        cssH
      );
      
      // Loop boundary lines
      ctx.strokeStyle = '#4cc2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      if (loopStartX >= 0 && loopStartX <= cssW) {
        ctx.moveTo(loopStartX, 0);
        ctx.lineTo(loopStartX, cssH);
      }
      
      if (loopEndX >= 0 && loopEndX <= cssW) {
        ctx.moveTo(loopEndX, 0);
        ctx.lineTo(loopEndX, cssH);
      }
      
      ctx.stroke();
    }
  }

  // NEW: Draw cue point marker
  if (cuePoint !== undefined && cuePoint >= 0) {
    const cueX = ((cuePoint * total - start) / win) * cssW;
    
    // Only draw if visible
    if (cueX >= -10 && cueX <= cssW + 10) {
      // Triangle marker pointing down
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(cueX, 0);
      ctx.lineTo(cueX - 6, 12);
      ctx.lineTo(cueX + 6, 12);
      ctx.closePath();
      ctx.fill();
      
      // Vertical line from marker
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cueX, 12);
      ctx.lineTo(cueX, cssH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Draw playhead (on top of everything)
  const playX = ((position * total - start) / win) * cssW;
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playX, 0);
  ctx.lineTo(playX, cssH);
  ctx.stroke();
}, [position, windowFor, loopEnabled, loopIn, loopOut, cuePoint]);
```

Update default props:
```typescript
export default function Waveform({ 
  peaks, 
  position, 
  onSeek,
  loopEnabled = false,
  loopIn = 0,
  loopOut = 1,
  cuePoint = -1,
}: Props) {
  // ... rest of component
}
```

### Parent Component Updates

**File: `src/components/DeckPanel.tsx`**

Pass marker props to Waveform:

```tsx
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
```

### Testing Checklist
- [ ] Loop region displays as semi-transparent blue overlay
- [ ] Loop boundaries show as vertical blue lines
- [ ] Loop markers only visible when loop is set
- [ ] Cue point displays as yellow triangle at top
- [ ] Cue point has dashed vertical line
- [ ] Cue marker only visible when cue is set
- [ ] Markers scroll correctly when waveform is zoomed
- [ ] Markers clip correctly at window edges
- [ ] Playhead renders on top of all markers
- [ ] No performance degradation from marker rendering

---

## Implementation Order

### Phase 1: Foundation (1 hour)
1. **Data model setup**
   - Add loop and cue fields to `DeckState`
   - Update `initialDeckState()`
   - Verify TypeScript compilation

### Phase 2: Tempo Control (45 minutes)
2. **Tempo state management**
   - Add `SET_TEMPO` action
   - Implement reducer case
   - Export `setTempo` method

3. **Tempo UI**
   - Add tempo slider to `DeckPanel`
   - Add CSS styling
   - Test tempo changes

### Phase 3: Loop Implementation (2 hours)
4. **Loop audio graph**
   - Implement floored-modulo wrapping in `buildDeckSignal()`
   - Test loop wrapping behavior

5. **Loop state management**
   - Add loop actions (`SET_LOOP_IN`, `SET_LOOP_OUT`, `TOGGLE_LOOP`, `EXIT_LOOP`)
   - Implement reducer cases with validation
   - Add position tracking for loop exit
   - Export loop methods

6. **Loop UI**
   - Add loop control buttons to `DeckPanel`
   - Add CSS styling
   - Test loop workflow

### Phase 4: Cue Points (45 minutes)
7. **Cue state management**
   - Add cue actions (`SET_CUE`, `JUMP_TO_CUE`)
   - Implement reducer cases
   - Export cue methods

8. **Cue UI**
   - Add cue control buttons to `DeckPanel`
   - Add CSS styling
   - Test cue functionality

### Phase 5: Visual Markers (1.5 hours)
9. **Waveform marker rendering**
   - Add marker props to `Waveform` component
   - Implement loop region rendering
   - Implement cue point rendering
   - Handle visibility and clipping

10. **Integration**
    - Pass marker props from `DeckPanel` to `Waveform`
    - Test marker display and scrolling

### Phase 6: Polish & Testing (1 hour)
11. **Edge case handling**
    - Add tempo smoothing (optional)
    - Validate loop boundaries
    - Test all interactions

12. **Final testing**
    - Run through complete testing checklist
    - Fix any bugs
    - Document known limitations

**Total estimated time: ~6-7 hours**

---

## Complete Testing Checklist

### Tempo Control
- [ ] Tempo slider changes playback speed (0.5x to 2.0x)
- [ ] Double-click tempo resets to 100%
- [ ] Tempo value displays correctly as percentage
- [ ] Tempo control disabled when no track loaded
- [ ] No audio glitches during tempo changes
- [ ] Tempo persists across play/pause
- [ ] Tempo works correctly with loops

### Loop Functionality
- [ ] Loop In button sets start point at current position
- [ ] Loop Out button sets end point at current position
- [ ] Loop Out must be after Loop In (validation)
- [ ] Loop toggle enables/disables wrapping
- [ ] Playback wraps seamlessly at loop boundaries
- [ ] No audio glitches at loop point
- [ ] Exit Loop continues from current position
- [ ] Loop works with different tempo values
- [ ] Minimum loop length validation works
- [ ] Loop controls disabled when no track loaded
- [ ] Loop state persists across play/pause

### Cue Points
- [ ] Set Cue button stores current position
- [ ] Jump to Cue instantly seeks to stored position
- [ ] Cue info displays correct timestamp
- [ ] Jump to Cue disabled when no cue set
- [ ] Cue point persists across play/pause
- [ ] Cue controls disabled when no track loaded
- [ ] Cue works correctly with loops

### Waveform Markers
- [ ] Loop region displays as semi-transparent overlay
- [ ] Loop boundaries show as vertical lines
- [ ] Loop markers only visible when loop is set
- [ ] Cue point displays as triangle marker
- [ ] Cue point has dashed vertical line
- [ ] Cue marker only visible when cue is set
- [ ] Markers scroll correctly when zoomed
- [ ] Markers clip correctly at window edges
- [ ] Playhead renders on top of markers
- [ ] No performance issues from markers

### Integration
- [ ] All features work together without conflicts
- [ ] Can set loop while playing
- [ ] Can change tempo while looping
- [ ] Can jump to cue while looping
- [ ] Both decks work independently
- [ ] No cross-deck interference

---

## Technical Considerations

### 1. Loop Exit Position Tracking

**Challenge:** The reducer doesn't have access to the live playhead position, but we need it for seamless loop exit.

**Solution:** Store position in a ref and pass it to the EXIT_LOOP action:

```typescript
const positionRef = useRef(0);
useEffect(() => { 
  positionRef.current = position; 
}, [position]);

const exitLoop = useCallback(() => {
  dispatch({ type: 'EXIT_LOOP', currentPos: positionRef.current });
}, []);
```

### 2. Tempo Smoothing

**Challenge:** Rapid tempo changes can cause zipper noise.

**Solution:** Apply smoothing in the audio graph using `el.smooth()`:

```typescript
const smoothedTempo = el.smooth(
  el.tau2pole(0.02),
  el.const({ key: `${s.id}_tempo`, value: s.tempo })
);
```

### 3. Loop Boundary Validation

**Challenge:** Users could set invalid loop boundaries (loopOut before loopIn, or too short).

**Solution:** Validate in the reducer:

```typescript
case 'SET_LOOP_OUT':
  const newOut = clamp01(a.norm);
  return s.track && newOut > s.loopIn
    ? { ...s, loopOut: newOut }
    : s;

case 'TOGGLE_LOOP':
  const minLoopLen = 0.01; // 1% of track
  const canLoop = s.track && (s.loopOut - s.loopIn) >= minLoopLen;
  return canLoop ? { ...s, loopEnabled: !s.loopEnabled } : s;
```

### 4. Waveform Marker Performance

**Challenge:** Redrawing markers on every frame could impact performance.

**Solution:** The existing cached bitmap approach already handles this well. Markers are drawn after the bitmap blit, so only the marker drawing is per-frame (minimal cost).

### 5. Position Reporting During Loop

**Challenge:** We need to report both the unwrapped position (for UI) and use the wrapped position (for audio).

**Solution:** The audio graph uses two position signals:
- `position` - unwrapped, reported via snapshot
- `playPosition` - wrapped, used for table reads

This allows the UI to detect loop boundaries while audio plays seamlessly.

---

## Known Limitations

### 1. Varispeed (Not Time-Stretching)
**Limitation:** Tempo changes also change pitch. This is varispeed, not true time-stretching.

**Why:** Real pitch-independent tempo would require compiling WSOLA or signalsmith-stretch to WASM and running it in the audio worklet. This is a significant complexity increase.

**Workaround:** None. This is an intentional scope decision for the teaching build.

### 2. Loop Precision
**Limitation:** Loops are sample-accurate but may not align perfectly with musical beats.

**Why:** Without BPM analysis (Phase 5), we can't quantize loop points to beat boundaries.

**Workaround:** Users must manually set loop points at beat boundaries by ear.

### 3. Single Cue Point
**Limitation:** Only one cue point per deck.

**Why:** Multiple hot cues would require array storage and more complex UI.

**Workaround:** Users can set and reset the single cue point as needed.

### 4. No Loop Quantization
**Limitation:** Loop boundaries are set at exact playhead position, not quantized to beats.

**Why:** Beat quantization requires BPM analysis and beat grid (Phase 5).

**Workaround:** Users must set loop points manually at beat boundaries.

### 5. Loop Length Minimum
**Limitation:** Minimum loop length is 1% of track duration.

**Why:** Very short loops (< 1 frame) could cause audio glitches or infinite loops in the graph.

**Workaround:** This is a reasonable minimum for musical loops.

---

## Success Criteria

Phase 4 is complete when:

1. ✅ Users can adjust tempo from 50% to 200%
2. ✅ Users can set loop in/out points and enable looping
3. ✅ Playback wraps seamlessly within loop boundaries
4. ✅ Users can exit loops and continue playback
5. ✅ Users can set and jump to cue points
6. ✅ Waveform displays loop regions and cue points visually
7. ✅ All features work on both decks independently
8. ✅ No audio glitches during tempo changes or loop wrapping
9. ✅ All controls are properly disabled when no track is loaded
10. ✅ All tests in the testing checklist pass

---

## Next Steps (Phase 5)

After Phase 4 is complete, Phase 5 will add:
- BPM detection in a Web Worker
- Beat grid overlay on waveform
- Tap-tempo functionality
- Tempo-match SYNC between decks

These features build on Phase 4's tempo control and will enable beat-aligned mixing.
