import { Buffer } from "buffer";

function rotateLeft(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

function sha1(input: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;

  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      words[i] = rotateLeft(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotateLeft(a, 5) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}

function hmacSha1Base64(key: string, message: string): string {
  let keyBytes = Uint8Array.from(Buffer.from(key, "utf8"));
  if (keyBytes.length > 64) {
    keyBytes = sha1(keyBytes);
  }

  const paddedKey = new Uint8Array(64);
  paddedKey.set(keyBytes);
  const inner = new Uint8Array(64);
  const outer = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    inner[i] = paddedKey[i] ^ 0x36;
    outer[i] = paddedKey[i] ^ 0x5c;
  }

  const messageBytes = Uint8Array.from(Buffer.from(message, "utf8"));
  const innerInput = new Uint8Array(inner.length + messageBytes.length);
  innerInput.set(inner);
  innerInput.set(messageBytes, inner.length);
  const innerHash = sha1(innerInput);

  const outerInput = new Uint8Array(outer.length + innerHash.length);
  outerInput.set(outer);
  outerInput.set(innerHash, outer.length);
  return Buffer.from(sha1(outerInput)).toString("base64");
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildAliyunCreateTokenUrl(input: {
  accessKeyId: string;
  accessKeySecret: string;
  now?: Date;
  nonce?: string;
}): string {
  const params: Record<string, string> = {
    AccessKeyId: input.accessKeyId,
    Action: "CreateToken",
    Format: "JSON",
    RegionId: "cn-shanghai",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: input.nonce ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
    SignatureVersion: "1.0",
    Timestamp: (input.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2019-02-28",
  };

  const canonicalizedQuery = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
    .join("&");
  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQuery)}`;
  const signature = hmacSha1Base64(`${input.accessKeySecret}&`, stringToSign);
  const signedParams: Record<string, string> = { ...params, Signature: signature };
  const query = Object.keys(signedParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(signedParams[key] ?? "")}`)
    .join("&");

  return `https://nls-meta.cn-shanghai.aliyuncs.com/?${query}`;
}

export const testInternals = {
  hmacSha1Base64,
};
