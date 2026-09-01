/**
 * mockTelemetryFeed.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained mock/simulated downlink telemetry generator for the
 * TELEMETRY TERMINAL · 1 Hz CSV panel.
 *
 * Touch ONLY this file and LogConsole.jsx. Nothing else.
 *
 * Emits realistic ~1 Hz [RX] CSV lines and periodic [EVT] lines that cycle
 * through all 8 flight states (S0:BOOT → S7:IMPACT).
 *
 * Set LOOP_AFTER_IMPACT = true  → restarts at S0 for a continuous kiosk demo
 * Set LOOP_AFTER_IMPACT = false → holds on the last [RX] line (real-world behaviour)
 */
import { useEffect, useRef, useState } from 'react';

// ─── Toggle ──────────────────────────────────────────────────────────────────
export const LOOP_AFTER_IMPACT = true;

// ─── Constants ───────────────────────────────────────────────────────────────
const TEAM_ID   = 'BU-ASTRO-CAN7';
const MAX_LINES = 200; // capped in-memory buffer size

// Base GNSS coords (Delhi area, matching reference lines)
const BASE_LAT  = 28.653297;
const BASE_LON  = 77.587593;

// ─── Prelaunch Sequence ──────────────────────────────────────────────────────
const PRELAUNCH_SEQUENCE = [
  { atTick: 0, lines: ['[TX] CONNECT', '[ACK] LINK_UP — PAN 0x103C, CH 26 confirmed'] },
  { atTick: 1, lines: ['[TX] [T-90] SET_WAYPOINT 28.653297,77.587593', '[ACK] [T-90] SET_WAYPOINT — coordinates echoed: 28.653297,77.587593'] },
  { atTick: 2, lines: ['[TX] [T-60] HEATER_ON', '[ACK] [T-60] HEATER_ON — MQ/MiCS sensors pre-warming'] },
  { atTick: 3, lines: ['[TX] [T-60] CAL', '[ACK] [T-60] CAL_OK — baro altitude zeroed, gyro bias stored to NVS'] },
  { atTick: 4, lines: ['[TX] [T-30] ARM', '[ACK] [T-30] ARM_OK — telemetry chain enabled'] },
  { atTick: 5, lines: ['[TX] [T-30] START_TX', '[EVT] [T-30] TX_START — 1 Hz downlink began (Rule 34)'] },
  { atTick: 6, lines: ['[EVT] [T-30] LINK_VERIFY — 1.0 Hz cadence, gap-free packet count, RSSI nominal'] },
  { atTick: 7, lines: ['[EVT] [T-0] LIFTOFF'] }
];

