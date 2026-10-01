import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl =
      this.configService.get<string>('SUPABASE_URL') || 'https://placeholder.supabase.co';
    const supabaseKey =
      this.configService.get<string>('SUPABASE_SECRET_KEY') ||
      this.configService.get<string>('SUPABASE_PUBLISHABLE_KEY') ||
      'placeholder-key';

    try {
      this.client = createClient(supabaseUrl, supabaseKey);
    } catch (error) {
      console.warn('Supabase client initialization warning:', (error as Error).message);
    }
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      const supabaseUrl =
        this.configService.get<string>('SUPABASE_URL') || 'https://placeholder.supabase.co';
      const supabaseKey =
        this.configService.get<string>('SUPABASE_SECRET_KEY') ||
        this.configService.get<string>('SUPABASE_PUBLISHABLE_KEY') ||
        'placeholder-key';
      this.client = createClient(supabaseUrl, supabaseKey);
    }
    return this.client;
  }
}
