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
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bench_underqualified_recruits: { Args: never; Returns: number }
      get_discovery_cache: {
        Args: { p_hours: number }
        Returns: {
          player_tag: string
        }[]
      }
      get_headhunter_context: { Args: never; Returns: Json }
      get_hot_zone_recruits: {
        Args: { p_limit: number }
        Returns: {
          player_tag: string
        }[]
      }
      get_ingestion_targets: { Args: never; Returns: Json }
      get_recruits_fate: {
        Args: { tags: string[] }
        Returns: {
          player_tag: string
          raw_potential_score: number
          status: string
        }[]
      }
      get_shadow_discovery_targets: {
        Args: { p_limit?: number }
        Returns: {
          opponent_player_tag: string
        }[]
      }
      get_stale_recruits: {
        Args: { p_limit?: number }
        Returns: {
          player_tag: string
        }[]
      }
      get_top_50_threshold: { Args: never; Returns: number }
      ingest_clan_profile: { Args: { p_payload: Json }; Returns: undefined }
      ingest_player_battles: {
        Args: { p_payload: Json; p_tag: string }
        Returns: undefined
      }
      ingest_raw_clan_members: {
        Args: { p_clan_tag: string; p_payload: Json }
        Returns: undefined
      }
      ingest_raw_clan_profile: {
        Args: { p_clan_tag: string; p_payload: Json }
        Returns: undefined
      }
      ingest_raw_river_race: {
        Args: { p_clan_tag: string; p_payload: Json }
        Returns: undefined
      }
      ingest_raw_war_log: {
        Args: { p_clan_tag: string; p_payload: Json }
        Returns: undefined
      }
      purge_recruits: { Args: { p_tags: string[] }; Returns: undefined }
      report_dead_recruit: {
        Args: { p_player_tag: string }
        Returns: undefined
      }
      report_discovery: {
        Args: { p_player_tag: string; p_type: string }
        Returns: undefined
      }
      report_heartbeat: {
        Args: {
          p_component_id: string
          p_message: string
          p_metadata?: Json
          p_status: string
        }
        Returns: undefined
      }
      report_telemetry: {
        Args: { p_event_type: string; p_metadata: Json; p_status: string }
        Returns: {
          id: string
        }[]
      }
      sync_players: { Args: { p_players: Json }; Returns: undefined }
      sync_recruits: { Args: { p_recruits: Json }; Returns: undefined }
      touch_recruits: { Args: { p_tags: string[] }; Returns: undefined }
      update_telemetry: {
        Args: { p_id: string; p_metadata: Json; p_status: string }
        Returns: undefined
      }
      upsert_discovery_cache: {
        Args: { p_tag: string; p_type: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