// ─── Phase Definitions ───────────────────────────────────────────────────────
// Each phase: { label, stateIdx, durationTicks, altStart, altEnd, events[] }
// events: [{ atTick, code, desc }]
const PHASES = [
  {
    label:         'BOOT',
    stateIdx:      0,
    durationTicks: 3,
    altStart:      0,
    altEnd:        0,
    events: [
      { atTick: 1, code: 'SYS_BOOT',     desc: 'self-test initiated' },
    ],
  },
  {
    label:         'TEST',
    stateIdx:      1,
    durationTicks: 5,
    altStart:      0,
    altEnd:        0,
    events: [
      { atTick: 3, code: 'SENSOR_CHECK', desc: 'all nominal' },
    ],
  },
  {
    label:         'PAD',
    stateIdx:      2,
    durationTicks: 5,
    altStart:      0,
    altEnd:        0,
    events: [
      { atTick: 2, code: 'GNSS_LOCK',    desc: '9+ sats acquired' },
    ],
  },
  {
    label:         'ASCENT',
    stateIdx:      3,
    durationTicks: 10,
    altStart:      0,
    altEnd:        650,
    events: [
      { atTick: 9, code: 'APOGEE_DETECTED', desc: 'peak altitude reached' },
    ],
  },
  {
    label:         'DEPLOY',
    stateIdx:      4,
    durationTicks: 3,
    altStart:      650,
    altEnd:        640,
    events: [
      { atTick: 1, code: 'ROCKET_DEPLOY', desc: 'Drogue deployed passively' },
    ],
  },
  {
    label:         'DESCENT',
    stateIdx:      5,
    durationTicks: 10,
    altStart:      640,
    altEnd:        600,
    events: [
      { atTick: 5, code: 'MAIN_ARMED',   desc: 'main chute armed' },
    ],
  },
  {
    label:         'AEROBREAK',
    stateIdx:      6,
    durationTicks: 8,
    altStart:      600,
    altEnd:        100,
    events: [
      { atTick: 1, code: 'AEROBREAK',    desc: 'Steerable main released' },
    ],
  },
  {
    label:         'IMPACT',
    stateIdx:      7,
    durationTicks: 6,   // how many ticks we hold at ground before looping
    altStart:      100,
    altEnd:        0,
    events: [
      { atTick: 2, code: 'IMPACT_DETECTED', desc: 'MISSION_END' },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function jitter(value, range) {
  return value + (Math.random() - 0.5) * 2 * range;
}

function formatClock(totalSeconds) {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Build one [RX] CSV line matching the exact reference format:
 * TEAM_ID,MM:SS,PKT#,ALT,PRESSURE,TEMP,VOLTAGE,GNSS_TIME,LAT,LON,GNSS_ALT,SATS,ACCEL_X,ACCEL_Y,GYRO_SPIN,GYRO_BIAS,STATE_IDX,STATUS
 */
function buildRxLine(tick, pktId, phase, altitude) {
  const clock      = formatClock(tick);
  const pressurePa = Math.round(lerp(101325, 90000, altitude / 650) + jitter(0, 30));
  const tempC      = (lerp(29.0, 22.0, altitude / 650) + jitter(0, 0.3)).toFixed(2);
  const voltage    = (jitter(4.02, 0.03)).toFixed(2);
  const lat        = (BASE_LAT  + jitter(0, 0.002)).toFixed(6);
  const lon        = (BASE_LON  + jitter(0, 0.002)).toFixed(6);
  const gnssAlt    = (altitude  + jitter(0, 5)).toFixed(1);
  const sats       = Math.round(jitter(10, 1));
  const accelX     = (jitter(0, 0.5)).toFixed(2);
  const accelY     = (jitter(0, 0.5)).toFixed(2);
  const gyroSpin   = (jitter(10.0, 0.15)).toFixed(2);
  const gyroBias   = 0;
  const status     = 'NOMINAL';

  return `[RX] ${TEAM_ID},${clock},${pktId},${altitude.toFixed(1)},${pressurePa},${tempC},${voltage},${clock},${lat},${lon},${gnssAlt},${sats},${accelX},${accelY},${gyroSpin},${gyroBias},${phase.stateIdx},${status}`;
}

/**
 * Build one [EVT] line.
 */
function buildEvtLine(code, desc) {
  return `[EVT] ${code} — ${desc}`;
}

// ─── Generator State ─────────────────────────────────────────────────────────
/**
 * createMockFeedState()
 * Returns a mutable state object that tracks the generator's position in the
 * phase state machine. Use nextLine() to advance it one tick at a time.
 */
export function createMockFeedState() {
  return {
    isPrelaunch: true,
    prelaunchTick: 0,
    phaseIdx:    0,
    tickInPhase: 0,
    totalTick:   0,
    pktId:       1,
    done:        false,
  };
}

/**
 * nextLine(state)
 * Advances the state machine by one tick and returns an array of strings to
 * append to the terminal (usually one [RX] line, sometimes followed by an
 * [EVT] line).  Returns [] when done and LOOP_AFTER_IMPACT is false.
 *
 * Mutates `state` in-place.
 */
export function nextLine(state) {
  if (state.done) return [];

  if (state.isPrelaunch) {
    const output = [];
    const step = PRELAUNCH_SEQUENCE.find(s => s.atTick === state.prelaunchTick);
    if (step) {
      output.push(...step.lines);
    }
    state.prelaunchTick++;
    const maxTick = Math.max(...PRELAUNCH_SEQUENCE.map(s => s.atTick));
    if (state.prelaunchTick > maxTick) {
       state.isPrelaunch = false;
    }
    return output;
  }

  const phase = PHASES[state.phaseIdx];
  const tick  = state.tickInPhase;
  const t     = phase.durationTicks > 1 ? tick / (phase.durationTicks - 1) : 1;
  const alt   = Math.max(0, lerp(phase.altStart, phase.altEnd, t));

  const output = [];

  // Emit RX packet
  output.push(buildRxLine(state.totalTick, state.pktId, phase, alt));
  state.pktId++;

  // Emit any EVT lines scheduled for this tick
  for (const evt of phase.events) {
    if (evt.atTick === tick) {
      output.push(buildEvtLine(evt.code, evt.desc));
    }
  }

  // Advance tick
  state.tickInPhase++;
  state.totalTick++;

  // Advance phase if exhausted
  if (state.tickInPhase >= phase.durationTicks) {
    state.phaseIdx++;
    state.tickInPhase = 0;

    if (state.phaseIdx >= PHASES.length) {
      if (LOOP_AFTER_IMPACT) {
        // Reset to S0 for continuous kiosk demo
        state.phaseIdx    = 0;
        state.tickInPhase = 0;
        state.totalTick   = 0;
        state.pktId       = 1;
      } else {
        state.done = true;
      }
    }
  }

  return output;
}

/**
 * useMockTelemetryFeed(enabled)
 * React hook — calls nextLine() every ~1000 ms and returns the capped line
 * buffer (newest at the bottom). Now supports an idle start state.
 *
 * @param {boolean} enabled - pass false to disable (e.g. real data is present)
 * @returns {object} { lines, start, isRunning }
 */
export function useMockTelemetryFeed(enabled = true) {
  const [lines, setLines] = useState(['[SYS] Ground station idle — press CONNECT to begin']);
  const [isRunning, setIsRunning] = useState(false);
  const stateRef = useRef(null);

  const start = () => {
    setIsRunning(true);
    setLines([]);
    stateRef.current = createMockFeedState();
  };

  useEffect(() => {
    if (!enabled || !isRunning) return;

    const id = setInterval(() => {
      const newLines = nextLine(stateRef.current);
      if (newLines.length === 0 && stateRef.current.done) {
        clearInterval(id);
        return;
      }
      if (newLines.length > 0) {
        setLines((prev) => [...prev, ...newLines].slice(-MAX_LINES));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [enabled, isRunning]);

  return { lines, start, isRunning };
}
