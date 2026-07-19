// public/voice-commands-enhanced.js
// Expanded voice control for hands-free Klyfton AI operations

const VoiceCommandHandler = {
  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      console.log('Voice command:', transcript);
      this.handleCommand(transcript);
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };
  },

  start() {
    if (this.recognition) this.recognition.start();
  },

  async handleCommand(text) {
    // Parse intent from voice input
    if (text.includes('estimate') && text.includes('lead')) {
      const leadMatch = text.match(/lead\s+(\w+)/i);
      if (leadMatch) {
        await this.estimateLead(leadMatch[1]);
      }
    } else if (text.includes('close') && text.includes('job')) {
      const jobMatch = text.match(/job\s+(\d+)/i);
      const sqftMatch = text.match(/(\d+)\s*(?:sq|square)\s*ft/i);
      if (jobMatch && sqftMatch) {
        await this.closeJob(jobMatch[1], parseInt(sqftMatch[1]));
      }
    } else if (text.includes('what') && text.includes('pipeline')) {
      await this.readPipeline();
    } else if (text.includes('flag') && text.includes('weather')) {
      const jobMatch = text.match(/job\s+(\d+)/i);
      if (jobMatch) {
        await this.flagWeatherDelay(jobMatch[1]);
      }
    } else if (text.includes('send') && text.includes('follow')) {
      const leadMatch = text.match(/lead\s+(\w+)/i);
      if (leadMatch) {
        await this.sendFollowUp(leadMatch[1]);
      }
    } else {
      console.log('Command not recognized:', text);
    }
  },

  async estimateLead(leadName) {
    try {
      const response = await fetch('/api/klyfton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'estimate',
          leadName: leadName,
          voiceRequest: true,
        }),
      });
      const result = await response.json();
      this.speak(\Estimate generated for \: \\);
    } catch (e) {
      this.speak('Error generating estimate');
    }
  },

  async closeJob(jobId, sqft) {
    try {
      const response = await fetch('/api/jobs-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobId,
          action: 'close',
          areaCompleted: sqft,
          voiceRequest: true,
        }),
      });
      this.speak(\Job \ closed with \ square feet completed. Invoice triggered.\);
    } catch (e) {
      this.speak('Error closing job');
    }
  },

  async readPipeline() {
    try {
      const response = await fetch('/api/klyfton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getPipeline' }),
      });
      const result = await response.json();
      const summary = \You have \ active deals worth \$\\;
      this.speak(summary);
    } catch (e) {
      this.speak('Error reading pipeline');
    }
  },

  async flagWeatherDelay(jobId) {
    try {
      await fetch('/api/jobs-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobId,
          action: 'flagWeatherDelay',
        }),
      });
      this.speak(\Job \ flagged for weather delays. Team notified.\);
    } catch (e) {
      this.speak('Error flagging delay');
    }
  },

  async sendFollowUp(leadName) {
    try {
      await fetch('/api/klyfton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sendFollowUp',
          leadName: leadName,
        }),
      });
      this.speak(\Follow-up sent to \\);
    } catch (e) {
      this.speak('Error sending follow-up');
    }
  },

  speak(text) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      speechSynthesis.speak(utterance);
    }
  },
};

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
  VoiceCommandHandler.init();
});
