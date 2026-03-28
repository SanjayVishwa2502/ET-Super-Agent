const fs = require('fs');
const path = 'frontend/src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const start = code.indexOf("const toggleListening = () => {");
const endStr = "recognition.start();\r\n  };";
const endStr2 = "recognition.start();\n  };";

let end = code.indexOf(endStr, start);
let usedEndStr = endStr;
if (end === -1) {
    end = code.indexOf(endStr2, start);
    usedEndStr = endStr2;
}

if (start === -1 || end === -1) {
    console.log("Could not find", start, end);
    process.exit(1);
}

const newFunc = `const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e);
      if (e.error === 'network') {
        alert("Speech recognition API error (network). Please check your connection.");
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alert("Microphone access denied. Please allow microphone permissions.");
      }
      setIsListening(false);
    };

    let localFinal = "";

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          localFinal += t + ' ';
        } else {
          currentTranscript += t;
        }
      }
      
      const combined = (localFinal + currentTranscript).trim();
      
      // If there was text in input before we started, append to it, else replace.
      // Easiest is just replacing it for this session.
      setInput(combined);
      // NOTE: We do NOT auto-send. User verifies and clicks send!
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      alert("Failed to connect to the speech recognition service.");
    }
  };`;

code = code.substring(0, start) + newFunc + code.substring(end + usedEndStr.length);
fs.writeFileSync(path, code);
console.log("Patched mic!");
