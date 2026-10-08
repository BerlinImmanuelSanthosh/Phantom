const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/chat.tsx', 'utf-8');

// 1. Add `isRecording` to Chat state
const chatStart = content.indexOf('function Chat() {');
content = content.replace(
  'const [input, setInput] = useState("");',
  'const [input, setInput] = useState("");\n  const [isRecording, setIsRecording] = useState(false);'
);

// 2. Add AudioVisualizer component before Chat
const visualizerCode = `
function AudioVisualizer({ isRecording }: { isRecording: boolean }) {
  const [vol, setVol] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setVol(0);
      setTime(0);
      return;
    }
    
    let active = true;
    let audioCtx: AudioContext;
    let stream: MediaStream;
    let raf: number;
    let timerId: ReturnType<typeof setInterval>;

    timerId = setInterval(() => setTime((t) => t + 1), 1000);

    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      if (!active) return;
      stream = s;
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      function update() {
        if (!active) return;
        analyser.getByteTimeDomainData(dataArray);
        let maxDev = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const dev = Math.abs(dataArray[i] - 128);
          if (dev > maxDev) maxDev = dev;
        }
        let normalizedVol = maxDev / 128;
        if (normalizedVol < 0.05) normalizedVol = 0;
        setVol(normalizedVol);
        raf = requestAnimationFrame(update);
      }
      update();
    }).catch(console.error);

    return () => {
      active = false;
      clearInterval(timerId);
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
    };
  }, [isRecording]);

  const mins = Math.floor(time / 60);
  const secs = (time % 60).toString().padStart(2, '0');

  const bars = Array.from({ length: 25 }).map((_, i) => {
    const baseHeight = 4;
    const maxHeight = 24;
    const wave = Math.sin((i / 25) * Math.PI) * vol;
    const noise = (Math.random() * 0.5 + 0.5) * vol;
    const h = baseHeight + (maxHeight * (wave + noise));
    return (
      <span key={i} className="w-1 rounded-full bg-primary transition-all duration-75" style={{ height: \`\${Math.max(baseHeight, Math.min(maxHeight, h))}px\` }} />
    );
  });

  return (
    <div className="flex h-11 flex-1 items-center justify-between rounded-full border border-primary/20 bg-primary/10 px-4 text-primary">
      <div className="flex items-center gap-2 font-medium">
        <span className="h-2 w-2 animate-pulse rounded-full shadow-[0_0_8px_rgba(255,0,0,0.8)]" style={{ backgroundColor: '#ef4444' }} />
        <span className="font-mono text-sm">{mins}:{secs}</span>
      </div>
      <div className="flex items-center gap-1 h-full">
        {bars}
      </div>
    </div>
  );
}
`;
if (content.indexOf('function AudioVisualizer') === -1) {
  content = content.replace('function Chat() {', visualizerCode + '\nfunction Chat() {');
}

// 3. Update the form inside Chat component
// Let's replace the whole <form> block to be extremely safe.
const formStartStr = '<form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">';
const formEndStr = '</form>';
const formStartIdx = content.indexOf(formStartStr);
const formEndIdx = content.indexOf(formEndStr, formStartIdx) + formEndStr.length;

const newForm = `<form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          {!isRecording && <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach prescription" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"><Paperclip size={20} /></button>}
          {isRecording ? (<AudioVisualizer isRecording={isRecording} />) : (
            <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Message Phantom…" aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-indigo/15 bg-background px-4 py-2.5 outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/25" />
          )}
          {!isRecording && <PrimaryButton type="submit" disabled={busy !== "idle" || !input.trim()} aria-label="Send" className="h-11 w-11 shrink-0 rounded-full p-0"><Send size={18} /></PrimaryButton>}
          <VoiceButton onText={(t) => { setInput(''); send(t); }} isRecording={isRecording} setIsRecording={setIsRecording} />
        </form>`;

if (formStartIdx !== -1 && formEndIdx !== -1) {
  content = content.slice(0, formStartIdx) + newForm + content.slice(formEndIdx);
}

// 4. Update VoiceButton component
// Let's do a strict block replacement of the entire function VoiceButton
const vbStartIdx = content.indexOf('function VoiceButton({ onText');
if (vbStartIdx !== -1) {
  const vbEndIdx = content.indexOf('export const Route', vbStartIdx);
  const newVb = `function VoiceButton({ onText, isRecording, setIsRecording }: { onText: (t: string) => void, isRecording: boolean, setIsRecording: (v: boolean) => void }) {
  const rec = useRef<SR | null>(null);
  function toggle() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return toast.error("Voice input isn't supported in this browser");
    if (isRecording) return rec.current?.stop();
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0]!.transcript).join(" "));
    r.onend = () => setIsRecording(false);
    rec.current = r;
    r.start();
    setIsRecording(true);
  }
  return (
    <button type="button" onClick={toggle} aria-label={isRecording ? "Stop voice input" : "Voice input"} aria-pressed={isRecording} className={\`flex h-11 shrink-0 items-center justify-center gap-0.5 rounded-full px-3 \${isRecording ? "bg-secondary" : "hover:bg-muted"}\`}>
      {isRecording ? <Send size={20} /> : <Mic size={20} />}
    </button>
  );
}
\n`;
  content = content.slice(0, vbStartIdx) + newVb + content.slice(vbEndIdx);
}

fs.writeFileSync('src/routes/_authenticated/chat.tsx', content);
console.log('Restored and applied fixes!');
