'use client';
// apps/dashboard/components/web-call.tsx
//
// Browser-based demo call. Uses Vapi's Web SDK so the prospect can talk to
// "Maya" straight from the dashboard — same assistant, prompt, tools and
// webhooks as a real phone call, just over WebRTC instead of Twilio.
//
// The transcript here is rendered CLIENT-SIDE from the SDK's `message`
// events, so it works with no backend tunnel and no Twilio. When the backend
// IS publicly reachable, the same call also drives the webhook → /live → SSE
// pipeline automatically (nothing extra needed here).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Loader2,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import type VapiType from '@vapi-ai/web';

type Status = 'idle' | 'connecting' | 'active' | 'ended' | 'error';
interface Turn {
  role: 'assistant' | 'user';
  content: string;
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

export default function WebCall() {
  const vapiRef = useRef<VapiType | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  // Separate partials per role so Maya's in-flight text isn't overwritten by
  // the user's partial transcript (and vice versa).
  const [userPartial, setUserPartial] = useState<string>('');
  const [assistantPartial, setAssistantPartial] = useState<string>('');
  const assistantPartialRef = useRef('');
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tear the call down if the component unmounts mid-call.
  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
      vapiRef.current = null;
    };
  }, []);

  const setAssistantLive = useCallback((next: string) => {
    assistantPartialRef.current = next;
    setAssistantPartial(next);
  }, []);

  const flushAssistantPartial = useCallback(() => {
    const text = assistantPartialRef.current.trim();
    if (text) {
      setTurns((t) => {
        // Don't double-add if a `final` transcript event already appended it.
        const last = t[t.length - 1];
        if (last && last.role === 'assistant' && last.content === text) return t;
        return [...t, { role: 'assistant', content: text }];
      });
    }
    setAssistantLive('');
  }, [setAssistantLive]);

  const start = useCallback(async () => {
    if (!PUBLIC_KEY || !ASSISTANT_ID) return;
    setError(null);
    setTurns([]);
    setUserPartial('');
    setAssistantLive('');
    setStatus('connecting');

    try {
      // Imported dynamically: the SDK touches `window`, so keep it off the
      // server-render path.
      const { default: Vapi } = await import('@vapi-ai/web');
      const vapi = new Vapi(PUBLIC_KEY);
      vapiRef.current = vapi;

      vapi.on('call-start', () => setStatus('active'));
      vapi.on('call-end', () => {
        setStatus('ended');
        setAssistantSpeaking(false);
        flushAssistantPartial();
        setUserPartial('');
      });
      vapi.on('speech-start', () => setAssistantSpeaking(true));
      vapi.on('speech-end', () => {
        setAssistantSpeaking(false);
        // If we accumulated assistant text via voice-input / model-output
        // (configs that don't emit assistant transcript `final` events),
        // commit it as a finalized turn here.
        flushAssistantPartial();
      });

      vapi.on('message', (m: any) => {
        if (!m?.type) return;

        // Live assistant transcript (what Maya is actually saying via STT
        // re-transcription of her own TTS output). The most accurate source
        // when available.
        if (m.type === 'transcript') {
          const role: 'assistant' | 'user' =
            m.role === 'assistant' ? 'assistant' : 'user';
          const content: string = m.transcript ?? '';
          if (m.transcriptType === 'partial') {
            if (role === 'assistant') setAssistantLive(content);
            else setUserPartial(content);
          } else if (m.transcriptType === 'final') {
            if (role === 'assistant') setAssistantLive('');
            else setUserPartial('');
            if (content.trim()) setTurns((t) => [...t, { role, content }]);
          }
          return;
        }

        // Fallback 1: the text Vapi is feeding to TTS. This is what Maya is
        // about to say (or saying), word-accurate to her voice.
        if (m.type === 'voice-input') {
          const text =
            typeof m.input === 'string'
              ? m.input
              : typeof m.text === 'string'
                ? m.text
                : '';
          if (text) setAssistantLive(text);
          return;
        }

        // Fallback 2: streaming LLM output. Only used if neither assistant
        // transcripts nor voice-input are present.
        if (m.type === 'model-output') {
          const chunk =
            typeof m.output === 'string'
              ? m.output
              : typeof m.text === 'string'
                ? m.text
                : '';
          if (chunk) setAssistantLive(assistantPartialRef.current + chunk);
          return;
        }
      });

      vapi.on('error', (e: any) => {
        setError(
          typeof e?.message === 'string'
            ? e.message
            : 'Call error — check the Vapi public key, assistant ID, and mic permission.',
        );
        setStatus('error');
      });

      await vapi.start(ASSISTANT_ID);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start the call.');
      setStatus('error');
    }
  }, []);

  const stop = useCallback(() => {
    flushAssistantPartial();
    vapiRef.current?.stop();
    setStatus('ended');
  }, [flushAssistantPartial]);

  if (!PUBLIC_KEY || !ASSISTANT_ID) {
    return (
      <div className="p-4 md:p-8">
        <div className="glass-strong p-6">
          <div className="flex items-center gap-2 font-medium text-aura-ink">
            <AlertTriangle size={18} /> Web demo not configured
          </div>
          <p className="mt-2 text-sm text-aura-ink/80">
            Set <code className="rounded bg-white/15 px-1">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code>{' '}
            (Vapi &rarr; API Keys &rarr; <strong>Public</strong>) and{' '}
            <code className="rounded bg-white/15 px-1">NEXT_PUBLIC_VAPI_ASSISTANT_ID</code>{' '}
            (your deployed assistant ID) in the dashboard&rsquo;s environment, then reload.
          </p>
        </div>
      </div>
    );
  }

  const live = status === 'active' || status === 'connecting';
  // Prefer the in-flight partial over the last finalized turn so Maya's
  // current words appear in the UI as she speaks them.
  const lastAssistantTurn = [...turns]
    .reverse()
    .find((t) => t.role === 'assistant');
  const lastUserTurn = [...turns].reverse().find((t) => t.role === 'user');
  const latestAssistant: (Turn & { streaming?: boolean }) | null =
    assistantPartial
      ? { role: 'assistant', content: assistantPartial, streaming: true }
      : (lastAssistantTurn ?? null);
  const latestUser: (Turn & { streaming?: boolean }) | null = userPartial
    ? { role: 'user', content: userPartial, streaming: true }
    : (lastUserTurn ?? null);

  const statusCopy =
    status === 'idle'
      ? 'Tap the mic to start'
      : status === 'connecting'
        ? 'Connecting — allow microphone access…'
        : status === 'active'
          ? assistantSpeaking
            ? 'Maya is speaking, tap to interrupt'
            : 'AI is listening, tap to pause'
          : status === 'ended'
            ? 'Call ended — tap to start a new call'
            : (error ?? 'Error — tap to retry');

  const toggle = () => {
    if (live) stop();
    else start();
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] md:min-h-[calc(100vh-5rem)] flex-col px-4 pb-4 md:px-8 md:pb-8">
      {/* Orb stage */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
        <Orb status={status} speaking={assistantSpeaking} />
        <p className="text-sm text-white/85">{statusCopy}</p>

        {latestAssistant && (
          <div className="w-full max-w-md">
            <div
              className={`inline-block max-w-full rounded-2xl rounded-bl-md bg-gradient-to-br from-aura-rose to-aura-magenta px-4 py-3 text-sm text-white shadow-glass transition ${
                latestAssistant.streaming ? 'ring-1 ring-white/40' : ''
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/70">
                <span>Maya</span>
                {latestAssistant.streaming && <TypingDots />}
              </div>
              {latestAssistant.content}
            </div>
          </div>
        )}

        {status === 'error' && error && (
          <p className="max-w-md text-center text-sm text-rose-50">{error}</p>
        )}
      </div>

      {/* Bottom waveform card */}
      <div className="glass-strong relative overflow-hidden p-5 md:p-6">
        <Waveform active={live} speaking={assistantSpeaking} />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={live ? 'End call' : 'Start call'}
            className={`grid h-16 w-16 place-items-center rounded-full text-white shadow-orb transition active:scale-95 ${
              live
                ? 'bg-gradient-to-br from-rose-500 to-rose-700'
                : 'bg-gradient-to-br from-aura-blue to-aura-sky'
            }`}
          >
            {status === 'connecting' ? (
              <Loader2 size={22} className="animate-spin" />
            ) : live ? (
              <MicOff size={22} />
            ) : (
              <Mic size={22} />
            )}
          </button>

          {latestUser ? (
            <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-aura-ink">
              <span className="line-clamp-2">{latestUser.content}</span>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-aura-ink/90 hover:bg-white/25"
              >
                <Pencil size={12} /> edit
              </button>
            </div>
          ) : (
            <p className="text-xs text-aura-ink/70">
              Say hello — your words will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label="streaming"
    >
      <span className="h-1 w-1 animate-bounce rounded-full bg-white/80 [animation-delay:-0.3s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-white/80 [animation-delay:-0.15s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-white/80" />
    </span>
  );
}

function Orb({ status, speaking }: { status: Status; speaking: boolean }) {
  const isLive = status === 'active' || status === 'connecting';
  return (
    <div className="relative h-52 w-52 md:h-64 md:w-64">
      {/* Cast shadow on the imaginary floor below the sphere */}
      <div
        className="pointer-events-none absolute left-1/2 top-[92%] h-8 w-3/5 -translate-x-1/2 rounded-full bg-black/70 blur-2xl opacity-70"
        aria-hidden
      />

      {/* Outer ambient halo */}
      <div
        className={`pointer-events-none absolute -inset-8 rounded-full blur-3xl transition-opacity duration-700 ${
          isLive ? 'opacity-90' : 'opacity-55'
        }`}
        style={{
          background:
            'radial-gradient(circle, rgba(240,106,165,0.55) 0%, rgba(93,127,184,0.45) 55%, transparent 75%)',
        }}
        aria-hidden
      />

      {/* Sphere — every overlay clipped to a circle so the layering reads as
          one curved surface, not stacked disks. */}
      <div
        className={`relative h-full w-full overflow-hidden rounded-full shadow-orb ${
          isLive ? 'animate-orb-float' : ''
        }`}
        style={{
          background:
            // Pink-lit pole at top-left fading through magenta and plum into
            // an almost-black terminator at the bottom-right.
            'radial-gradient(circle at 30% 22%, #ffd9e8 0%, #f06aa5 14%, #a23770 36%, #4b2160 66%, #150a26 96%)',
        }}
      >
        {/* Tonal meridian — pink-to-blue iridescence swept around the sphere */}
        <div
          className="absolute inset-0 mix-blend-overlay opacity-85"
          style={{
            background:
              'conic-gradient(from 210deg at 50% 50%, rgba(240,106,165,0.75), rgba(61,93,153,0.65), rgba(122,165,214,0.55), rgba(240,106,165,0.75))',
          }}
          aria-hidden
        />

        {/* Striations — fine rings that catch the light. Two counter-rotating
            layers + a subtle dark band give a shimmer along the surface. */}
        <div
          className="absolute inset-0 mix-blend-overlay opacity-70 animate-orb-spin"
          style={{
            background:
              'repeating-conic-gradient(from 0deg at 50% 50%, transparent 0deg 4deg, rgba(255,255,255,0.16) 4deg 5deg, transparent 5deg 9deg)',
          }}
          aria-hidden
        />
        <div
          className="absolute inset-[6%] mix-blend-overlay opacity-45 animate-orb-spin-rev"
          style={{
            background:
              'repeating-conic-gradient(from 90deg at 50% 50%, transparent 0deg 7deg, rgba(10,5,20,0.25) 7deg 8deg, transparent 8deg 15deg)',
          }}
          aria-hidden
        />

        {/* Terminator — darken the unlit bottom-right hemisphere to suggest
            a single light source from the upper left. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 72% 80%, rgba(8,4,18,0.65) 0%, rgba(8,4,18,0.0) 55%)',
          }}
          aria-hidden
        />

        {/* Rim light — a thin bright crescent along the upper-left edge
            where the sphere catches the light. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 28% 25%, transparent 62%, rgba(255,225,236,0.28) 71%, transparent 79%)',
          }}
          aria-hidden
        />

        {/* Specular highlight — the bright fovea where the light actually
            hits the sphere. Soft, off-center, never quite white. */}
        <div
          className="absolute left-[14%] top-[12%] h-[36%] w-[36%] rounded-full blur-md"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,238,246,0.5) 35%, rgba(255,238,246,0) 70%)',
          }}
          aria-hidden
        />

        {/* Subtle inner shadow on the rim — keeps the silhouette crisp
            against the bright halo. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow:
              'inset 0 0 24px rgba(10,5,20,0.45), inset -6px -10px 28px rgba(10,5,20,0.35)',
          }}
          aria-hidden
        />
      </div>

      {/* Speaking ripple — outside the clipped sphere so it can grow past
          the silhouette as a halo pulse. */}
      {speaking && (
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-aura-pink/70" />
      )}
    </div>
  );
}

function Waveform({ active, speaking }: { active: boolean; speaking: boolean }) {
  // Six stacked sine paths. Stronger amplitude when the assistant is speaking
  // or the call is active; otherwise a calm baseline.
  const amp = speaking ? 16 : active ? 10 : 6;
  const lines = Array.from({ length: 6 });
  return (
    <svg
      viewBox="0 0 600 120"
      preserveAspectRatio="none"
      className="absolute inset-x-0 bottom-0 h-32 w-full opacity-90"
      aria-hidden
    >
      <defs>
        <linearGradient id="wave-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a8c6e2" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#e9a8c5" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7aa0c8" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {lines.map((_, i) => {
        const phase = i * 18;
        const y = 60 + (i - 3) * 4;
        const a = amp + i * 1.5;
        const d = `M0 ${y} ` +
          `C 80 ${y - a}, 160 ${y + a}, 240 ${y - a / 2} ` +
          `S 400 ${y + a}, 480 ${y - a / 2} ` +
          `S 600 ${y + a / 2}, 720 ${y - a}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="url(#wave-stroke)"
            strokeOpacity={0.35 + i * 0.08}
            strokeWidth={1}
            style={{
              transform: `translateX(${-phase}px)`,
              animation: active
                ? `wave-slow ${3 + i * 0.4}s ease-in-out infinite`
                : undefined,
            }}
          />
        );
      })}
    </svg>
  );
}
