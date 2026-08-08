import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatShortClock } from '../../lib/formatters.js';
import { useTelemetryStore } from '../../store/telemetryStore.js';

function formatLine(packet) {
  const clock = formatShortClock(packet.missionElapsedMs);
  const phase = packet.mission.phase;
  const severity = packet.link.packetLossPercent > 5 ? 'ERR' : packet.imu.drift.rateZ > 0.5 ? 'WARN' : 'PKT';
  return `[${clock}] ${severity}#${String(packet.packetId).padStart(4, '0')} ${phase} ALT:${packet.altitude.barometric.toFixed(1)} PITCH:${packet.imu.compensated.pitch.toFixed(1)} ROLL:${packet.imu.compensated.roll.toFixed(1)} HDG:${packet.imu.compensated.heading.toFixed(1)} BAT:${packet.power.batteryVoltage.toFixed(2)}V`;
}

export default function LogConsole() {
  const packetHistory = useTelemetryStore((state) => state.packetHistory);
  const [paused, setPaused] = useState(false);
  const [activeTab, setActiveTab] = useState('flight');
  const [cadenceMs, setCadenceMs] = useState(1000);
  const scrollRef = useRef(null);
  const lastPacketTimeRef = useRef(0);

  const lines = useMemo(() => packetHistory.slice(-500).map((packet) => ({ packet, text: formatLine(packet) })), [packetHistory]);

  // Calculate cadence from packet timestamps
  useEffect(() => {
    if (packetHistory.length > 1) {
      const lastPacket = packetHistory[packetHistory.length - 1];
      const prevPacket = packetHistory[packetHistory.length - 2];
      const delta = lastPacket.missionElapsedMs - prevPacket.missionElapsedMs;
      if (delta > 0) {
        setCadenceMs(delta);
      }
    }
  }, [packetHistory]);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const isCadenceStable = Math.abs(cadenceMs - 1000) < 100;

  return (
    <div className="panel panel--fill scroll-panel panel-pad-0 log-panel">
      <div className="telemetry-tabs">
        <div className="telemetry-tabs__header">
          <div className="telemetry-tabs__nav">
            <button 
              className={`telemetry-tabs__tab ${activeTab === 'flight' ? 'telemetry-tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('flight')}
            >
              FLIGHT CSV (GRADED)
            </button>
            <button 
              className={`telemetry-tabs__tab ${activeTab === 'command' ? 'telemetry-tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('command')}
            >
              COMMAND LOG
            </button>
            <button 
              className={`telemetry-tabs__tab ${activeTab === 'quarantine' ? 'telemetry-tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('quarantine')}
            >
              QUARANTINE
            </button>
          </div>
          <div className="telemetry-tabs__controls">
            <div className="telemetry-tabs__cadence">
              <span className={`telemetry-tabs__heartbeat ${isCadenceStable ? 'telemetry-tabs__heartbeat--stable' : 'telemetry-tabs__heartbeat--unstable'}`}></span>
              <span className="telemetry-tabs__cadence-text">Cadence: {(cadenceMs / 1000).toFixed(2)}s ({isCadenceStable ? 'Stable' : 'Drift'})</span>
            </div>
            <button type="button" className="telemetry-tabs__scroll-btn" onClick={() => setPaused((value) => !value)}>
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
          </div>
        </div>

        <div className={`telemetry-tabs__pinned ${activeTab === 'flight' ? 'telemetry-tabs__pinned--flight' : activeTab === 'command' ? 'telemetry-tabs__pinned--command' : 'telemetry-tabs__pinned--quarantine'}`}>
          <div className="telemetry-tabs__pinned-label">LAST COMMAND</div>
          <div className="telemetry-tabs__pinned-content">
            <span className="telemetry-tabs__tx">TX: START_TX</span>
            <span className="telemetry-tabs__ack">ACK: ARM_OK</span>
          </div>
        </div>

        <div 
          className={`telemetry-tabs__content telemetry-tabs__content--${activeTab}`}
          ref={scrollRef}
        >
          {activeTab === 'flight' && (
            <>
              {lines.map(({ packet, text }) => (
                <div key={packet.packetId} className="console__line console__line--flight">
                  <span className="console__time">[{formatShortClock(packet.missionElapsedMs)}]</span>{' '}
                  <span className="console__pkt">PKT#{String(packet.packetId).padStart(4, '0')}</span>{' '}
                  <span className="console__value">{packet.mission.phase}</span>{' '}
                  <span className="console__value">ALT:{packet.altitude.barometric.toFixed(1)}</span>{' '}
                  <span className={packet.link.packetLossPercent > 5 ? 'console__err' : packet.imu.drift.rateZ > 0.5 ? 'console__warn' : 'console__value'}>
                    {text.replace(/^\[[^\]]+\]\s+[^\s]+\s+/, '')}
                  </span>
                </div>
              ))}
            </>
          )}

          {activeTab === 'command' && (
            <>
              <div className="console__line console__line--command">
                <span className="console__time">[00:00:15]</span>{' '}
                <span className="console__cmd-tx">TX: START_TX</span>{' '}
                <span className="console__cmd-bytes">BYTES: [0x41, 0x52, 0x4D]</span>
              </div>
              <div className="console__line console__line--command">
                <span className="console__time">[00:00:16]</span>{' '}
                <span className="console__cmd-ack">ACK: ARM_OK</span>
              </div>
              <div className="console__line console__line--command">
                <span className="console__time">[00:00:25]</span>{' '}
                <span className="console__cmd-tx">TX: CAL_ZERO</span>{' '}
                <span className="console__cmd-bytes">BYTES: [0x43, 0x5A]</span>
              </div>
              <div className="console__line console__line--command">
                <span className="console__time">[00:00:26]</span>{' '}
                <span className="console__cmd-ack">ACK: CAL_OK</span>
              </div>
            </>
          )}

          {activeTab === 'quarantine' && (
            <>
              <div className="console__line console__line--quarantine">
                <span className="console__time">[00:00:42]</span>{' '}
                <span className="console__quarantine-label">MALFORMED:</span>{' '}
                <span className="console__quarantine-data">[0x1A, 0x5D, 0x??] — incomplete frame, 2/4 bytes</span>
              </div>
              <div className="console__line console__line--quarantine">
                <span className="console__time">[00:01:03]</span>{' '}
                <span className="console__quarantine-label">CORRUPT:</span>{' '}
                <span className="console__quarantine-data">CRC mismatch on packet 0847 — data: [...]</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
