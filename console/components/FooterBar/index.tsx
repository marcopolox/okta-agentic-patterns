export default function FooterBar() {
  const s = [84,104,105,115,32,100,101,109,111,32,99,114,101,97,116,101,100,32,
             119,105,116,104,32,9829,32,98,121,32,78,101,115,104,32,80,111,112,
             111,118,105,99];
  const heart = s.indexOf(9829);
  const pre  = s.slice(0, heart).map(n => String.fromCharCode(n)).join('');
  const post = s.slice(heart + 1).map(n => String.fromCharCode(n)).join('');
  return (
    <p className="text-[10px] text-white/20 tracking-wide whitespace-nowrap">
      {pre}<span className="text-rose-400/50">{String.fromCharCode(9829)}</span>{post}
    </p>
  );
}
