/**
 * [INPUT]: 依赖 TypeScript ambient module declaration 与 Node/Web 二进制缓冲类型
 * [OUTPUT]: 为无内置声明的 heic-convert 补齐转换参数、结果和默认函数类型
 * [POS]: types 的第三方类型补丁，被 Discover infrastructure 媒体 adapter 编译期消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

declare module 'heic-convert' {
  export interface HeicConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  export type HeicConvertResult = Buffer | Uint8Array | ArrayBuffer;

  export default function heicConvert(options: HeicConvertOptions): Promise<HeicConvertResult>;
}
