import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export const MAX_SPEECH_CHARS = 900;

/** How the voice should sound, for engines that take instructions. */
export const VOICE_STYLE =
  "You are Baron, a warm, witty Indian-English man who runs the numbers for a men's salon, talking to his bosses like a good friend. Sound completely human, never like a machine or a news reader: relaxed, conversational pace, natural breaths and small pauses, a bit of laughter in your voice when something is funny. Be genuinely pleased and upbeat with good news, deadpan or gently teasing with a joke, and calm and caring when there is a problem. Say rupee amounts the way people in India do.";

export type TtsProvider = 'openai' | 'elevenlabs';

/**
 * Turns text into a natural-sounding male voice with a neural text-to-speech service. Nothing is configured
 * by default: the app then falls back to the browser's own voice. Keys stay on the server.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger('Assistant');
  private readonly cache = new Map<string, { audio: Buffer; mime: string }>();

  constructor(private readonly config: ConfigService) {}

  /** Which service is set up, if any (TTS_PROVIDER, or whichever key is present). */
  get provider(): TtsProvider | null {
    const chosen = (this.config.get<string>('TTS_PROVIDER') ?? '').toLowerCase();
    if (chosen === 'openai' && this.config.get<string>('OPENAI_API_KEY')) return 'openai';
    if (chosen === 'elevenlabs' && this.config.get<string>('ELEVENLABS_API_KEY') && this.config.get<string>('ELEVENLABS_VOICE_ID')) return 'elevenlabs';
    if (chosen) return null;
    if (this.config.get<string>('ELEVENLABS_API_KEY') && this.config.get<string>('ELEVENLABS_VOICE_ID')) return 'elevenlabs';
    if (this.config.get<string>('OPENAI_API_KEY')) return 'openai';
    return null;
  }

  async speak(text: string): Promise<{ audio: Buffer; mime: string }> {
    const provider = this.provider;
    if (!provider) throw new ServiceUnavailableException('No neural voice is set up.');
    const input = text.replace(/\s+/g, ' ').trim().slice(0, MAX_SPEECH_CHARS);
    if (!input) throw new BadGatewayException('Nothing to say.');

    // The same sentence (like the greeting) is paid for once.
    const key = createHash('sha256').update(`${provider}\n${input}`).digest('hex');
    const hit = this.cache.get(key);
    if (hit) return hit;

    const audio = provider === 'openai' ? await this.openai(input) : await this.elevenlabs(input);
    this.cache.set(key, audio);
    if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value!);
    return audio;
  }

  private async post(label: string, url: string, headers: Record<string, string>, body: unknown): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      this.logger.warn(`Voice request failed: ${(e as Error).message}`);
      throw new BadGatewayException(`${label} could not be reached.`);
    }
    if (!res.ok) {
      // Say why (the provider's own explanation: a plan limit, a wrong voice id…). The key and the text are never included.
      let why = '';
      try {
        const j = (await res.json()) as { detail?: { message?: string } | string; error?: { message?: string }; message?: string };
        why = (typeof j.detail === 'string' ? j.detail : j.detail?.message) ?? j.error?.message ?? j.message ?? '';
      } catch {
        // no readable explanation
      }
      why = why.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
      this.logger.warn(`Voice service answered ${res.status}${why ? `: ${why}` : ''}`);
      throw new BadGatewayException(`${label} said ${res.status}${why ? `: ${why}` : ''}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async openai(input: string) {
    const base = this.config.get<string>('OPENAI_API_BASE') || 'https://api.openai.com';
    const audio = await this.post(
      'OpenAI',
      `${base}/v1/audio/speech`,
      { Authorization: `Bearer ${this.config.get<string>('OPENAI_API_KEY')}` },
      {
        model: this.config.get<string>('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts',
        voice: this.config.get<string>('TTS_VOICE') || 'ash',
        input,
        instructions: VOICE_STYLE,
        response_format: 'mp3',
      },
    );
    return { audio, mime: 'audio/mpeg' };
  }

  private async elevenlabs(input: string) {
    const base = this.config.get<string>('ELEVENLABS_API_BASE') || 'https://api.elevenlabs.io';
    const voice = encodeURIComponent(this.config.get<string>('ELEVENLABS_VOICE_ID')!);
    const model = this.config.get<string>('ELEVENLABS_MODEL') || 'eleven_multilingual_v2';
    // The newest models (v3 and later) pick their own delivery; the older ones take these expressiveness settings.
    const newest = /eleven_v[3-9]/.test(model);
    const audio = await this.post(
      'ElevenLabs',
      `${base}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      { 'xi-api-key': this.config.get<string>('ELEVENLABS_API_KEY')! },
      {
        text: input,
        model_id: model,
        ...(newest ? { language_code: 'en' } : { voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true } }),
      },
    );
    return { audio, mime: 'audio/mpeg' };
  }
}
