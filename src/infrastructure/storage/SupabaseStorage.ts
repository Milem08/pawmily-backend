import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { DomainError } from '../../domain/shared/DomainError';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

export class SupabaseStorage {
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new DomainError('Storage no configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)', 503);
    }
    if (!this.client) {
      this.client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { persistSession: false },
      });
    }
    return this.client;
  }

  assertMime(mimeType: string) {
    if (!ALLOWED_MIME.has(mimeType)) {
      throw new DomainError('Tipo de archivo no permitido', 400);
    }
  }

  assertSize(sizeBytes: number) {
    if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
      throw new DomainError('Archivo demasiado grande (máx 5MB)', 400);
    }
  }

  async createSignedUploadUrl(bucket: string, storageKey: string) {
    const client = this.getClient();
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(storageKey);
    if (error || !data) {
      throw new DomainError(error?.message || 'No se pudo crear URL de subida', 500);
    }
    return { path: data.path, token: data.token, signedUrl: data.signedUrl, bucket };
  }

  async createSignedReadUrl(bucket: string, storageKey: string, expiresIn = 3600) {
    const client = this.getClient();
    const { data, error } = await client.storage.from(bucket).createSignedUrl(storageKey, expiresIn);
    if (error || !data) {
      throw new DomainError(error?.message || 'No se pudo firmar URL', 500);
    }
    return data.signedUrl;
  }

  async uploadBuffer(bucket: string, storageKey: string, body: Buffer, mimeType: string) {
    const client = this.getClient();
    const { error } = await client.storage.from(bucket).upload(storageKey, body, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      throw new DomainError(error.message, 500);
    }
  }

  petBucket() {
    return env.supabaseStorageBucketPets;
  }

  clinicalBucket() {
    return env.supabaseStorageBucketClinical;
  }
}
