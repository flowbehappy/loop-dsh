import { gzipSync } from "node:zlib";

export interface TarEntryInput {
  name: string;
  content?: Buffer;
  mode?: number;
  typeFlag?: string;
  linkName?: string;
}

function writeOctal(buf: Buffer, offset: number, length: number, value: number): void {
  const octal = value.toString(8).padStart(length - 1, "0");
  buf.write(octal, offset, length - 1, "ascii");
  buf[offset + length - 1] = 0;
}

export function buildTarGz(entries: TarEntryInput[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const data = entry.content ?? Buffer.alloc(0);
    const typeFlag = entry.typeFlag ?? "0";

    header.write(entry.name, 0, Math.min(100, Buffer.byteLength(entry.name)), "utf8");
    writeOctal(header, 100, 8, entry.mode ?? 0o755);
    writeOctal(header, 108, 8, 1000);
    writeOctal(header, 116, 8, 1000);
    writeOctal(header, 124, 12, typeFlag === "0" ? data.length : 0);
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    // Checksum field filled with spaces during calculation.
    header.fill(0x20, 148, 156);
    header[156] = typeFlag.charCodeAt(0);
    if (entry.linkName) {
      header.write(entry.linkName, 157, Math.min(100, Buffer.byteLength(entry.linkName)), "utf8");
    }
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");

    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += header[i]!;
    }
    const chksum = sum.toString(8).padStart(6, "0");
    header.write(chksum, 148, 6, "ascii");
    header[154] = 0;
    header[155] = 0x20;

    blocks.push(header);
    if (typeFlag === "0" && data.length > 0) {
      blocks.push(data);
      const remainder = data.length % 512;
      if (remainder !== 0) {
        blocks.push(Buffer.alloc(512 - remainder, 0));
      }
    }
  }

  // Two zero blocks mark EOF.
  blocks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(blocks));
}
