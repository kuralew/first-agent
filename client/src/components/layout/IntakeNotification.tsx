export function IntakeNotification({
  filename,
  onClose,
}: {
  filename: string;
  onClose: () => void;
}) {
  return (
    <div className="intake-notification">
      <span className="intake-notification-icon">⚡</span>
      <span>Auto-analyzing: <strong>{filename}</strong></span>
      <button className="intake-notification-close" onClick={onClose}>×</button>
    </div>
  );
}
