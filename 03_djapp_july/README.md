# DeckFlow Web

A browser-based DJ mixer built with React, TypeScript, and Elementary Audio (WASM). This is a teaching variant of the desktop DeckFlow application, designed to demonstrate audio graph architecture and DJ mixing concepts without native dependencies.

![DeckFlow Web](./music/DeckFlow_WEB_aPP.png)

## 🎵 Features

### Phase 3 (Complete)
- ✅ Two-deck audio playback with independent transport controls
- ✅ Per-deck mixer strip: 3-band EQ (Low/Mid/High), DJ filter (LPF/HPF sweep)
- ✅ Volume faders with real-time level meters
- ✅ Equal-power crossfader for smooth mixing between decks
- ✅ Master volume control
- ✅ Waveform visualization with click-to-seek and scroll-to-zoom

### Phase 4 (Complete) 🎉
- ✅ **Tempo control** - Varispeed playback (0.5x to 2.0x)
- ✅ **Manual looping** - Set loop in/out points with seamless wrapping
- ✅ **Cue points** - Set and jump to specific positions
- ✅ **Waveform markers** - Visual loop regions and cue point indicators

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173/ in your browser
```

## 🎛️ Usage

1. **Load tracks** - Click "Load track" on Deck A or Deck B
2. **Play/Pause** - Control playback with the play button
3. **Adjust tempo** - Use the tempo slider (50%-200%), double-click to reset
4. **Set loops**:
   - Click "Loop In" at the start position
   - Click "Loop Out" at the end position
   - Click "Loop ON" to enable looping
   - Click "Exit Loop" to continue playback
5. **Set cue points** - Click "Set Cue" to mark a position, "Jump to Cue" to return
6. **Mix tracks**:
   - Adjust EQ (High/Mid/Low) for each deck
   - Use the DJ filter for creative effects
   - Crossfade between decks with the center fader
   - Control master volume

## 🏗️ Architecture

### Audio Graph
Built with Elementary Audio (`@elemaudio/core` + `@elemaudio/web-renderer`), the audio graph runs in a Web Audio `AudioWorklet` compiled to WASM. Each deck reads audio directly from decoded buffers using a phasor-style transport:

```
position = base + accum(increment, seekGen)
```

Loop wrapping uses floored-modulo to seamlessly wrap playback within loop boundaries while reporting unwrapped position to the UI.

### State Management
- **Reducer-based state** for serializable transport and mixer controls
- **High-frequency state** (playhead position, meter levels) kept in refs to avoid re-renders
- **Keyed const nodes** in Elementary graph for efficient updates without rebuilds

### Components
```
src/
  audio.ts              - AudioContext + WebRenderer initialization
  track.ts              - Audio decoding and VFS management
  deck.ts               - DeckState + audio graph construction
  useDeck.ts            - Per-deck React hook with reducer
  App.tsx               - Two-deck composition with crossfader
  components/
    DeckPanel.tsx       - Deck UI (load, waveform, transport, controls)
    DeckControls.tsx    - Mixer strip (EQ, filter, volume, meter)
    Waveform.tsx        - Canvas waveform with markers
    Mixer.tsx           - Crossfader + master volume
    Knob.tsx            - Rotary control component
    Fader.tsx           - Vertical fader component
```

## 📋 Implementation Plan

See [implementation-plan.md](./implementation-plan.md) for the complete Phase 4 implementation guide, including:
- Detailed feature breakdowns
- Code examples for each component
- Step-by-step implementation order
- Testing checklist (40+ test cases)
- Technical considerations and edge cases
- Known limitations

## 🎓 Learning Goals

This project teaches:
- Audio graph architecture with Elementary Audio
- Web Audio API and AudioWorklet
- React state management patterns for real-time audio
- Canvas rendering optimization techniques
- DSP concepts (EQ, filters, varispeed, loop wrapping)

## 🔧 Tech Stack

- **Vite** - Build tool and dev server
- **React 18** - UI framework
- **TypeScript** (strict mode) - Type safety
- **Elementary Audio** - Audio graph DSP
- **Web Audio API** - Browser audio engine

## 📝 Project Spec

See [SPEC.md](./SPEC.md) for the complete project specification, including:
- Purpose and scope decisions
- Desktop → browser mapping
- Phase-by-phase delivery plan
- Technical decisions and rationale
- Known limitations

## 🎯 Next Steps (Phase 5)

Future enhancements:
- BPM detection in a Web Worker
- Beat grid overlay on waveform
- Tap-tempo functionality
- Tempo-match SYNC between decks

## 📄 License

This is a teaching project. See the original DeckFlow desktop application for licensing information.

## 🙏 Acknowledgments

Based on the desktop DeckFlow application architecture. This browser port demonstrates how Elementary Audio's renderer-agnostic design enables the same audio graph code to run in both native and web environments.