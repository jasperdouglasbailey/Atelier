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
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          title: string;
          state: BookingState;
          tier: ShootTier;
          client_id?: string | null;
          shoot_date?: string | null;
          total_budget?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          title?: string;
          state?: BookingState;
          tier?: ShootTier;
          client_id?: string | null;
          shoot_date?: string | null;
          total_budget?: number | null;
        };
        Relationships: [];
      };
      talent: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          email: string | null;
          agency: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          email?: string | null;
          agency?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string;
          email?: string | null;
          agency?: string | null;
        };
        Relationships: [];
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
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          email?: string | null;
          role?: string | null;
          tier: CrewTier;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string;
          email?: string | null;
          role?: string | null;
          tier?: CrewTier;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          email: string | null;
          company: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          email?: string | null;
          company?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string;
          email?: string | null;
          company?: string | null;
        };
        Relationships: [];
      };
      kill_switch: {
        Row: {
          id: string;
          is_active: boolean;
          pause_outbound: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          pause_outbound?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          pause_outbound?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          created_at: string;
          user_id: string | null;
          action: string;
          table_name: string;
          record_id: string | null;
          old_value: Json | null;
          new_value: Json | null;
          ip_address: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          action: string;
          table_name: string;
          record_id?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          ip_address?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          action?: string;
          table_name?: string;
          record_id?: string | null;
          old_value?: Json | null;
          new_value?: Json | null;
          ip_address?: string | null;
        };
        Relationships: [];
      };
      llm_calls: {
        Row: {
          id: string;
          created_at: string;
          agent_name: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          estimated_cost_usd: number;
          booking_id: string | null;
          duration_ms: number | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          agent_name: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          estimated_cost_usd: number;
          booking_id?: string | null;
          duration_ms?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          agent_name?: string;
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          estimated_cost_usd?: number;
          booking_id?: string | null;
          duration_ms?: number | null;
        };
        Relationships: [];
      };
      idempotency_keys: {
        Row: {
          key: string;
          created_at: string;
          completed_at: string | null;
          status: 'processing' | 'completed' | 'failed';
          booking_id: string | null;
          action_type: string | null;
        };
        Insert: {
          key: string;
          created_at?: string;
          completed_at?: string | null;
          status?: 'processing' | 'completed' | 'failed';
          booking_id?: string | null;
          action_type?: string | null;
        };
        Update: {
          key?: string;
          created_at?: string;
          completed_at?: string | null;
          status?: 'processing' | 'completed' | 'failed';
          booking_id?: string | null;
          action_type?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          created_at: string;
          event_type: string;
          payload: Json | null;
          booking_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          event_type: string;
          payload?: Json | null;
          booking_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          event_type?: string;
          payload?: Json | null;
          booking_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
