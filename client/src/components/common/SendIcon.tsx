export function SendIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="send-icon">
      <circle cx="12" cy="12" r="12" fill={disabled ? "#D1CBC4" : "#1B3A6B"} />
      <path d="M12 17V8M8 12L12 8L16 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
