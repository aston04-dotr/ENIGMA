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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      banned_users: {
        Row: {
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chats: {
        Row: {
          id: string
          user1: string | null
          user2: string | null
          buyer_id: string | null
          seller_id: string | null
          listing_id: string | null
          created_at: string
          last_message_at: string
          title: string | null
          is_group: boolean
          buyer_last_read_at: string | null
          seller_last_read_at: string | null
          pinned_message_id: string | null
        }
        Insert: {
          id?: string
          user1?: string | null
          user2?: string | null
          buyer_id?: string | null
          seller_id?: string | null
          listing_id?: string | null
          created_at?: string
          last_message_at?: string
          title?: string | null
          is_group?: boolean
          buyer_last_read_at?: string | null
          seller_last_read_at?: string | null
          pinned_message_id?: string | null
        }
        Update: {
          id?: string
          user1?: string | null
          user2?: string | null
          buyer_id?: string | null
          seller_id?: string | null
          listing_id?: string | null
          created_at?: string
          last_message_at?: string
          title?: string | null
          is_group?: boolean
          buyer_last_read_at?: string | null
          seller_last_read_at?: string | null
          pinned_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chats_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          id: string
          user_id: string
          title: string | null
          description: string | null
          price: number | null
          city: string | null
          category: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          description?: string | null
          price?: number | null
          city?: string | null
          category?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          description?: string | null
          price?: number | null
          city?: string | null
          category?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      images: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string | null
          sort_order: number | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id?: string | null
          sort_order?: number | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string | null
          sort_order?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_favorites: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          boosted_at: string | null
          boosted_until: string | null
          category: string | null
          city: string | null
          contact_phone: string | null
          created_at: string | null
          description: string | null
          id: string
          is_boosted: boolean | null
          is_partner_ad: boolean | null
          is_top: boolean | null
          is_vip: boolean | null
          price: number | null
          title: string | null
          top_until: string | null
          updated_at: string | null
          user_id: string | null
          view_count: number | null
          vip_until: string | null
        }
        Insert: {
          boosted_at?: string | null
          boosted_until?: string | null
          category?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_boosted?: boolean | null
          is_partner_ad?: boolean | null
          is_top?: boolean | null
          is_vip?: boolean | null
          price?: number | null
          title?: string | null
          top_until?: string | null
          updated_at?: string | null
          user_id?: string | null
          view_count?: number | null
          vip_until?: string | null
        }
        Update: {
          boosted_at?: string | null
          boosted_until?: string | null
          category?: string | null
          city?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_boosted?: boolean | null
          is_partner_ad?: boolean | null
          is_top?: boolean | null
          is_vip?: boolean | null
          price?: number | null
          title?: string | null
          top_until?: string | null
          updated_at?: string | null
          user_id?: string | null
          view_count?: number | null
          vip_until?: string | null
        }
        Relationships: []
      }
      messages: {
        /** Соответствует public.messages (без устаревшего recipient_id). */
        Row: {
          id: string
          chat_id: string
          sender_id: string
          text: string
          type: string
          created_at: string
          image_url: string | null
          voice_url: string | null
          reply_to: string | null
          edited_at: string | null
          deleted: boolean
          hidden_for_user_ids: string[]
          status: string
          delivered_at: string | null
          read_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          sender_id: string
          text?: string
          type?: string
          created_at?: string
          image_url?: string | null
          voice_url?: string | null
          reply_to?: string | null
          edited_at?: string | null
          deleted?: boolean
          hidden_for_user_ids?: string[]
          status?: string
          delivered_at?: string | null
          read_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          sender_id?: string
          text?: string
          type?: string
          created_at?: string
          image_url?: string | null
          voice_url?: string | null
          reply_to?: string | null
          edited_at?: string | null
          deleted?: boolean
          hidden_for_user_ids?: string[]
          status?: string
          delivered_at?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      online_users: {
        Row: {
          user_id: string
          last_seen: string
          visibility_state: string
          active_chat_id: string | null
        }
        Insert: {
          user_id: string
          last_seen?: string
          visibility_state?: string
          active_chat_id?: string | null
        }
        Update: {
          user_id?: string
          last_seen?: string
          visibility_state?: string
          active_chat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_users_active_chat_id_fkey"
            columns: ["active_chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          user_id: string
          token: string
          created_at: string
          provider: string
          subscription: Json | null
          user_agent: string | null
          last_seen_at: string
        }
        Insert: {
          user_id: string
          token: string
          created_at?: string
          provider?: string
          subscription?: Json | null
          user_agent?: string | null
          last_seen_at?: string
        }
        Update: {
          user_id?: string
          token?: string
          created_at?: string
          provider?: string
          subscription?: Json | null
          user_agent?: string | null
          last_seen_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          device_id: string | null
          email: string | null
          id: string
          name: string | null
          phone: string | null
          phone_updated_at: string | null
          trust_score: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          email?: string | null
          id: string
          name?: string | null
          phone?: string | null
          phone_updated_at?: string | null
          trust_score?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          phone_updated_at?: string | null
          trust_score?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_listing: { Args: { listing_id: string }; Returns: undefined }
      bytea_to_text: { Args: { data: string }; Returns: string }
      check_access_blocked: {
        Args: { p_device: string; p_email: string; p_phone: string }
        Returns: boolean
      }
      decrease_trust_score: {
        Args: { p_amount: number; p_user: string }
        Returns: undefined
      }
      delete_my_account: { Args: Record<string, never>; Returns: undefined }
      ensure_dm_chat_membership: {
        Args: { p_chat_id: string }
        Returns: undefined
      }
      get_or_create_direct_chat: {
        Args: { p_listing_id?: string | null; p_other_user_id: string }
        Returns: string
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_listing_views: { Args: { listing: string }; Returns: undefined }
      listing_favorites_count: {
        Args: { listing_id_input: string }
        Returns: number
      }
      listing_favorites_counts: {
        Args: { ids_input: string[] }
        Returns: {
          favorite_count: number
          listing_id: string
        }[]
      }
      list_my_chats: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          buyer_id: string
          seller_id: string
          created_at: string
        }[]
      }
      mark_chat_read: {
        Args: { p_chat_id: string; p_up_to_message_id?: string }
        Returns: undefined
      }
      report_listing_trust_penalty: {
        Args: { p_amount: number; p_user: string }
        Returns: undefined
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      try_daily_trust_recovery: { Args: never; Returns: undefined }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      verify_receipt: {
        Args: { platform: string; receipt_data: string; user_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
    Enums: {},
  },
} as const
