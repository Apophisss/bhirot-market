export function Avatar({ name, image, size = 32 }: { name?: string | null; image?: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name ?? ""} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />;
  }
  const hue = [...(name ?? "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 200);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 60% 45%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
