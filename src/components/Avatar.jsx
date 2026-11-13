// Round initial with a stable color per name.
export function hueFor(text = '') {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

export default function Avatar({ name = '?', size }) {
  return (
    <span className="avatar" style={{ '--h': hueFor(name), ...(size ? { width: size, height: size } : {}) }}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}
