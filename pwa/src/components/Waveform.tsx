import { waveform } from '../data';

export default function Waveform({ progress = 0 }: { progress?: number }) {
  const activeBars = Math.floor(waveform.length * progress);
  return (
    <div className="waveform" aria-label="Audio waveform">
      {waveform.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={index < activeBars ? 'wave-bar is-active' : 'wave-bar'}
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
}
