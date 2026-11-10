import { stripCodeFences, ensureRenderCall, finalizeCode } from './generator';
import { withModelFallback } from './fallback';
import { readSseData, extractAnthropicDelta, extractGoogleDelta } from './stream';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callGoogleModel(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 16384 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }

  return (
    candidate?.content?.parts
      ?.map((part) => part.text)
      ?.join('') ?? ''
  );
}

async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  return withModelFallback(GOOGLE_MODELS, (model) => callGoogleModel(prompt, apiKey, model));
}

// 스트리밍 호출은 응답 헤더를 받은 시점(첫 청크 전)까지만 에러를 던진다.
// 상태 코드 에러 메시지 형식은 비스트리밍 호출과 같아야 503/429 매핑이 동작한다.
// signal이 abort되면 업스트림 요청도 함께 취소된다 (클라이언트 연결 종료 시 비용 낭비 방지).
async function* streamAnthropic(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  for await (const data of readSseData(response.body!)) {
    const text = extractAnthropicDelta(data);
    if (text) yield text;
  }
}

async function openGoogleStream(
  prompt: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 16384 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  return response;
}

// 모델 폴백은 스트림을 열기 전(첫 청크 전)까지만 가능하다.
async function* streamGoogle(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const response = await withModelFallback(GOOGLE_MODELS, (model) =>
    openGoogleStream(prompt, apiKey, model, signal),
  );

  for await (const data of readSseData(response.body!)) {
    const { text, truncated } = extractGoogleDelta(data);
    if (text) yield text;
    if (truncated) {
      throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
    }
  }
}

function toErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return Response.json(
      { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  if (message.includes('429')) {
    return Response.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  return Response.json({ error: message }, { status: 500, headers: CORS_HEADERS });
}

// 델타를 줄 단위 JSON(NDJSON)으로 흘려보내고, 마지막에 후처리된 최종 코드를 보낸다.
// 클라이언트가 연결을 끊으면(cancel) 업스트림 요청을 abort하고, 닫힌 스트림에는 더 쓰지 않는다.
function toNdjsonResponse(source: AsyncGenerator<string>, abort: AbortController): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        let text = '';
        for await (const delta of source) {
          text += delta;
          send({ type: 'delta', text: delta });
        }
        send({ type: 'done', code: finalizeCode(text) });
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate/stream') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        // 요청이 끊기면 업스트림 호출도 취소한다.
        const abort = new AbortController();
        req.signal.addEventListener('abort', () => abort.abort());

        const source =
          provider === 'google'
            ? streamGoogle(prompt, resolvedKey, abort.signal)
            : streamAnthropic(prompt, resolvedKey, abort.signal);

        // 첫 청크를 먼저 받아 연결/상태 코드 에러는 일반 JSON 에러 응답으로 돌려준다.
        const first = await source.next();
        async function* withFirst(): AsyncGenerator<string> {
          if (!first.done) yield first.value;
          yield* source;
        }

        return toNdjsonResponse(withFirst(), abort);
      } catch (err) {
        return toErrorResponse(err);
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const text =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey)
            : await callAnthropic(prompt, resolvedKey);

        const code = ensureRenderCall(stripCodeFences(text));

        return Response.json({ code }, { headers: CORS_HEADERS });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        if (message.includes('503')) {
          return Response.json(
            { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
            { status: 503, headers: CORS_HEADERS }
          );
        }

        if (message.includes('429')) {
          return Response.json(
            { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
            { status: 429, headers: CORS_HEADERS }
          );
        }

        return Response.json(
          { error: message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
