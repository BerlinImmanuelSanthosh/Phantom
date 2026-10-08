const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/chat.tsx', 'utf-8');

// Update VoiceButton signature
content = content.replace('function VoiceButton({ onText }: { onText: (t: string) => void }) {', 'function VoiceButton({ onText, isRecording, setIsRecording }: { onText: (t: string) => void, isRecording: boolean, setIsRecording: (v: boolean) => void }) {');
content = content.replace('const [on, setOn] = useState(false);', '');

// Replace 'on' with 'isRecording' and 'setOn' with 'setIsRecording' inside VoiceButton
const vbStart = content.indexOf('function VoiceButton');
const vbEnd = content.indexOf('export const Route', vbStart) !== -1 ? content.indexOf('export const Route', vbStart) : content.length;
let vbContent = content.slice(vbStart, vbEnd);
vbContent = vbContent.replace(/\bon\b/g, 'isRecording');
vbContent = vbContent.replace(/setOn/g, 'setIsRecording');

// We also need to change the toggle button UI inside VoiceButton to match WhatsApp:
// If it is recording, show a Send icon. If not, show Mic.
vbContent = vbContent.replace(/{isRecording \? \(\s*<>\s*{.*}\s*<MicOff size={18} className="ml-1" \/>\s*<\/>\s*\) : <Mic size={20} \/>}/s, '{isRecording ? <Send size={20} /> : <Mic size={20} />}');

content = content.slice(0, vbStart) + vbContent + content.slice(vbEnd);

// Add isRecording state to Chat
content = content.replace('const [input, setInput] = useState("");', 'const [input, setInput] = useState("");\n  const [isRecording, setIsRecording] = useState(false);');

fs.writeFileSync('src/routes/_authenticated/chat.tsx', content);
console.log('VoiceButton and Chat updated!');
