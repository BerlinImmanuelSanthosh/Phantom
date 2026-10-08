const fs = require('fs');
const content = fs.readFileSync('src/routes/_authenticated/chat.tsx', 'utf-8');

const replacement = `<VoiceButton onText={(t) => { setInput(''); send(t); }} isRecording={isRecording} setIsRecording={setIsRecording} />
          {isRecording ? (
            <div className="flex h-11 flex-1 items-center justify-between rounded-2xl border border-primary/20 bg-primary/10 px-4 text-primary">
              <div className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Recording voice...
              </div>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.span key={i} className="w-1 rounded-full bg-primary" animate={{ height: [6, 18, 6] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1 }} />
                ))}
              </div>
            </div>
          ) : (
            <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Message Phantom…" aria-label="Message" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-indigo/15 bg-background px-4 py-2.5 outline-none focus:border-cyan focus:ring-4 focus:ring-cyan/25" />
          )}
          <PrimaryButton type="submit" disabled={busy !== 'idle' || (!input.trim() && !isRecording)} aria-label="Send" className="h-11 w-11 shrink-0 rounded-full p-0"><Send size={18} /></PrimaryButton>
        `;

const startIdx = content.indexOf('<VoiceButton');
const endIdx = content.indexOf('</form>', startIdx);
if (startIdx !== -1 && endIdx !== -1) {
  const newContent = content.slice(0, startIdx) + replacement + content.slice(endIdx);
  fs.writeFileSync('src/routes/_authenticated/chat.tsx', newContent);
  console.log('Done!');
}
