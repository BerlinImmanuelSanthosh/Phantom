const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/chat.tsx', 'utf-8');

// 1. Rewrite AudioVisualizer
const startVis = content.indexOf('function AudioVisualizer');
const endVis = content.indexOf('function Chat() {');

const newVis = `function AudioVisualizer({ isRecording }: { isRecording: boolean }) {
  const [data, setData] = useState<Uint8Array>(new Uint8Array(30));
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setData(new Uint8Array(30));
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
      const dataArray = new Uint8Array(analyser.frequencyBinCount); // 128
      
      function update() {
        if (!active) return;
        analyser.getByteTimeDomainData(dataArray);
        
        let isSilent = true;
        for(let i=0; i<dataArray.length; i++) {
           if(Math.abs(dataArray[i] - 128) > 3) { isSilent = false; break; }
        }

        const newData = new Uint8Array(30);
        if (!isSilent) {
           for (let i = 0; i < 30; i++) {
              let maxDev = 0;
              const start = Math.floor(i * (128 / 30));
              const end = Math.floor((i + 1) * (128 / 30));
              for(let j=start; j<end; j++) {
                 const dev = Math.abs(dataArray[j] - 128);
                 if (dev > maxDev) maxDev = dev;
              }
              // Amplify a bit for visual effect
              newData[i] = Math.min(128, maxDev * 2.5);
           }
        }
        setData(newData);
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

  const bars = Array.from(data).map((val, i) => {
    const baseHeight = 4;
    const maxHeight = 28;
    const h = baseHeight + (val / 128) * maxHeight;
    return (
      <span key={i} className="w-1 rounded-full bg-primary transition-all duration-75" style={{ height: \`\${h}px\` }} />
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
content = content.slice(0, startVis) + newVis + content.slice(endVis);

// 2. Form layout: Move VoiceButton to the left side
const formStartStr = '<form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">';
const formEndStr = '</form>';
const formStartIdx = content.indexOf(formStartStr);
const formEndIdx = content.indexOf(formEndStr, formStartIdx) + formEndStr.length;

const newForm = `<form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
          <VoiceButton onText={(t) => { setInput(''); send(t); }} isRecording={isRecording} setIsRecording={setIsRecording} />
          {!isRecording && <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />}
          {!isRecording && <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach prescription" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"><Paperclip size={20} /></button>}
          {isRecording ? (<AudioVisualizer isRecording={isRecording} />) : (
            <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Message Phantom…" aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-indigo/15 bg-background px-4 py-2.5 outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/25" />
          )}
          {!isRecording && <PrimaryButton type="submit" disabled={busy !== "idle" || !input.trim()} aria-label="Send" className="h-11 w-11 shrink-0 rounded-full p-0"><Send size={18} /></PrimaryButton>}
        </form>`;

content = content.slice(0, formStartIdx) + newForm + content.slice(formEndIdx);

fs.writeFileSync('src/routes/_authenticated/chat.tsx', content);
console.log('Done');
