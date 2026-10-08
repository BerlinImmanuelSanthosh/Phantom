const fs = require('fs');
let content = fs.readFileSync('src/routes/_authenticated/chat.tsx', 'utf-8');

content = content.replace(
  '<PrimaryButton type="submit"', 
  '{!isRecording && <PrimaryButton type="submit"'
);
content = content.replace(
  '</PrimaryButton>', 
  '</PrimaryButton>}'
);

fs.writeFileSync('src/routes/_authenticated/chat.tsx', content);
console.log('PrimaryButton hidden during recording!');
