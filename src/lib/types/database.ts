import type { BookingState, ShootTier, CrewTier } from '@/lib/utils/constants';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      bookings: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          title: string;
          state: BookingState;
          tier: ShootTier;
          client_id: string | null;
          shoot_date: string | null;
          total_budget: number | null;
        };
        Insert: Omit<Database['public']['Tables']['bookings']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>;
      };
      talent: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          email: string | null;
          agency: string | null;
        };
        Insert: Omit<Database['public']['Tables']['talent']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['talent']['Insert']>;
      };
      crew: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          email: string | null;
          role: string | null;
          tier: CrewTier;
        };
        Insert: Omit<Database['public']['Tables']['crew']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['crew']['Insert']>;
      };
      clients: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          email: string | null;
          company: string | null;
        };
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['clients']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
