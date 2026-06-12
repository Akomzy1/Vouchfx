/** VouchFX logo mark — teal checkmark with dot (matches design prototype). */
export default function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path
        d="M16 52 L46 82 L104 22"
        fill="none"
        stroke="#14B8A6"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="104" cy="22" r="10" fill="#2DD4BF" />
    </svg>
  );
}
