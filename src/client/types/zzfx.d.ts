declare module 'zzfx' {
  export const ZZFX: {
    volume: number;
    audioContext: AudioContext;
    buildSamples(...params: number[]): number[];
    playSamples(
      channels: number[][],
      volumeScale?: number,
      rate?: number,
      pan?: number,
    ): AudioBufferSourceNode;
  };
}
