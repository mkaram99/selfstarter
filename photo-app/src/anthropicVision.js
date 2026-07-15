const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const DESCRIBE_PROMPT = `Describe this photo for a personal photo search index. In 2-3 sentences, plainly \
list what's in it: notable objects, setting/location type, colors, activity, and any visible text. Do not \
speculate about people's identities. Be concrete and use words someone might actually search for.`;

async function describeImage({ apiKey, model, base64, mediaType = 'image/jpeg' }) {
  if (!apiKey) throw new Error('No Anthropic API key configured');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: DESCRIBE_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.content?.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('Anthropic API returned no description text');
  return text.trim();
}

module.exports = { describeImage };
