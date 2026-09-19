import { SoundTouch } from '@soundtouchjs/core'

/**
 * Time-stretches an AudioBuffer by `tempoFactor` using Web Audio resampling + SoundTouch pitch shifting.
 */
export async function timeStretchBuffer(
  buffer: AudioBuffer,
  tempoFactor: number
): Promise<AudioBuffer> {
  if (tempoFactor === 1.0) return buffer
  
  const channels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const originalLength = buffer.length
  
  // 1. Resample using OfflineAudioContext (changes speed AND pitch)
  const stretchedLength = Math.ceil(originalLength / tempoFactor)
  const offlineCtx = new OfflineAudioContext(channels, stretchedLength, sampleRate)
  
  const source = offlineCtx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = tempoFactor
  source.connect(offlineCtx.destination)
  source.start(0)
  
  const resampledBuffer = await offlineCtx.startRendering()
  
  // 2. Pitch shift back using SoundTouch
  const st = new SoundTouch({ sampleRate, sampleBufferType: 'fifo' })
  // @ts-ignore
  st.channels = channels
  st.pitch = 1 / tempoFactor
  
  // Interleave
  const interleaved = new Float32Array(stretchedLength * channels)
  for (let c = 0; c < channels; c++) {
    const channelData = resampledBuffer.getChannelData(c)
    for (let i = 0; i < stretchedLength; i++) {
      interleaved[i * channels + c] = channelData[i]
    }
  }
  
  // Process in chunks to prevent browser freeze on long tracks
  const chunkSize = 16384
  for (let i = 0; i < stretchedLength; i += chunkSize) {
    const chunkFrames = Math.min(chunkSize, stretchedLength - i)
    const chunk = new Float32Array(chunkFrames * channels)
    for (let j = 0; j < chunkFrames; j++) {
      for (let c = 0; c < channels; c++) {
        chunk[j * channels + c] = interleaved[(i + j) * channels + c]
      }
    }
    st.inputBuffer.putSamples(chunk)
    st.process()
    // Yield to the event loop every 16k frames (roughly 300ms of audio)
    await new Promise(r => setTimeout(r, 0))
  }
  
  // Push zero padding to flush the internal buffers (latency compensation)
  // SoundTouch WSOLA usually has latency around 2000-4000 samples.
  const latencyFrames = 8192
  const pad = new Float32Array(latencyFrames * channels)
  st.inputBuffer.putSamples(pad)
  st.process()
  
  const outFramesCount = st.outputBuffer.frameCount
  const finalInterleaved = new Float32Array(outFramesCount * channels)
  // @ts-ignore
  st.outputBuffer.receiveSamples(finalInterleaved, outFramesCount)
  
  // We only take the exact stretchedLength frames
  const outLength = Math.max(1, Math.min(stretchedLength, outFramesCount))
  const factoryCtx = new OfflineAudioContext(1, 1, sampleRate)
  const outBuffer = factoryCtx.createBuffer(channels, outLength, sampleRate)
  
  for (let c = 0; c < channels; c++) {
    const channelData = outBuffer.getChannelData(c)
    for (let i = 0; i < outLength; i++) {
      channelData[i] = finalInterleaved[i * channels + c]
    }
  }
  
  return outBuffer
}
