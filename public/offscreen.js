let activeStream = null;
let activeAudioContext = null;
let activeSource = null;
let activeProcessor = null;
const audioChannel = new BroadcastChannel('stream-translator-audio');

async function stopCapture() {
  if (activeProcessor) {
    activeProcessor.disconnect();
    activeProcessor.port.onmessage = null;
    activeProcessor = null;
  }

  if (activeSource) {
    activeSource.disconnect();
    activeSource = null;
  }

  if (activeAudioContext) {
    await activeAudioContext.close().catch(() => undefined);
    activeAudioContext = null;
  }

  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
}

async function startCapture(streamId) {
  await stopCapture();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  const audioContext = new AudioContext();
  await audioContext.resume();
  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));

  const source = audioContext.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(audioContext, 'pcm-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
  });

  source.connect(processor);
  source.connect(audioContext.destination);
  processor.connect(audioContext.destination);

  processor.port.onmessage = (event) => {
    const chunk = event.data;
    audioChannel.postMessage({
      type: 'OFFSCREEN_AUDIO_CHUNK',
      payload: { chunk },
    });
  };

  activeStream = stream;
  activeAudioContext = audioContext;
  activeSource = source;
  activeProcessor = processor;

  return {
    sampleRate: audioContext.sampleRate,
    numChannels: 1,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OFFSCREEN_START_CAPTURE') {
    void startCapture(message.payload.streamId)
      .then((metadata) => sendResponse({ ok: true, ...metadata }))
      .catch((error) => {
        audioChannel.postMessage({
          type: 'OFFSCREEN_CAPTURE_ERROR',
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  if (message?.type === 'OFFSCREEN_STOP_CAPTURE') {
    void stopCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        audioChannel.postMessage({
          type: 'OFFSCREEN_CAPTURE_ERROR',
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  return false;
});
