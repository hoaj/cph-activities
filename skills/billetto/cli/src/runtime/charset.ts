// Local fix for hoaj/site-cli-creator#108 (Starter code decoded every answer as UTF-8).
// Decodes an answer's bytes with the charset the server names: the content-type header first,
// then (for HTML, or no content type) a <meta> tag in the first 2048 bytes, else UTF-8.

const META = /<meta[^>]+?charset\s*=\s*["']?\s*([a-z0-9_:.-]+)/i;

function decoder(label: string): TextDecoder | null {
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  let label = contentType?.match(/charset\s*=\s*["']?\s*([^\s;"']+)/i)?.[1];
  if (!label && (!contentType || /html/i.test(contentType))) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    label = head.match(META)?.[1];
  }
  return (label && decoder(label)) ? decoder(label)!.decode(bytes) : new TextDecoder("utf-8").decode(bytes);
}
