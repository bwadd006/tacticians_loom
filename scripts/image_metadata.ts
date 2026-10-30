export function inspectSourceImage(body: Buffer): { format: string; width: number; height: number } {
  if (body.length >= 24 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'png', width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  }
  if (body.length >= 30 && body.subarray(0, 4).toString() === 'RIFF' && body.subarray(8, 12).toString() === 'WEBP') {
    const tag = body.subarray(12, 16).toString();
    if (tag === 'VP8X') return { format: 'webp', width: body.readUIntLE(24, 3) + 1, height: body.readUIntLE(27, 3) + 1 };
    if (tag === 'VP8L') {
      const bits = body.readUInt32LE(21);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (tag === 'VP8 ') return { format: 'webp', width: body.readUInt16LE(26) & 0x3fff, height: body.readUInt16LE(28) & 0x3fff };
  }
  if (body.length >= 10 && body.subarray(0, 3).toString() === 'GIF') {
    return { format: 'gif', width: body.readUInt16LE(6), height: body.readUInt16LE(8) };
  }
  if (body[0] === 255 && body[1] === 216) {
    let offset = 2;
    while (offset + 9 < body.length) {
      if (body[offset] !== 255) break;
      const marker = body[offset + 1];
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        return { format: 'jpeg', width: body.readUInt16BE(offset + 7), height: body.readUInt16BE(offset + 5) };
      }
      const size = body.readUInt16BE(offset + 2);
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  throw new Error('Unrecognized or truncated image');
}
