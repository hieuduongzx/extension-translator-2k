let activeStream = null;
let activeAudioContext = null;
let activeSource = null;
let activeProcessor = null;
let activeCaptureId = null;
let isPaused = false;
let isStopping = false;
const audioChannel = new BroadcastChannel("stream-translator-audio");

function bindProcessor() {
  if (!activeProcessor || !activeCaptureId) return;
  activeProcessor.port.onmessage = (event) => {
    if (isPaused || !activeCaptureId) return;
    const { buffer, peak } = event.data ?? {};
    if (!(buffer instanceof ArrayBuffer)) return;
    audioChannel.postMessage({
      type: "OFFSCREEN_AUDIO_CHUNK",
      payload: { chunk: buffer, peak, captureId: activeCaptureId }
    });
  };
}

async function stopCapture(expectedCaptureId) {
  if (expectedCaptureId && activeCaptureId && expectedCaptureId !== activeCaptureId) return;
  isStopping = true;
  const stream = activeStream;
  activeCaptureId = null;
  isPaused = false;

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
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
  isStopping = false;
}

async function startCapture(streamId, captureId) {
  await stopCapture();
  let stream = null;
  let audioContext = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    audioContext = new AudioContext();
    await audioContext.resume();
    await audioContext.audioWorklet.addModule(chrome.runtime.getURL("pcm-processor.js"));

    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, "pcm-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit"
    });

    activeStream = stream;
    activeAudioContext = audioContext;
    activeSource = source;
    activeProcessor = processor;
    activeCaptureId = captureId;

    source.connect(processor);
    source.connect(audioContext.destination);
    processor.connect(audioContext.destination);
    bindProcessor();

    processor.onprocessorerror = () => {
      audioChannel.postMessage({
        type: "OFFSCREEN_CAPTURE_ERROR",
        payload: { error: "Audio processor stopped unexpectedly.", captureId }
      });
    };
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (isStopping || activeCaptureId !== captureId) return;
        audioChannel.postMessage({
          type: "OFFSCREEN_CAPTURE_ENDED",
          payload: { captureId }
        });
        void stopCapture(captureId);
      });
    });

    return { sampleRate: audioContext.sampleRate, numChannels: 1 };
  } catch (error) {
    if (activeCaptureId === captureId) {
      await stopCapture(captureId);
    } else {
      if (audioContext) await audioContext.close().catch(() => undefined);
      stream?.getTracks().forEach((track) => track.stop());
    }
    throw error;
  }
}

function pauseCapture(captureId) {
  if (captureId !== activeCaptureId || isPaused || !activeSource || !activeProcessor) return;
  isPaused = true;
  activeProcessor.port.onmessage = null;
  // Drop the partial batch so stale audio isn't sent after resuming.
  activeProcessor.port.postMessage({ type: "reset" });
  activeSource.disconnect(activeProcessor);
  activeProcessor.disconnect();
}

function resumeCapture(captureId) {
  if (
    captureId !== activeCaptureId ||
    !isPaused ||
    !activeSource ||
    !activeProcessor ||
    !activeAudioContext
  )
    return;
  activeSource.connect(activeProcessor);
  activeProcessor.connect(activeAudioContext.destination);
  isPaused = false;
  bindProcessor();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;

  if (message?.type === "OFFSCREEN_START_CAPTURE") {
    const { streamId, captureId } = message.payload;
    void startCapture(streamId, captureId)
      .then((metadata) => sendResponse({ ok: true, ...metadata }))
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message?.type === "OFFSCREEN_STOP_CAPTURE") {
    void stopCapture(message.payload?.captureId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      );
    return true;
  }

  if (message?.type === "OFFSCREEN_PAUSE_CAPTURE") {
    pauseCapture(message.payload.captureId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "OFFSCREEN_RESUME_CAPTURE") {
    resumeCapture(message.payload.captureId);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
