declare module 'heic-convert' {
  export interface HeicConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  export type HeicConvertResult = Buffer | Uint8Array | ArrayBuffer;

  export default function heicConvert(options: HeicConvertOptions): Promise<HeicConvertResult>;
}
