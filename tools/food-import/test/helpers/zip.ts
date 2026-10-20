import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { crc32, createDeflateRaw } from 'node:zlib';

/**
 * Minimal streaming ZIP writer for tests: one deflated entry, data-descriptor form, no ZIP64 (entry < 4 GB).
 * Lets a test build a multi-megabyte archive without holding it in memory and without a zip binary.
 */
export async function writeZip(
  outPath: string,
  entryName: string,
  content: AsyncIterable<Buffer | string> | Iterable<Buffer | string>,
): Promise<void> {
  const out = createWriteStream(outPath);
  const write = async (buf: Buffer) => {
    if (!out.write(buf)) await once(out, 'drain');
  };

  const name = Buffer.from(entryName, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0808, 6); // bit 3 (data descriptor) + bit 11 (utf8 name)
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0x21, 12); // date 1980-01-01
  local.writeUInt16LE(name.length, 26);
  await write(Buffer.concat([local, name]));

  const deflate = createDeflateRaw();
  let crc = 0;
  let uncompressed = 0;
  let compressed = 0;
  const pump = (async () => {
    for await (const chunk of deflate) {
      compressed += (chunk as Buffer).length;
      await write(chunk as Buffer);
    }
  })();
  for await (const piece of content as AsyncIterable<Buffer | string>) {
    const buf = typeof piece === 'string' ? Buffer.from(piece, 'utf8') : piece;
    crc = crc32(buf, crc);
    uncompressed += buf.length;
    if (!deflate.write(buf)) await once(deflate, 'drain');
  }
  deflate.end();
  await pump;

  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc >>> 0, 4);
  descriptor.writeUInt32LE(compressed, 8);
  descriptor.writeUInt32LE(uncompressed, 12);
  await write(descriptor);

  const cdOffset = 30 + name.length + compressed + 16;
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0808, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc >>> 0, 16);
  central.writeUInt32LE(compressed, 20);
  central.writeUInt32LE(uncompressed, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // local header offset
  const cd = Buffer.concat([central, name]);
  await write(cd);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  await write(end);

  out.end();
  await once(out, 'close');
}
