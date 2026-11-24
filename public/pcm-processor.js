// Converts tab audio to mono 16-bit PCM and posts it in ~100 ms batches
// (instead of one message per 128-frame render quantum), together with the
// batch's peak level so the background can detect silence.
const BATCH_SECONDS = 0.1;
const RENDER_QUANTUM_FRAMES = 128;

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is a global of AudioWorkletGlobalScope.
    this.batchFrames = Math.max(128, Math.round(sampleRate * BATCH_SECONDS));
    this.reset();
    this.port.onmessage = (event) => {
      if (event.data?.type === "reset") this.reset();
    };
  }

  reset() {
    this.samples = new Int16Array(this.batchFrames);
    this.offset = 0;
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input?.[0];

    // No active input (the tab is silent): keep the stream going with zeros so
    // Soniox still sees the pause (endpoints) and silence can be detected.
    if (!channel || channel.length === 0) {
      for (let i = 0; i < RENDER_QUANTUM_FRAMES; i += 1) {
        this.samples[this.offset] = 0;
        this.offset += 1;
        if (this.offset === this.batchFrames) this.emit();
      }
      return true;
    }

    const channels = input.length;
    for (let i = 0; i < channel.length; i += 1) {
      let mixed = 0;
      for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
        mixed += input[channelIndex]?.[i] ?? 0;
      }
      const sample = Math.max(-1, Math.min(1, mixed / channels));
      const level = sample < 0 ? -sample : sample;
      if (level > this.peak) this.peak = level;
      this.samples[this.offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.offset += 1;
      if (this.offset === this.batchFrames) this.emit();
    }

    return true;
  }

  emit() {
    const buffer = this.samples.buffer;
    this.port.postMessage({ buffer, peak: this.peak }, [buffer]);
    this.reset();
  }
}

registerProcessor("pcm-processor", PCMProcessor);
