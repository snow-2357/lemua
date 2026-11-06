export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span>Reading progress</span>
        <span>{value}%</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${value}% complete`}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
