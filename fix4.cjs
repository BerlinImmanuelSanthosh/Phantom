const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/chat.tsx', 'utf-8');

const attachBtnRegex = /<button type="button" onClick=\{\(\) => fileRef\.current\?\.click\(\)\}.*?<Paperclip size=\{20\} \/><\/button>/s;
content = content.replace(attachBtnRegex, (match) => `{!isRecording && ${match}}`);

const visualizerComponent = `
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
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setVol(Math.min(1, avg / 50));
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

const chatFuncIdx = content.indexOf('function Chat() {');
if (content.indexOf('function AudioVisualizer') === -1) {
  content = content.slice(0, chatFuncIdx) + visualizerComponent + '\n\n' + content.slice(chatFuncIdx);
}

const recordingUIStart = content.indexOf('{isRecording ? (\n              <div className="flex h-11');
if (recordingUIStart !== -1) {
   const recordingUIEnd = content.indexOf(') : (\n              <textarea', recordingUIStart);
   if (recordingUIEnd !== -1) {
      const sliceToReplace = content.slice(recordingUIStart, recordingUIEnd);
      content = content.replace(sliceToReplace, '{isRecording ? (\n              <AudioVisualizer isRecording={isRecording} />\n            ');
   }
}

fs.writeFileSync('src/routes/_authenticated/chat.tsx', content);
console.log('Audio visualizer added!');
