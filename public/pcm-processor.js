class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const channel = input?.[0];

    if (!channel || channel.length === 0) {
      return true;
    }

    const buffer = new ArrayBuffer(channel.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(i * 2, value, true);
    }

    this.port.postMessage(buffer, [buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
