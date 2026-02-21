import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = 'https://jrcsgfzixtqsyfesyrju.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyY3NnZnppeHRxc3lmZXN5cmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MTQwNDIsImV4cCI6MjA4Njk5MDA0Mn0.4QZMbTg8D4m1hp8LqSazb_KF-ph60IaPqAn2LI-NkNc';

const CHUNK_SIZE = 1800; // safely under the 2048 byte limit

// Splits large values across multiple SecureStore keys
const ChunkedSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Check if value was stored in chunks
      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunkCount`);
      if (chunkCountStr) {
        const chunkCount = parseInt(chunkCountStr, 10);
        const chunks: string[] = [];
        for (let i = 0; i < chunkCount; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
          if (chunk === null) return null;
          chunks.push(chunk);
        }
        return chunks.join('');
      }
      // Fall back to single value
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Small enough — store directly, clean up any old chunks
        await SecureStore.setItemAsync(key, value);
        await SecureStore.deleteItemAsync(`${key}_chunkCount`);
      } else {
        // Split into chunks
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.slice(i, i + CHUNK_SIZE));
        }
        for (let i = 0; i < chunks.length; i++) {
          await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i]);
        }
        await SecureStore.setItemAsync(`${key}_chunkCount`, String(chunks.length));
        // Remove direct key if it existed before
        await SecureStore.deleteItemAsync(key);
      }
    } catch (e) {
      console.warn('SecureStore setItem error:', e);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunkCount`);
      if (chunkCountStr) {
        const chunkCount = parseInt(chunkCountStr, 10);
        for (let i = 0; i < chunkCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_chunkCount`);
      }
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.warn('SecureStore removeItem error:', e);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStoreAdapter as any,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});