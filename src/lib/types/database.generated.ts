export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agency_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          meta: Json | null
          read: boolean | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          meta?: Json | null
          read?: boolean | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          meta?: Json | null
          read?: boolean | null
          type?: string | null
        }
        Relationships: []
      }
      agency_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      atelier_app_users: {
        Row: {
          created_at: string
          crew_id: string | null
          display_name: string | null
          invited_at: string | null
          is_active: boolean
          last_seen_at: string | null
          role: string
          talent_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          crew_id?: string | null
          display_name?: string | null
          invited_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          role: string
          talent_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          crew_id?: string | null
          display_name?: string | null
          invited_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          role?: string
          talent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_app_users_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "atelier_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_app_users_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_approvals: {
        Row: {
          action_type: string
          agent: Database["public"]["Enums"]["atelier_agent_name"]
          booking_id: string | null
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          draft_content: Json
          id: string
          idempotency_key: string | null
          precedent_refs: string[] | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["atelier_approval_status"]
          summary: string
          uncertainty_sources: string[] | null
          updated_at: string
        }
        Insert: {
          action_type: string
          agent: Database["public"]["Enums"]["atelier_agent_name"]
          booking_id?: string | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          draft_content?: Json
          id?: string
          idempotency_key?: string | null
          precedent_refs?: string[] | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["atelier_approval_status"]
          summary: string
          uncertainty_sources?: string[] | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          agent?: Database["public"]["Enums"]["atelier_agent_name"]
          booking_id?: string | null
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          draft_content?: Json
          id?: string
          idempotency_key?: string | null
          precedent_refs?: string[] | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["atelier_approval_status"]
          summary?: string
          uncertainty_sources?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_approvals_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_approvals_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      atelier_booking_crew: {
        Row: {
          artist_paid_at: string | null
          assigned_dates: string[] | null
          assigned_dates_rate_overrides: Json
          booking_id: string
          confirmed_at: string | null
          created_at: string
          crew_id: string
          day_rate: number | null
          hold_expires_at: string | null
          id: string
          notes: string | null
          role_on_booking: string | null
          status: string | null
          talent_id: string | null
        }
        Insert: {
          artist_paid_at?: string | null
          assigned_dates?: string[] | null
          assigned_dates_rate_overrides?: Json
          booking_id: string
          confirmed_at?: string | null
          created_at?: string
          crew_id: string
          day_rate?: number | null
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          role_on_booking?: string | null
          status?: string | null
          talent_id?: string | null
        }
        Update: {
          artist_paid_at?: string | null
          assigned_dates?: string[] | null
          assigned_dates_rate_overrides?: Json
          booking_id?: string
          confirmed_at?: string | null
          created_at?: string
          crew_id?: string
          day_rate?: number | null
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          role_on_booking?: string | null
          status?: string | null
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_booking_crew_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_booking_crew_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_booking_crew_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "atelier_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_booking_crew_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_booking_schedules: {
        Row: {
          booking_id: string
          call_time: string | null
          created_at: string
          id: string
          location: string | null
          notes: string | null
          schedule_date: string
          wrap_time: string | null
        }
        Insert: {
          booking_id: string
          call_time?: string | null
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          schedule_date: string
          wrap_time?: string | null
        }
        Update: {
          booking_id?: string
          call_time?: string | null
          created_at?: string
          id?: string
          location?: string | null
          notes?: string | null
          schedule_date?: string
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_booking_schedules_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_booking_schedules_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_booking_talent: {
        Row: {
          artist_paid_at: string | null
          booking_id: string
          brief_acknowledged_at: string | null
          confirmed: boolean | null
          confirmed_at: string | null
          created_at: string
          day_rate: number | null
          half_day_rate: number | null
          hold_expires_at: string | null
          id: string
          notes: string | null
          rate_accepted: boolean
          rate_accepted_at: string | null
          role_on_booking: string | null
          status: string
          talent_id: string
          usage_fee: number | null
        }
        Insert: {
          artist_paid_at?: string | null
          booking_id: string
          brief_acknowledged_at?: string | null
          confirmed?: boolean | null
          confirmed_at?: string | null
          created_at?: string
          day_rate?: number | null
          half_day_rate?: number | null
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          rate_accepted?: boolean
          rate_accepted_at?: string | null
          role_on_booking?: string | null
          status?: string
          talent_id: string
          usage_fee?: number | null
        }
        Update: {
          artist_paid_at?: string | null
          booking_id?: string
          brief_acknowledged_at?: string | null
          confirmed?: boolean | null
          confirmed_at?: string | null
          created_at?: string
          day_rate?: number | null
          half_day_rate?: number | null
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          rate_accepted?: boolean
          rate_accepted_at?: string | null
          role_on_booking?: string | null
          status?: string
          talent_id?: string
          usage_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_booking_talent_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_booking_talent_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_booking_talent_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_bookings: {
        Row: {
          agency_notes: string | null
          archived_at: string | null
          booking_ref: string | null
          brand_id: string | null
          brief_raw_text: string | null
          budget_currency: string | null
          budget_indication: number | null
          calendar_event_id: string | null
          call_time: string | null
          campaign_id: string | null
          cancellation_fee: number | null
          cancellation_reason: string | null
          client_delivery_date: string | null
          client_id: string | null
          confirmation_deadline: string | null
          contacts: Json | null
          created_at: string
          created_by: string | null
          creative_agency_id: string | null
          deliverables_count: number | null
          deliverables_type: string | null
          drive_folder_ids: Json | null
          drive_root_id: string | null
          drive_root_link: string | null
          final_delivery_at: string | null
          grade_retouch_scope: string | null
          grand_total: number | null
          id: string
          invoice_issued_at: string | null
          is_archived: boolean
          job_number: string | null
          looks_per_talent: number | null
          ot_expenses_locked: boolean | null
          ot_expenses_window_end: string | null
          paid_at: string | null
          po_number: string | null
          post_production_ownership:
            | Database["public"]["Enums"]["atelier_post_production_ownership"]
            | null
          producer_email: string | null
          producer_name: string | null
          producer_phone: string | null
          quote_sent_at: string | null
          quote_token: string
          quote_token_expires_at: string | null
          quote_validity_days: number | null
          release_reason: string | null
          released_to: string | null
          retouch_note_format: string | null
          selects_cadence: string | null
          shoot_date_notes: string | null
          shoot_dates: unknown
          shoot_location: string | null
          source_gmail_message_id: string | null
          split_invoicing: Json | null
          state: Database["public"]["Enums"]["atelier_booking_state"]
          subtotal: number | null
          talent_count: number | null
          talent_spec: string | null
          tier: Database["public"]["Enums"]["atelier_shoot_tier"]
          title: string
          total_asf: number | null
          total_gst: number | null
          updated_at: string
          usage_duration_months: number | null
          usage_market: string | null
          usage_media:
            | Database["public"]["Enums"]["atelier_usage_media"][]
            | null
          usage_media_categories: string[] | null
          usage_notes: string | null
          usage_realm: string | null
          usage_specific_channels: string[] | null
          usage_territory:
            | Database["public"]["Enums"]["atelier_usage_territory"][]
            | null
          usage_territory_iso: string[] | null
          video_references: string | null
          wardrobe_responsibility: string | null
          wrap_time: string | null
        }
        Insert: {
          agency_notes?: string | null
          archived_at?: string | null
          booking_ref?: string | null
          brand_id?: string | null
          brief_raw_text?: string | null
          budget_currency?: string | null
          budget_indication?: number | null
          calendar_event_id?: string | null
          call_time?: string | null
          campaign_id?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          client_delivery_date?: string | null
          client_id?: string | null
          confirmation_deadline?: string | null
          contacts?: Json | null
          created_at?: string
          created_by?: string | null
          creative_agency_id?: string | null
          deliverables_count?: number | null
          deliverables_type?: string | null
          drive_folder_ids?: Json | null
          drive_root_id?: string | null
          drive_root_link?: string | null
          final_delivery_at?: string | null
          grade_retouch_scope?: string | null
          grand_total?: number | null
          id?: string
          invoice_issued_at?: string | null
          is_archived?: boolean
          job_number?: string | null
          looks_per_talent?: number | null
          ot_expenses_locked?: boolean | null
          ot_expenses_window_end?: string | null
          paid_at?: string | null
          po_number?: string | null
          post_production_ownership?:
            | Database["public"]["Enums"]["atelier_post_production_ownership"]
            | null
          producer_email?: string | null
          producer_name?: string | null
          producer_phone?: string | null
          quote_sent_at?: string | null
          quote_token?: string
          quote_token_expires_at?: string | null
          quote_validity_days?: number | null
          release_reason?: string | null
          released_to?: string | null
          retouch_note_format?: string | null
          selects_cadence?: string | null
          shoot_date_notes?: string | null
          shoot_dates?: unknown
          shoot_location?: string | null
          source_gmail_message_id?: string | null
          split_invoicing?: Json | null
          state?: Database["public"]["Enums"]["atelier_booking_state"]
          subtotal?: number | null
          talent_count?: number | null
          talent_spec?: string | null
          tier?: Database["public"]["Enums"]["atelier_shoot_tier"]
          title: string
          total_asf?: number | null
          total_gst?: number | null
          updated_at?: string
          usage_duration_months?: number | null
          usage_market?: string | null
          usage_media?:
            | Database["public"]["Enums"]["atelier_usage_media"][]
            | null
          usage_media_categories?: string[] | null
          usage_notes?: string | null
          usage_realm?: string | null
          usage_specific_channels?: string[] | null
          usage_territory?:
            | Database["public"]["Enums"]["atelier_usage_territory"][]
            | null
          usage_territory_iso?: string[] | null
          video_references?: string | null
          wardrobe_responsibility?: string | null
          wrap_time?: string | null
        }
        Update: {
          agency_notes?: string | null
          archived_at?: string | null
          booking_ref?: string | null
          brand_id?: string | null
          brief_raw_text?: string | null
          budget_currency?: string | null
          budget_indication?: number | null
          calendar_event_id?: string | null
          call_time?: string | null
          campaign_id?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          client_delivery_date?: string | null
          client_id?: string | null
          confirmation_deadline?: string | null
          contacts?: Json | null
          created_at?: string
          created_by?: string | null
          creative_agency_id?: string | null
          deliverables_count?: number | null
          deliverables_type?: string | null
          drive_folder_ids?: Json | null
          drive_root_id?: string | null
          drive_root_link?: string | null
          final_delivery_at?: string | null
          grade_retouch_scope?: string | null
          grand_total?: number | null
          id?: string
          invoice_issued_at?: string | null
          is_archived?: boolean
          job_number?: string | null
          looks_per_talent?: number | null
          ot_expenses_locked?: boolean | null
          ot_expenses_window_end?: string | null
          paid_at?: string | null
          po_number?: string | null
          post_production_ownership?:
            | Database["public"]["Enums"]["atelier_post_production_ownership"]
            | null
          producer_email?: string | null
          producer_name?: string | null
          producer_phone?: string | null
          quote_sent_at?: string | null
          quote_token?: string
          quote_token_expires_at?: string | null
          quote_validity_days?: number | null
          release_reason?: string | null
          released_to?: string | null
          retouch_note_format?: string | null
          selects_cadence?: string | null
          shoot_date_notes?: string | null
          shoot_dates?: unknown
          shoot_location?: string | null
          source_gmail_message_id?: string | null
          split_invoicing?: Json | null
          state?: Database["public"]["Enums"]["atelier_booking_state"]
          subtotal?: number | null
          talent_count?: number | null
          talent_spec?: string | null
          tier?: Database["public"]["Enums"]["atelier_shoot_tier"]
          title?: string
          total_asf?: number | null
          total_gst?: number | null
          updated_at?: string
          usage_duration_months?: number | null
          usage_market?: string | null
          usage_media?:
            | Database["public"]["Enums"]["atelier_usage_media"][]
            | null
          usage_media_categories?: string[] | null
          usage_notes?: string | null
          usage_realm?: string | null
          usage_specific_channels?: string[] | null
          usage_territory?:
            | Database["public"]["Enums"]["atelier_usage_territory"][]
            | null
          usage_territory_iso?: string[] | null
          video_references?: string | null
          wardrobe_responsibility?: string | null
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_bookings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "atelier_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_bookings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "atelier_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "atelier_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_bookings_creative_agency_id_fkey"
            columns: ["creative_agency_id"]
            isOneToOne: false
            referencedRelation: "atelier_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_brands: {
        Row: {
          created_at: string
          id: string
          industry: string | null
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      atelier_business_renewals: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_archived: boolean
          label: string
          notes: string | null
          reminder_queued_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_archived?: boolean
          label: string
          notes?: string | null
          reminder_queued_at?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_archived?: boolean
          label?: string
          notes?: string | null
          reminder_queued_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      atelier_campaigns: {
        Row: {
          brand_id: string | null
          client_id: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          season: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          brand_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          season?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          season?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "atelier_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "atelier_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_client_brands: {
        Row: {
          brand_id: string
          client_id: string
        }
        Insert: {
          brand_id: string
          client_id: string
        }
        Update: {
          brand_id?: string
          client_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_client_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "atelier_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_client_brands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "atelier_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_clients: {
        Row: {
          abn: string | null
          address: string | null
          avg_doi_days: number | null
          communication_style: string | null
          company: string | null
          contacts: Json
          created_at: string
          drive_folder_id: string | null
          drive_folder_link: string | null
          email: string | null
          id: string
          is_creative_agency: boolean
          name: string
          notes: string | null
          parent_company_id: string | null
          payment_terms_days: number | null
          phone: string | null
          preferred_comms: string | null
          updated_at: string
        }
        Insert: {
          abn?: string | null
          address?: string | null
          avg_doi_days?: number | null
          communication_style?: string | null
          company?: string | null
          contacts?: Json
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          email?: string | null
          id?: string
          is_creative_agency?: boolean
          name: string
          notes?: string | null
          parent_company_id?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          preferred_comms?: string | null
          updated_at?: string
        }
        Update: {
          abn?: string | null
          address?: string | null
          avg_doi_days?: number | null
          communication_style?: string | null
          company?: string | null
          contacts?: Json
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          email?: string | null
          id?: string
          is_creative_agency?: boolean
          name?: string
          notes?: string | null
          parent_company_id?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          preferred_comms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_clients_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "atelier_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_corpus_bookings: {
        Row: {
          client_hash: string | null
          created_at: string
          day_rate: number | null
          deliverable_count: number | null
          grand_total: number | null
          id: string
          outcome: string
          shoot_year_month: string | null
          source_booking_state: string | null
          talent_hash: string | null
          tier: string | null
          usage_duration_months: number | null
          usage_media: string[] | null
          usage_territory: string[] | null
        }
        Insert: {
          client_hash?: string | null
          created_at?: string
          day_rate?: number | null
          deliverable_count?: number | null
          grand_total?: number | null
          id?: string
          outcome: string
          shoot_year_month?: string | null
          source_booking_state?: string | null
          talent_hash?: string | null
          tier?: string | null
          usage_duration_months?: number | null
          usage_media?: string[] | null
          usage_territory?: string[] | null
        }
        Update: {
          client_hash?: string | null
          created_at?: string
          day_rate?: number | null
          deliverable_count?: number | null
          grand_total?: number | null
          id?: string
          outcome?: string
          shoot_year_month?: string | null
          source_booking_state?: string | null
          talent_hash?: string | null
          tier?: string | null
          usage_duration_months?: number | null
          usage_media?: string[] | null
          usage_territory?: string[] | null
        }
        Relationships: []
      }
      atelier_crew: {
        Row: {
          abn: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bsb: string | null
          bank_setup_in_xero: boolean | null
          certifications: string[] | null
          city: string | null
          created_at: string
          default_day_rate: number | null
          dietary: string | null
          dob: string | null
          drink_order: string | null
          drive_folder_id: string | null
          drive_folder_link: string | null
          email: string | null
          gst_registered: boolean | null
          home_address: string | null
          id: string
          is_active: boolean
          kit_list: string | null
          max_day_rate: number | null
          min_day_rate: number | null
          mobile: string | null
          name: string
          notes: string | null
          onboarding_completed: boolean | null
          onboarding_token: string | null
          onboarding_token_expires_at: string | null
          preferred_comms: string | null
          primary_role: string | null
          secondary_roles: string[] | null
          super_fund_name: string | null
          super_member_number: string | null
          super_usi: string | null
          tier: Database["public"]["Enums"]["atelier_crew_tier"]
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          abn?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          bank_setup_in_xero?: boolean | null
          certifications?: string[] | null
          city?: string | null
          created_at?: string
          default_day_rate?: number | null
          dietary?: string | null
          dob?: string | null
          drink_order?: string | null
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          email?: string | null
          gst_registered?: boolean | null
          home_address?: string | null
          id?: string
          is_active?: boolean
          kit_list?: string | null
          max_day_rate?: number | null
          min_day_rate?: number | null
          mobile?: string | null
          name: string
          notes?: string | null
          onboarding_completed?: boolean | null
          onboarding_token?: string | null
          onboarding_token_expires_at?: string | null
          preferred_comms?: string | null
          primary_role?: string | null
          secondary_roles?: string[] | null
          super_fund_name?: string | null
          super_member_number?: string | null
          super_usi?: string | null
          tier?: Database["public"]["Enums"]["atelier_crew_tier"]
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          abn?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          bank_setup_in_xero?: boolean | null
          certifications?: string[] | null
          city?: string | null
          created_at?: string
          default_day_rate?: number | null
          dietary?: string | null
          dob?: string | null
          drink_order?: string | null
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          email?: string | null
          gst_registered?: boolean | null
          home_address?: string | null
          id?: string
          is_active?: boolean
          kit_list?: string | null
          max_day_rate?: number | null
          min_day_rate?: number | null
          mobile?: string | null
          name?: string
          notes?: string | null
          onboarding_completed?: boolean | null
          onboarding_token?: string | null
          onboarding_token_expires_at?: string | null
          preferred_comms?: string | null
          primary_role?: string | null
          secondary_roles?: string[] | null
          super_fund_name?: string | null
          super_member_number?: string | null
          super_usi?: string | null
          tier?: Database["public"]["Enums"]["atelier_crew_tier"]
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: []
      }
      atelier_crew_unavailability: {
        Row: {
          created_at: string
          crew_id: string
          date_from: string
          date_to: string
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          crew_id: string
          date_from: string
          date_to: string
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string
          date_from?: string
          date_to?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_crew_unavailability_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "atelier_crew"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_dismissed_brief_candidates: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          from_header: string | null
          gmail_message_id: string
          received_at: string | null
          subject: string | null
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          from_header?: string | null
          gmail_message_id: string
          received_at?: string | null
          subject?: string | null
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          from_header?: string | null
          gmail_message_id?: string
          received_at?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      atelier_edms: {
        Row: {
          created_at: string
          gmail_draft_id: string | null
          id: string
          payload: Json
          preheader: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gmail_draft_id?: string | null
          id?: string
          payload?: Json
          preheader?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gmail_draft_id?: string | null
          id?: string
          payload?: Json
          preheader?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      atelier_error_log: {
        Row: {
          context: string | null
          id: string
          message: string
          metadata: Json | null
          occurred_at: string
          source: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          context?: string | null
          id?: string
          message: string
          metadata?: Json | null
          occurred_at?: string
          source: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          context?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          occurred_at?: string
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      atelier_events: {
        Row: {
          actor: string | null
          booking_id: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          payload: Json | null
        }
        Insert: {
          actor?: string | null
          booking_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
        }
        Update: {
          actor?: string | null
          booking_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_fee_lines: {
        Row: {
          asf_amount: number
          asf_rate: number
          booking_id: string
          commission_rate: number | null
          cost_subtotal: number | null
          created_at: string
          crew_id: string | null
          description: string
          id: string
          is_artist_reimbursement: boolean
          is_commissionable: boolean
          is_gst_exempt: boolean
          is_super_bearing: boolean
          line_type: Database["public"]["Enums"]["atelier_fee_line_type"]
          notes: string | null
          quantity: number
          quote_version_id: string
          sort_order: number | null
          subtotal: number
          super_rate_charged: number | null
          super_rate_paid: number | null
          talent_id: string | null
          unit_price: number
        }
        Insert: {
          asf_amount?: number
          asf_rate?: number
          booking_id: string
          commission_rate?: number | null
          cost_subtotal?: number | null
          created_at?: string
          crew_id?: string | null
          description: string
          id?: string
          is_artist_reimbursement?: boolean
          is_commissionable?: boolean
          is_gst_exempt?: boolean
          is_super_bearing?: boolean
          line_type: Database["public"]["Enums"]["atelier_fee_line_type"]
          notes?: string | null
          quantity?: number
          quote_version_id: string
          sort_order?: number | null
          subtotal?: number
          super_rate_charged?: number | null
          super_rate_paid?: number | null
          talent_id?: string | null
          unit_price?: number
        }
        Update: {
          asf_amount?: number
          asf_rate?: number
          booking_id?: string
          commission_rate?: number | null
          cost_subtotal?: number | null
          created_at?: string
          crew_id?: string | null
          description?: string
          id?: string
          is_artist_reimbursement?: boolean
          is_commissionable?: boolean
          is_gst_exempt?: boolean
          is_super_bearing?: boolean
          line_type?: Database["public"]["Enums"]["atelier_fee_line_type"]
          notes?: string | null
          quantity?: number
          quote_version_id?: string
          sort_order?: number | null
          subtotal?: number
          super_rate_charged?: number | null
          super_rate_paid?: number | null
          talent_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "atelier_fee_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_fee_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_fee_lines_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "atelier_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_fee_lines_quote_version_id_fkey"
            columns: ["quote_version_id"]
            isOneToOne: false
            referencedRelation: "atelier_quote_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_fee_lines_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_idempotency_keys: {
        Row: {
          action_type: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string
          key: string
          status: string
        }
        Insert: {
          action_type?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          key: string
          status?: string
        }
        Update: {
          action_type?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_idempotency_keys_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_idempotency_keys_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_kill_switch: {
        Row: {
          id: string
          is_active: boolean
          pause_outbound: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          pause_outbound?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          pause_outbound?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      atelier_llm_calls: {
        Row: {
          agent_name: string
          booking_id: string | null
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          duration_ms: number | null
          estimated_cost_usd: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          response_preview: string | null
          success: boolean
        }
        Insert: {
          agent_name: string
          booking_id?: string | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          duration_ms?: number | null
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          response_preview?: string | null
          success?: boolean
        }
        Update: {
          agent_name?: string
          booking_id?: string | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          duration_ms?: number | null
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          response_preview?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "atelier_llm_calls_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_llm_calls_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_locations: {
        Row: {
          access_notes: string | null
          address: string | null
          alias: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          drive_folder_id: string | null
          drive_folder_link: string | null
          facilities: string[] | null
          full_day_rate: number | null
          geocoded_address: string | null
          half_day_rate: number | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          max_capacity: number | null
          name: string
          notes: string | null
          parking_notes: string | null
          postcode: string | null
          rate_notes: string | null
          square_metres: number | null
          state: string
          studio_rooms: Json | null
          studio_type: string
          suburb: string | null
          tags: string[] | null
          updated_at: string
          website: string | null
          weekend_surcharge_pct: number | null
        }
        Insert: {
          access_notes?: string | null
          address?: string | null
          alias?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          facilities?: string[] | null
          full_day_rate?: number | null
          geocoded_address?: string | null
          half_day_rate?: number | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          max_capacity?: number | null
          name: string
          notes?: string | null
          parking_notes?: string | null
          postcode?: string | null
          rate_notes?: string | null
          square_metres?: number | null
          state?: string
          studio_rooms?: Json | null
          studio_type?: string
          suburb?: string | null
          tags?: string[] | null
          updated_at?: string
          website?: string | null
          weekend_surcharge_pct?: number | null
        }
        Update: {
          access_notes?: string | null
          address?: string | null
          alias?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          facilities?: string[] | null
          full_day_rate?: number | null
          geocoded_address?: string | null
          half_day_rate?: number | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          max_capacity?: number | null
          name?: string
          notes?: string | null
          parking_notes?: string | null
          postcode?: string | null
          rate_notes?: string | null
          square_metres?: number | null
          state?: string
          studio_rooms?: Json | null
          studio_type?: string
          suburb?: string | null
          tags?: string[] | null
          updated_at?: string
          website?: string | null
          weekend_surcharge_pct?: number | null
        }
        Relationships: []
      }
      atelier_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      atelier_quote_versions: {
        Row: {
          accepted_at: string | null
          booking_id: string
          created_at: string
          currency: string
          diff_from_previous: Json | null
          grand_total: number
          id: string
          notes: string | null
          sent_at: string | null
          status: string
          subtotal: number
          total_asf: number
          total_gst: number
          total_super: number
          version: number
        }
        Insert: {
          accepted_at?: string | null
          booking_id: string
          created_at?: string
          currency?: string
          diff_from_previous?: Json | null
          grand_total?: number
          id?: string
          notes?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          total_asf?: number
          total_gst?: number
          total_super?: number
          version?: number
        }
        Update: {
          accepted_at?: string | null
          booking_id?: string
          created_at?: string
          currency?: string
          diff_from_previous?: Json | null
          grand_total?: number
          id?: string
          notes?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          total_asf?: number
          total_gst?: number
          total_super?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "atelier_quote_versions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_quote_versions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_talent: {
        Row: {
          abn: string | null
          assigned_agent_user_id: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bsb: string | null
          bank_setup_in_xero: boolean | null
          city: string | null
          created_at: string
          default_day_rate: number | null
          dietary: string | null
          discipline: Database["public"]["Enums"]["atelier_artist_discipline"]
          dob: string | null
          drink_order: string | null
          drive_folder_id: string | null
          drive_folder_link: string | null
          drivers_licence_expiry: string | null
          email: string | null
          emergency_email: string | null
          emergency_mobile: string | null
          emergency_name: string | null
          emergency_relationship: string | null
          entity_type: string | null
          gst_registered: boolean | null
          home_address: string | null
          id: string
          instagram: string | null
          is_active: boolean
          legal_name: string
          max_day_rate: number | null
          min_day_rate: number | null
          mobile: string | null
          nicknames: string[]
          notes: string | null
          onboarding_completed: boolean | null
          onboarding_token: string | null
          onboarding_token_expires_at: string | null
          passport_expiry: string | null
          preferred_comms: string | null
          pronouns: string | null
          representation_status: string | null
          specialty: string | null
          super_fund_name: string | null
          super_member_number: string | null
          super_usi: string | null
          updated_at: string
          visa_expiry: string | null
          website: string | null
          work_rights: string | null
          working_name: string
          wwcc_expiry: string | null
          wwcc_number: string | null
          xero_contact_id: string | null
        }
        Insert: {
          abn?: string | null
          assigned_agent_user_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          bank_setup_in_xero?: boolean | null
          city?: string | null
          created_at?: string
          default_day_rate?: number | null
          dietary?: string | null
          discipline: Database["public"]["Enums"]["atelier_artist_discipline"]
          dob?: string | null
          drink_order?: string | null
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          drivers_licence_expiry?: string | null
          email?: string | null
          emergency_email?: string | null
          emergency_mobile?: string | null
          emergency_name?: string | null
          emergency_relationship?: string | null
          entity_type?: string | null
          gst_registered?: boolean | null
          home_address?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean
          legal_name: string
          max_day_rate?: number | null
          min_day_rate?: number | null
          mobile?: string | null
          nicknames?: string[]
          notes?: string | null
          onboarding_completed?: boolean | null
          onboarding_token?: string | null
          onboarding_token_expires_at?: string | null
          passport_expiry?: string | null
          preferred_comms?: string | null
          pronouns?: string | null
          representation_status?: string | null
          specialty?: string | null
          super_fund_name?: string | null
          super_member_number?: string | null
          super_usi?: string | null
          updated_at?: string
          visa_expiry?: string | null
          website?: string | null
          work_rights?: string | null
          working_name: string
          wwcc_expiry?: string | null
          wwcc_number?: string | null
          xero_contact_id?: string | null
        }
        Update: {
          abn?: string | null
          assigned_agent_user_id?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          bank_setup_in_xero?: boolean | null
          city?: string | null
          created_at?: string
          default_day_rate?: number | null
          dietary?: string | null
          discipline?: Database["public"]["Enums"]["atelier_artist_discipline"]
          dob?: string | null
          drink_order?: string | null
          drive_folder_id?: string | null
          drive_folder_link?: string | null
          drivers_licence_expiry?: string | null
          email?: string | null
          emergency_email?: string | null
          emergency_mobile?: string | null
          emergency_name?: string | null
          emergency_relationship?: string | null
          entity_type?: string | null
          gst_registered?: boolean | null
          home_address?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean
          legal_name?: string
          max_day_rate?: number | null
          min_day_rate?: number | null
          mobile?: string | null
          nicknames?: string[]
          notes?: string | null
          onboarding_completed?: boolean | null
          onboarding_token?: string | null
          onboarding_token_expires_at?: string | null
          passport_expiry?: string | null
          preferred_comms?: string | null
          pronouns?: string | null
          representation_status?: string | null
          specialty?: string | null
          super_fund_name?: string | null
          super_member_number?: string | null
          super_usi?: string | null
          updated_at?: string
          visa_expiry?: string | null
          website?: string | null
          work_rights?: string | null
          working_name?: string
          wwcc_expiry?: string | null
          wwcc_number?: string | null
          xero_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atelier_talent_assigned_agent_user_id_fkey"
            columns: ["assigned_agent_user_id"]
            isOneToOne: false
            referencedRelation: "atelier_app_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      atelier_talent_preferred_crew: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          notes: string | null
          role_hint: string | null
          sort_order: number
          talent_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          notes?: string | null
          role_hint?: string | null
          sort_order?: number
          talent_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          notes?: string | null
          role_hint?: string | null
          sort_order?: number
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_talent_preferred_crew_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "atelier_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_talent_preferred_crew_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_talent_unavailability: {
        Row: {
          created_at: string
          date_from: string
          date_to: string
          id: string
          reason: string | null
          talent_id: string
        }
        Insert: {
          created_at?: string
          date_from: string
          date_to: string
          id?: string
          reason?: string | null
          talent_id: string
        }
        Update: {
          created_at?: string
          date_from?: string
          date_to?: string
          id?: string
          reason?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_talent_unavailability_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_tasks: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          description: string | null
          due_at: string | null
          id: string
          talent_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          talent_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          talent_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atelier_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "atelier_app_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atelier_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "atelier_app_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atelier_tasks_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "atelier_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_tasks_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      atelier_usage_licences: {
        Row: {
          booking_id: string
          bur_multiplier: number | null
          created_at: string
          duration_months: number
          end_date: string | null
          fee: number
          id: string
          media: Database["public"]["Enums"]["atelier_usage_media"][]
          notes: string | null
          start_date: string | null
          talent_id: string | null
          territory: Database["public"]["Enums"]["atelier_usage_territory"][]
        }
        Insert: {
          booking_id: string
          bur_multiplier?: number | null
          created_at?: string
          duration_months: number
          end_date?: string | null
          fee?: number
          id?: string
          media: Database["public"]["Enums"]["atelier_usage_media"][]
          notes?: string | null
          start_date?: string | null
          talent_id?: string | null
          territory: Database["public"]["Enums"]["atelier_usage_territory"][]
        }
        Update: {
          booking_id?: string
          bur_multiplier?: number | null
          created_at?: string
          duration_months?: number
          end_date?: string | null
          fee?: number
          id?: string
          media?: Database["public"]["Enums"]["atelier_usage_media"][]
          notes?: string | null
          start_date?: string | null
          talent_id?: string | null
          territory?: Database["public"]["Enums"]["atelier_usage_territory"][]
        }
        Relationships: [
          {
            foreignKeyName: "atelier_usage_licences_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_usage_licences_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "atelier_bookings_portal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atelier_usage_licences_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "atelier_talent"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_bookouts: {
        Row: {
          created_at: string | null
          crew_id: string | null
          date: string
          id: string
        }
        Insert: {
          created_at?: string | null
          crew_id?: string | null
          date: string
          id?: string
        }
        Update: {
          created_at?: string | null
          crew_id?: string | null
          date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_bookouts_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_profiles: {
        Row: {
          abn: string | null
          created_at: string | null
          default_rate: string | null
          dietary: string | null
          drink_order: string | null
          emergency_contact: string | null
          id: string
          notes_internal: string | null
          persistent_notes: string | null
          photo_url: string | null
          rates: Json | null
          rating: number | null
          roles: string[] | null
          skills: string[] | null
          unavailable_dates: string[] | null
          user_id: string | null
        }
        Insert: {
          abn?: string | null
          created_at?: string | null
          default_rate?: string | null
          dietary?: string | null
          drink_order?: string | null
          emergency_contact?: string | null
          id?: string
          notes_internal?: string | null
          persistent_notes?: string | null
          photo_url?: string | null
          rates?: Json | null
          rating?: number | null
          roles?: string[] | null
          skills?: string[] | null
          unavailable_dates?: string[] | null
          user_id?: string | null
        }
        Update: {
          abn?: string | null
          created_at?: string | null
          default_rate?: string | null
          dietary?: string | null
          drink_order?: string | null
          emergency_contact?: string | null
          id?: string
          notes_internal?: string | null
          persistent_notes?: string | null
          photo_url?: string | null
          rates?: Json | null
          rating?: number | null
          roles?: string[] | null
          skills?: string[] | null
          unavailable_dates?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_project_notes: {
        Row: {
          crew_id: string | null
          id: string
          note: string | null
          project_id: string | null
          updated_at: string | null
        }
        Insert: {
          crew_id?: string | null
          id?: string
          note?: string | null
          project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          crew_id?: string | null
          id?: string
          note?: string | null
          project_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_project_notes_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_agency_only: boolean | null
          owner_id: string | null
          project_id: string | null
          type: string | null
          uploaded_by: string | null
          visible_to: string[] | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_agency_only?: boolean | null
          owner_id?: string | null
          project_id?: string | null
          type?: string | null
          uploaded_by?: string | null
          visible_to?: string[] | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_agency_only?: boolean | null
          owner_id?: string | null
          project_id?: string | null
          type?: string | null
          uploaded_by?: string | null
          visible_to?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          full_name: string
          id: string
          invited_by: string | null
          phone: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          full_name: string
          id?: string
          invited_by?: string | null
          phone: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          full_name?: string
          id?: string
          invited_by?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          project_id: string | null
          read: boolean | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          project_id?: string | null
          read?: boolean | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          project_id?: string | null
          read?: boolean | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_artists: {
        Row: {
          created_at: string | null
          id: string
          name: string
          order_index: number
          project_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          order_index?: number
          project_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          order_index?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_artists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_crew: {
        Row: {
          artist_id: string | null
          confirmed_at: string | null
          crew_id: string | null
          crew_note: string | null
          day_id: string | null
          id: string
          invoice_status: string | null
          project_id: string | null
          rate: string | null
          role_on_project: string | null
          status: string | null
          status_changed_at: string | null
        }
        Insert: {
          artist_id?: string | null
          confirmed_at?: string | null
          crew_id?: string | null
          crew_note?: string | null
          day_id?: string | null
          id?: string
          invoice_status?: string | null
          project_id?: string | null
          rate?: string | null
          role_on_project?: string | null
          status?: string | null
          status_changed_at?: string | null
        }
        Update: {
          artist_id?: string | null
          confirmed_at?: string | null
          crew_id?: string | null
          crew_note?: string | null
          day_id?: string | null
          id?: string
          invoice_status?: string | null
          project_id?: string | null
          rate?: string | null
          role_on_project?: string | null
          status?: string | null
          status_changed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_crew_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "project_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_crew_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_crew_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "project_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_crew_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_days: {
        Row: {
          call_time: string | null
          created_at: string | null
          date: string | null
          day_number: number
          id: string
          location: string | null
          notes: string | null
          project_id: string
          wrap_time: string | null
        }
        Insert: {
          call_time?: string | null
          created_at?: string | null
          date?: string | null
          day_number: number
          id?: string
          location?: string | null
          notes?: string | null
          project_id: string
          wrap_time?: string | null
        }
        Update: {
          call_time?: string | null
          created_at?: string | null
          date?: string | null
          day_number?: number
          id?: string
          location?: string | null
          notes?: string | null
          project_id?: string
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_days_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_status_log: {
        Row: {
          changed_at: string
          from_status: string | null
          id: string
          project_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          from_status?: string | null
          id?: string
          project_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          from_status?: string | null
          id?: string
          project_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_status_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_wall: {
        Row: {
          author_id: string | null
          created_at: string | null
          id: string
          is_agency_broadcast: boolean | null
          message: string
          pinned: boolean | null
          project_id: string | null
          read_by: string[] | null
          target_crew_id: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          is_agency_broadcast?: boolean | null
          message: string
          pinned?: boolean | null
          project_id?: string | null
          read_by?: string[] | null
          target_crew_id?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          id?: string
          is_agency_broadcast?: boolean | null
          message?: string
          pinned?: boolean | null
          project_id?: string | null
          read_by?: string[] | null
          target_crew_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_wall_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_wall_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_wall_target_crew_id_fkey"
            columns: ["target_crew_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          agency_notes: string | null
          artist: string | null
          budget: string | null
          call_time: string | null
          client: string | null
          created_at: string | null
          created_by: string | null
          id: string
          location: string | null
          notes_agency: string | null
          shoot_date: string | null
          status: string | null
          title: string
          updated_at: string | null
          wrap_time: string | null
        }
        Insert: {
          agency_notes?: string | null
          artist?: string | null
          budget?: string | null
          call_time?: string | null
          client?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          notes_agency?: string | null
          shoot_date?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          wrap_time?: string | null
        }
        Update: {
          agency_notes?: string | null
          artist?: string | null
          budget?: string | null
          call_time?: string | null
          client?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          notes_agency?: string | null
          shoot_date?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          actual_call: string | null
          actual_wrap: string | null
          agency_note: string | null
          created_at: string | null
          crew_id: string | null
          id: string
          notes: string | null
          project_crew_id: string | null
          project_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_call?: string | null
          actual_wrap?: string | null
          agency_note?: string | null
          created_at?: string | null
          crew_id?: string | null
          id?: string
          notes?: string | null
          project_crew_id?: string | null
          project_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_call?: string | null
          actual_wrap?: string | null
          agency_note?: string | null
          created_at?: string | null
          crew_id?: string | null
          id?: string
          notes?: string | null
          project_crew_id?: string | null
          project_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_project_crew_id_fkey"
            columns: ["project_crew_id"]
            isOneToOne: false
            referencedRelation: "project_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          avatar_url: string | null
          city: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          invite_accepted: boolean | null
          invite_sent: boolean | null
          last_seen: string | null
          phone: string
          role: string
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          invite_accepted?: boolean | null
          invite_sent?: boolean | null
          last_seen?: string | null
          phone: string
          role: string
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          invite_accepted?: boolean | null
          invite_sent?: boolean | null
          last_seen?: string | null
          phone?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      atelier_bookings_portal: {
        Row: {
          booking_ref: string | null
          deliverables_count: number | null
          deliverables_type: string | null
          id: string | null
          looks_per_talent: number | null
          post_production_ownership:
            | Database["public"]["Enums"]["atelier_post_production_ownership"]
            | null
          retouch_note_format: string | null
          shoot_date_notes: string | null
          shoot_dates: unknown
          shoot_location: string | null
          state: Database["public"]["Enums"]["atelier_booking_state"] | null
          tier: Database["public"]["Enums"]["atelier_shoot_tier"] | null
          title: string | null
          video_references: string | null
          wardrobe_responsibility: string | null
        }
        Insert: {
          booking_ref?: string | null
          deliverables_count?: number | null
          deliverables_type?: string | null
          id?: string | null
          looks_per_talent?: number | null
          post_production_ownership?:
            | Database["public"]["Enums"]["atelier_post_production_ownership"]
            | null
          retouch_note_format?: string | null
          shoot_date_notes?: string | null
          shoot_dates?: unknown
          shoot_location?: string | null
          state?: Database["public"]["Enums"]["atelier_booking_state"] | null
          tier?: Database["public"]["Enums"]["atelier_shoot_tier"] | null
          title?: string | null
          video_references?: string | null
          wardrobe_responsibility?: string | null
        }
        Update: {
          booking_ref?: string | null
          deliverables_count?: number | null
          deliverables_type?: string | null
          id?: string | null
          looks_per_talent?: number | null
          post_production_ownership?:
            | Database["public"]["Enums"]["atelier_post_production_ownership"]
            | null
          retouch_note_format?: string | null
          shoot_date_notes?: string | null
          shoot_dates?: unknown
          shoot_location?: string | null
          state?: Database["public"]["Enums"]["atelier_booking_state"] | null
          tier?: Database["public"]["Enums"]["atelier_shoot_tier"] | null
          title?: string | null
          video_references?: string | null
          wardrobe_responsibility?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      atelier_assign_booking_ref_if_null: {
        Args: { p_booking_id: string }
        Returns: string
      }
      current_app_role: { Args: never; Returns: string }
      current_crew_id: { Args: never; Returns: string }
      current_talent_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      get_booking_state_counts: {
        Args: never
        Returns: {
          count: number
          state: string
        }[]
      }
      get_report_summary_agg: {
        Args: never
        Returns: {
          avg_booking_value: number
          revenue_all_time: number
          revenue_last_month: number
          revenue_this_month: number
          revenue_this_year: number
          total_active: number
        }[]
      }
      is_owner_or_partner: { Args: never; Returns: boolean }
      is_signin_email_allowed: {
        Args: { email_input: string }
        Returns: boolean
      }
    }
    Enums: {
      atelier_agent_name:
        | "orchestrator"
        | "brief_intake"
        | "booking"
        | "comms"
        | "finance"
        | "client"
        | "marketing"
        | "security_audit"
      atelier_approval_status: "pending" | "approved" | "rejected" | "expired"
      atelier_artist_discipline:
        | "photographer"
        | "videographer"
        | "wardrobe_stylist"
        | "hair"
        | "makeup"
        | "hair_and_makeup"
        | "manicurist"
      atelier_booking_state:
        | "brief_received"
        | "brief_parsed"
        | "quote_drafted"
        | "quote_sent"
        | "artists_crew_held"
        | "quote_confirmed"
        | "pre_production"
        | "shoot_live"
        | "morning_after_check"
        | "post_production"
        | "final_delivery"
        | "invoice_issued"
        | "paid"
        | "released"
        | "cancelled"
        | "written_off"
      atelier_crew_tier: "preferred_core" | "regular_freelance" | "never_again"
      atelier_fee_line_type:
        | "artist_fee"
        | "usage_licence"
        | "file_management"
        | "retouching"
        | "crew_labour"
        | "crew_equipment"
        | "equipment_rental"
        | "studio_hire"
        | "travel"
        | "catering"
        | "wardrobe"
        | "props"
        | "casting"
        | "location_fee"
        | "permits"
        | "insurance"
        | "post_production"
        | "overtime"
        | "other_expense"
        | "artist_overtime"
        | "artist_travel"
        | "crew_overtime"
        | "crew_travel"
        | "expense"
      atelier_post_production_ownership:
        | "us_via_artist"
        | "us_via_post_team"
        | "client_in_house"
        | "client_outsourced"
      atelier_shoot_tier:
        | "campaign"
        | "content"
        | "lookbook_ecomm"
        | "arty_commission"
        | "editorial"
        | "pr_press"
        | "corporate"
        | "event"
        | "still_life"
        | "fashion_film"
        | "pre_production_only"
      atelier_usage_media:
        | "all_media"
        | "all_print"
        | "all_digital"
        | "ooh"
        | "press"
        | "brochures"
        | "packaging"
        | "pos"
        | "direct_mail"
        | "posters"
        | "collateral"
        | "pr_print"
        | "social_media"
        | "company_website"
        | "regional_website"
        | "internet_advertising"
        | "digital_posters"
        | "digital_direct_mail"
        | "mobile"
        | "intranet"
        | "pr_digital"
        | "tv"
        | "ambient"
        | "marketing_aids"
      atelier_usage_territory:
        | "worldwide"
        | "australia"
        | "oceania"
        | "usa"
        | "north_america"
        | "europe_all"
        | "europe_eu"
        | "europe_non_eu"
        | "uk"
        | "asia_incl_japan"
        | "asia_excl_japan"
        | "middle_east"
        | "africa"
        | "south_america"
        | "central_america"
        | "caribbean"
        | "nordics"
        | "latin_america"
        | "cee"
        | "mea"
        | "emea"
        | "uae"
        | "gcc"
        | "amet"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      atelier_agent_name: [
        "orchestrator",
        "brief_intake",
        "booking",
        "comms",
        "finance",
        "client",
        "marketing",
        "security_audit",
      ],
      atelier_approval_status: ["pending", "approved", "rejected", "expired"],
      atelier_artist_discipline: [
        "photographer",
        "videographer",
        "wardrobe_stylist",
        "hair",
        "makeup",
        "hair_and_makeup",
        "manicurist",
      ],
      atelier_booking_state: [
        "brief_received",
        "brief_parsed",
        "quote_drafted",
        "quote_sent",
        "artists_crew_held",
        "quote_confirmed",
        "pre_production",
        "shoot_live",
        "morning_after_check",
        "post_production",
        "final_delivery",
        "invoice_issued",
        "paid",
        "released",
        "cancelled",
        "written_off",
      ],
      atelier_crew_tier: ["preferred_core", "regular_freelance", "never_again"],
      atelier_fee_line_type: [
        "artist_fee",
        "usage_licence",
        "file_management",
        "retouching",
        "crew_labour",
        "crew_equipment",
        "equipment_rental",
        "studio_hire",
        "travel",
        "catering",
        "wardrobe",
        "props",
        "casting",
        "location_fee",
        "permits",
        "insurance",
        "post_production",
        "overtime",
        "other_expense",
        "artist_overtime",
        "artist_travel",
        "crew_overtime",
        "crew_travel",
        "expense",
      ],
      atelier_post_production_ownership: [
        "us_via_artist",
        "us_via_post_team",
        "client_in_house",
        "client_outsourced",
      ],
      atelier_shoot_tier: [
        "campaign",
        "content",
        "lookbook_ecomm",
        "arty_commission",
        "editorial",
        "pr_press",
        "corporate",
        "event",
        "still_life",
        "fashion_film",
        "pre_production_only",
      ],
      atelier_usage_media: [
        "all_media",
        "all_print",
        "all_digital",
        "ooh",
        "press",
        "brochures",
        "packaging",
        "pos",
        "direct_mail",
        "posters",
        "collateral",
        "pr_print",
        "social_media",
        "company_website",
        "regional_website",
        "internet_advertising",
        "digital_posters",
        "digital_direct_mail",
        "mobile",
        "intranet",
        "pr_digital",
        "tv",
        "ambient",
        "marketing_aids",
      ],
      atelier_usage_territory: [
        "worldwide",
        "australia",
        "oceania",
        "usa",
        "north_america",
        "europe_all",
        "europe_eu",
        "europe_non_eu",
        "uk",
        "asia_incl_japan",
        "asia_excl_japan",
        "middle_east",
        "africa",
        "south_america",
        "central_america",
        "caribbean",
        "nordics",
        "latin_america",
        "cee",
        "mea",
        "emea",
        "uae",
        "gcc",
        "amet",
      ],
    },
  },
} as const
