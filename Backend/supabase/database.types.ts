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
  drivers: {
    Tables: {
      clans: {
        Row: {
          badge_id: number | null
          clan_name: string
          clan_tag: string
          description: string | null
          id: number
          last_ingested_at: string
          member_count: number | null
          required_trophies: number | null
          snapshot_date: string | null
          type: string | null
          updated_at: string | null
          war_trophies: number | null
        }
        Insert: {
          badge_id?: number | null
          clan_name: string
          clan_tag: string
          description?: string | null
          id?: never
          last_ingested_at: string
          member_count?: number | null
          required_trophies?: number | null
          snapshot_date?: string | null
          type?: string | null
          updated_at?: string | null
          war_trophies?: number | null
        }
        Update: {
          badge_id?: number | null
          clan_name?: string
          clan_tag?: string
          description?: string | null
          id?: never
          last_ingested_at?: string
          member_count?: number | null
          required_trophies?: number | null
          snapshot_date?: string | null
          type?: string | null
          updated_at?: string | null
          war_trophies?: number | null
        }
        Relationships: []
      }
      heritage_ledger: {
        Row: {
          avg_fame: number | null
          last_seen_at: string | null
          max_pes: number | null
          metadata: Json | null
          player_name: string
          player_tag: string
          tenure_days: number | null
          updated_at: string | null
        }
        Insert: {
          avg_fame?: number | null
          last_seen_at?: string | null
          max_pes?: number | null
          metadata?: Json | null
          player_name: string
          player_tag: string
          tenure_days?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_fame?: number | null
          last_seen_at?: string | null
          max_pes?: number | null
          metadata?: Json | null
          player_name?: string
          player_tag?: string
          tenure_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      member_snapshots: {
        Row: {
          donations: number | null
          donations_received: number | null
          id: number
          last_seen: string | null
          player_tag: string | null
          snapshot_at: string | null
          snapshot_date: string | null
          trophies: number | null
        }
        Insert: {
          donations?: number | null
          donations_received?: number | null
          id?: number
          last_seen?: string | null
          player_tag?: string | null
          snapshot_at?: string | null
          snapshot_date?: string | null
          trophies?: number | null
        }
        Update: {
          donations?: number | null
          donations_received?: number | null
          id?: number
          last_seen?: string | null
          player_tag?: string | null
          snapshot_at?: string | null
          snapshot_date?: string | null
          trophies?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "member_snapshots_member_tag_fkey"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      members: {
        Row: {
          best_trophies: number | null
          card_count: number | null
          challenge_max_wins: number | null
          clan_cards_collected: number | null
          clan_rank: number | null
          decks_used_today: number | null
          decks_used_weekly: number | null
          donations: number | null
          donations_received: number | null
          elite_wild_cards: number | null
          exp_level: number | null
          id: number
          is_active: boolean | null
          joined_at: string | null
          last_ingested_at: string | null
          last_seen_at: string | null
          player_name: string | null
          player_tag: string
          role: string | null
          snapshot_date: string | null
          star_points: number | null
          total_donations: number | null
          trophies: number | null
          updated_at: string | null
          war_day_wins: number | null
          war_wins: number | null
          week_fame: number | null
        }
        Insert: {
          best_trophies?: number | null
          card_count?: number | null
          challenge_max_wins?: number | null
          clan_cards_collected?: number | null
          clan_rank?: number | null
          decks_used_today?: number | null
          decks_used_weekly?: number | null
          donations?: number | null
          donations_received?: number | null
          elite_wild_cards?: number | null
          exp_level?: number | null
          id?: never
          is_active?: boolean | null
          joined_at?: string | null
          last_ingested_at?: string | null
          last_seen_at?: string | null
          player_name?: string | null
          player_tag: string
          role?: string | null
          snapshot_date?: string | null
          star_points?: number | null
          total_donations?: number | null
          trophies?: number | null
          updated_at?: string | null
          war_day_wins?: number | null
          war_wins?: number | null
          week_fame?: number | null
        }
        Update: {
          best_trophies?: number | null
          card_count?: number | null
          challenge_max_wins?: number | null
          clan_cards_collected?: number | null
          clan_rank?: number | null
          decks_used_today?: number | null
          decks_used_weekly?: number | null
          donations?: number | null
          donations_received?: number | null
          elite_wild_cards?: number | null
          exp_level?: number | null
          id?: never
          is_active?: boolean | null
          joined_at?: string | null
          last_ingested_at?: string | null
          last_seen_at?: string | null
          player_name?: string | null
          player_tag?: string
          role?: string | null
          snapshot_date?: string | null
          star_points?: number | null
          total_donations?: number | null
          trophies?: number | null
          updated_at?: string | null
          war_day_wins?: number | null
          war_wins?: number | null
          week_fame?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_members_player"
            columns: ["player_tag"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      player_battles: {
        Row: {
          battle_time: string
          battle_type: string | null
          fame_earned: number | null
          id: number
          opponent_crowns: number | null
          opponent_player_name: string | null
          opponent_player_tag: string | null
          player_tag: string
          result: string | null
          team_crowns: number | null
          updated_at: string | null
          win_status: boolean | null
        }
        Insert: {
          battle_time: string
          battle_type?: string | null
          fame_earned?: number | null
          id?: never
          opponent_crowns?: number | null
          opponent_player_name?: string | null
          opponent_player_tag?: string | null
          player_tag: string
          result?: string | null
          team_crowns?: number | null
          updated_at?: string | null
          win_status?: boolean | null
        }
        Update: {
          battle_time?: string
          battle_type?: string | null
          fame_earned?: number | null
          id?: never
          opponent_crowns?: number | null
          opponent_player_name?: string | null
          opponent_player_tag?: string | null
          player_tag?: string
          result?: string | null
          team_crowns?: number | null
          updated_at?: string | null
          win_status?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_player_battles_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      players: {
        Row: {
          player_name: string | null
          player_tag: string
          updated_at: string | null
        }
        Insert: {
          player_name?: string | null
          player_tag: string
          updated_at?: string | null
        }
        Update: {
          player_name?: string | null
          player_tag?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      recruit_blacklist: {
        Row: {
          created_at: string | null
          expires_at: string | null
          player_name: string | null
          player_tag: string
          raw_potential_score: number | null
          reason: string
          snapshot: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          player_name?: string | null
          player_tag: string
          raw_potential_score?: number | null
          reason: string
          snapshot?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          player_name?: string | null
          player_tag?: string
          raw_potential_score?: number | null
          reason?: string
          snapshot?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recruit_buffer: {
        Row: {
          created_at: string | null
          event_type: string
          id: number
          metadata: Json | null
          player_tag: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: never
          metadata?: Json | null
          player_tag: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: never
          metadata?: Json | null
          player_tag?: string
        }
        Relationships: []
      }
      recruit_ledger: {
        Row: {
          created_at: string | null
          description: string | null
          event_type: Database["drivers"]["Enums"]["recruit_event_type"]
          id: number
          metadata: Json | null
          new_score: number | null
          old_score: number | null
          player_name: string | null
          player_tag: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_type: Database["drivers"]["Enums"]["recruit_event_type"]
          id?: never
          metadata?: Json | null
          new_score?: number | null
          old_score?: number | null
          player_name?: string | null
          player_tag: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_type?: Database["drivers"]["Enums"]["recruit_event_type"]
          id?: never
          metadata?: Json | null
          new_score?: number | null
          old_score?: number | null
          player_name?: string | null
          player_tag?: string
        }
        Relationships: []
      }
      recruits: {
        Row: {
          cards: number | null
          donations: number | null
          found_date: string | null
          last_scan: string | null
          player_name: string
          player_tag: string
          raw_potential_score: number | null
          source: string
          status: Database["drivers"]["Enums"]["recruit_status"] | null
          target_clan_tag: string | null
          trophies: number | null
          updated_at: string | null
          war_wins: number | null
        }
        Insert: {
          cards?: number | null
          donations?: number | null
          found_date?: string | null
          last_scan?: string | null
          player_name: string
          player_tag: string
          raw_potential_score?: number | null
          source: string
          status?: Database["drivers"]["Enums"]["recruit_status"] | null
          target_clan_tag?: string | null
          trophies?: number | null
          updated_at?: string | null
          war_wins?: number | null
        }
        Update: {
          cards?: number | null
          donations?: number | null
          found_date?: string | null
          last_scan?: string | null
          player_name?: string
          player_tag?: string
          raw_potential_score?: number | null
          source?: string
          status?: Database["drivers"]["Enums"]["recruit_status"] | null
          target_clan_tag?: string | null
          trophies?: number | null
          updated_at?: string | null
          war_wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_recruits_player"
            columns: ["player_tag"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      war_activity: {
        Row: {
          decks_used: number | null
          decks_used_today: number | null
          fame: number | null
          id: number
          player_name: string
          player_tag: string
          recorded_at: string | null
          section_index: number
          updated_at: string | null
          week_id: string
        }
        Insert: {
          decks_used?: number | null
          decks_used_today?: number | null
          fame?: number | null
          id?: never
          player_name: string
          player_tag: string
          recorded_at?: string | null
          section_index: number
          updated_at?: string | null
          week_id: string
        }
        Update: {
          decks_used?: number | null
          decks_used_today?: number | null
          fame?: number | null
          id?: never
          player_name?: string
          player_tag?: string
          recorded_at?: string | null
          section_index?: number
          updated_at?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_war_activity_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      war_history: {
        Row: {
          clan_points: number | null
          fame: number | null
          id: number
          player_name: string
          player_tag: string
          rank: number | null
          updated_at: string | null
          week_id: string
        }
        Insert: {
          clan_points?: number | null
          fame?: number | null
          id?: never
          player_name: string
          player_tag: string
          rank?: number | null
          updated_at?: string | null
          week_id: string
        }
        Update: {
          clan_points?: number | null
          fame?: number | null
          id?: never
          player_name?: string
          player_tag?: string
          rank?: number | null
          updated_at?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_war_history_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      war_opponents: {
        Row: {
          clan_name: string
          clan_tag: string
          fame: number | null
          participants_count: number | null
          rank: number | null
          river_race_id: string
          updated_at: string | null
        }
        Insert: {
          clan_name: string
          clan_tag: string
          fame?: number | null
          participants_count?: number | null
          rank?: number | null
          river_race_id: string
          updated_at?: string | null
        }
        Update: {
          clan_name?: string
          clan_tag?: string
          fame?: number | null
          participants_count?: number | null
          rank?: number | null
          river_race_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      recruits_view: {
        Row: {
          cards: number | null
          donations: number | null
          found_date: string | null
          last_scan: string | null
          name: string | null
          potential_score: number | null
          raw_potential_score: number | null
          source: string | null
          status: Database["drivers"]["Enums"]["recruit_status"] | null
          tag: string | null
          trophies: number | null
          war_wins: number | null
        }
        Insert: {
          cards?: number | null
          donations?: number | null
          found_date?: string | null
          last_scan?: string | null
          name?: string | null
          potential_score?: never
          raw_potential_score?: number | null
          source?: string | null
          status?: Database["drivers"]["Enums"]["recruit_status"] | null
          tag?: string | null
          trophies?: number | null
          war_wins?: number | null
        }
        Update: {
          cards?: number | null
          donations?: number | null
          found_date?: string | null
          last_scan?: string | null
          name?: string | null
          potential_score?: never
          raw_potential_score?: number | null
          source?: string | null
          status?: Database["drivers"]["Enums"]["recruit_status"] | null
          tag?: string | null
          trophies?: number | null
          war_wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_recruits_player"
            columns: ["tag"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["player_tag"]
          },
        ]
      }
    }
    Functions: {
      bench_underqualified_recruits: { Args: never; Returns: number }
      dismiss_recruit: {
        Args: { p_days_to_ban?: number; p_tag: string }
        Returns: undefined
      }
      purge_expired_blacklist: { Args: never; Returns: number }
    }
    Enums: {
      recruit_event_type:
        | "DISCOVERED"
        | "SCORE_THRESHOLD_HIT"
        | "ACTION_INVITED"
        | "ACTION_DISCARDED"
        | "JOINED_US"
        | "PROMOTED"
        | "BENCHED"
        | "ROTATED_OUT"
        | "ARCHIVED"
      recruit_status: "ACTIVE" | "QUEUE" | "ARCHIVED" | "INVITED" | "BENCHED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  features: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      governance_report: {
        Row: {
          component_id: string | null
          discovery_yield: number | null
          last_failure_at: string | null
          last_message: string | null
          last_success_at: string | null
          last_triggered_at: string | null
          status: Database["substrate"]["Enums"]["pipeline_status"] | null
        }
        Insert: {
          component_id?: string | null
          discovery_yield?: number | null
          last_failure_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          status?: Database["substrate"]["Enums"]["pipeline_status"] | null
        }
        Update: {
          component_id?: string | null
          discovery_yield?: number | null
          last_failure_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          status?: Database["substrate"]["Enums"]["pipeline_status"] | null
        }
        Relationships: []
      }
      headhunter_view: {
        Row: {
          donations: number | null
          found_date: string | null
          has_heritage_blessing: boolean | null
          heritage_status: string | null
          ingame_link: string | null
          last_seen_at: string | null
          longevity: number | null
          longevity_label: string | null
          player_name: string | null
          player_tag: string | null
          potential_score: number | null
          raw_potential_score: number | null
          royaleapi_link: string | null
          tier: string | null
          trophies: number | null
          war_wins: number | null
        }
        Relationships: []
      }
      roster_view: {
        Row: {
          decks_used_today: number | null
          decks_used_weekly: number | null
          donations: number | null
          exp_level: number | null
          ingame_link: string | null
          last_seen_at: string | null
          last_seen_label: string | null
          performance_score: number | null
          player_name: string | null
          player_tag: string | null
          raw_performance_score: number | null
          role: string | null
          royaleapi_link: string | null
          stability_index: number | null
          tenure_label: string | null
          trophies: number | null
          week_fame: number | null
        }
        Relationships: []
      }
      scoring_view: {
        Row: {
          avg_fame: number | null
          baseline_raw_score: number | null
          current_fame: number | null
          days_inactive: number | null
          decay_multiplier: number | null
          donations: number | null
          heritage_bonus: number | null
          joined_at: string | null
          last_seen_at: string | null
          loyalty_multiplier: number | null
          performance_score: number | null
          player_name: string | null
          player_tag: string | null
          raw_performance_score: number | null
          raw_potential_score: number | null
          recorded_weeks: number | null
          stability_index: number | null
          tenure_days: number | null
          trophies: number | null
          war_rate: number | null
          war_wins: number | null
        }
        Relationships: []
      }
      tactical_awareness_view: {
        Row: {
          decks_used_today: number | null
          player_name: string | null
          player_tag: string | null
          trophies: number | null
          war_status: string | null
          week_fame: number | null
        }
        Insert: {
          decks_used_today?: number | null
          player_name?: string | null
          player_tag?: string | null
          trophies?: number | null
          war_status?: never
          week_fame?: number | null
        }
        Update: {
          decks_used_today?: number | null
          player_name?: string | null
          player_tag?: string | null
          trophies?: number | null
          war_status?: never
          week_fame?: number | null
        }
        Relationships: []
      }
      war_activity_view: {
        Row: {
          current_decks: number | null
          fame: number | null
          player_name: string | null
          player_tag: string | null
          snapshot_at: string | null
          status: string | null
          total_decks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_war_activity_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "roster_view"
            referencedColumns: ["player_tag"]
          },
          {
            foreignKeyName: "fk_war_activity_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "scoring_view"
            referencedColumns: ["player_tag"]
          },
          {
            foreignKeyName: "fk_war_activity_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "tactical_awareness_view"
            referencedColumns: ["player_tag"]
          },
        ]
      }
      war_loyalty_view: {
        Row: {
          avg_fame_per_week: number | null
          peak_fame: number | null
          player_name: string | null
          player_tag: string | null
          total_career_fame: number | null
          weeks_tracked: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_war_history_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "roster_view"
            referencedColumns: ["player_tag"]
          },
          {
            foreignKeyName: "fk_war_history_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "scoring_view"
            referencedColumns: ["player_tag"]
          },
          {
            foreignKeyName: "fk_war_history_player"
            columns: ["player_tag"]
            isOneToOne: false
            referencedRelation: "tactical_awareness_view"
            referencedColumns: ["player_tag"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_headhunter_context: { Args: never; Returns: Json }
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
      ingest_clan_members: { Args: { p_payload: Json }; Returns: undefined }
      ingest_clan_profile: { Args: { p_payload: Json }; Returns: undefined }
      ingest_player_battles: {
        Args: { p_payload: Json; p_tag: string }
        Returns: undefined
      }
      ingest_river_race: { Args: { p_payload: Json }; Returns: undefined }
      ingest_war_log: { Args: { p_payload: Json }; Returns: undefined }
      maintenance_janitor: { Args: never; Returns: undefined }
      report_dead_recruit: {
        Args: { p_player_tag: string }
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
  substrate: {
    Tables: {
      config: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      discovery_anchors: {
        Row: {
          keyword: string
          last_scanned_at: string | null
          last_yield: number | null
          priority: number | null
          status: string | null
          total_scans: number | null
          total_yield: number | null
        }
        Insert: {
          keyword: string
          last_scanned_at?: string | null
          last_yield?: number | null
          priority?: number | null
          status?: string | null
          total_scans?: number | null
          total_yield?: number | null
        }
        Update: {
          keyword?: string
          last_scanned_at?: string | null
          last_yield?: number | null
          priority?: number | null
          status?: string | null
          total_scans?: number | null
          total_yield?: number | null
        }
        Relationships: []
      }
      discovery_cache: {
        Row: {
          player_tag: string
          scanned_at: string | null
          type: string
        }
        Insert: {
          player_tag: string
          scanned_at?: string | null
          type: string
        }
        Update: {
          player_tag?: string
          scanned_at?: string | null
          type?: string
        }
        Relationships: []
      }
      governance_telemetry: {
        Row: {
          created_at: string | null
          discovery_duplicates: number | null
          discovery_yield: number | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discovery_duplicates?: number | null
          discovery_yield?: number | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          status: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discovery_duplicates?: number | null
          discovery_yield?: number | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pipeline_heartbeat: {
        Row: {
          component_id: string
          discovery_yield: number | null
          is_data_perfect: boolean | null
          last_failure_at: string | null
          last_message: string | null
          last_success_at: string | null
          last_triggered_at: string | null
          last_validation_report: Json | null
          status: Database["substrate"]["Enums"]["pipeline_status"]
          updated_at: string | null
        }
        Insert: {
          component_id: string
          discovery_yield?: number | null
          is_data_perfect?: boolean | null
          last_failure_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          last_validation_report?: Json | null
          status: Database["substrate"]["Enums"]["pipeline_status"]
          updated_at?: string | null
        }
        Update: {
          component_id?: string
          discovery_yield?: number | null
          is_data_perfect?: boolean | null
          last_failure_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          last_validation_report?: Json | null
          status?: Database["substrate"]["Enums"]["pipeline_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      raw_clan_members: {
        Row: {
          clan_tag: string | null
          id: number
          ingested_at: string | null
          payload: Json
        }
        Insert: {
          clan_tag?: string | null
          id?: number
          ingested_at?: string | null
          payload: Json
        }
        Update: {
          clan_tag?: string | null
          id?: number
          ingested_at?: string | null
          payload?: Json
        }
        Relationships: []
      }
      raw_clan_profile: {
        Row: {
          id: number
          ingested_at: string | null
          payload: Json
        }
        Insert: {
          id?: number
          ingested_at?: string | null
          payload: Json
        }
        Update: {
          id?: number
          ingested_at?: string | null
          payload?: Json
        }
        Relationships: []
      }
      raw_river_race: {
        Row: {
          id: number
          ingested_at: string | null
          payload: Json
        }
        Insert: {
          id?: never
          ingested_at?: string | null
          payload: Json
        }
        Update: {
          id?: never
          ingested_at?: string | null
          payload?: Json
        }
        Relationships: []
      }
      raw_scout_logs: {
        Row: {
          id: number
          ingested_at: string | null
          payload: Json
          source: string
        }
        Insert: {
          id?: number
          ingested_at?: string | null
          payload: Json
          source: string
        }
        Update: {
          id?: number
          ingested_at?: string | null
          payload?: Json
          source?: string
        }
        Relationships: []
      }
      raw_war_log: {
        Row: {
          id: number
          ingested_at: string | null
          payload: Json
        }
        Insert: {
          id?: never
          ingested_at?: string | null
          payload: Json
        }
        Update: {
          id?: never
          ingested_at?: string | null
          payload?: Json
        }
        Relationships: []
      }
    }
    Views: {
      view_pipeline_health: {
        Row: {
          component_id: string | null
          discovery_yield: number | null
          is_data_perfect: boolean | null
          last_failure_at: string | null
          last_message: string | null
          last_success_at: string | null
          last_telemetry_id: string | null
          last_triggered_at: string | null
          last_verified_at: string | null
          status: Database["substrate"]["Enums"]["pipeline_status"] | null
        }
        Insert: {
          component_id?: string | null
          discovery_yield?: number | null
          is_data_perfect?: boolean | null
          last_failure_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          last_telemetry_id?: never
          last_triggered_at?: string | null
          last_verified_at?: never
          status?: Database["substrate"]["Enums"]["pipeline_status"] | null
        }
        Update: {
          component_id?: string | null
          discovery_yield?: number | null
          is_data_perfect?: boolean | null
          last_failure_at?: string | null
          last_message?: string | null
          last_success_at?: string | null
          last_telemetry_id?: never
          last_triggered_at?: string | null
          last_verified_at?: never
          status?: Database["substrate"]["Enums"]["pipeline_status"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      execute_nightly_maintenance: { Args: never; Returns: undefined }
      format_last_seen: { Args: { p_days: number }; Returns: string }
      format_longevity: { Args: { p_minutes: number }; Returns: string }
      format_tenure: { Args: { p_days: number }; Returns: string }
      get_active_discovery_anchors: {
        Args: { p_limit?: number }
        Returns: {
          keyword: string
        }[]
      }
      pipeline_watchdog: { Args: never; Returns: number }
      purge_clanned_recruits: { Args: never; Returns: number }
      purge_governance_telemetry: { Args: never; Returns: undefined }
      purge_raw_logs: {
        Args: { p_retention_hours?: number }
        Returns: undefined
      }
      purge_stale_discovery_cache: { Args: never; Returns: undefined }
      purge_stale_heritage: { Args: never; Returns: number }
      report_anchor_yield: {
        Args: { p_keyword: string; p_yield: number }
        Returns: undefined
      }
      rotate_recruits: { Args: never; Returns: undefined }
      verify_run_integrity: {
        Args: { p_telemetry_id: string }
        Returns: boolean
      }
    }
    Enums: {
      pipeline_status: "IDLE" | "RUNNING" | "COMPLETED" | "FAILED"
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
  drivers: {
    Enums: {
      recruit_event_type: [
        "DISCOVERED",
        "SCORE_THRESHOLD_HIT",
        "ACTION_INVITED",
        "ACTION_DISCARDED",
        "JOINED_US",
        "PROMOTED",
        "BENCHED",
        "ROTATED_OUT",
        "ARCHIVED",
      ],
      recruit_status: ["ACTIVE", "QUEUE", "ARCHIVED", "INVITED", "BENCHED"],
    },
  },
  features: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  substrate: {
    Enums: {
      pipeline_status: ["IDLE", "RUNNING", "COMPLETED", "FAILED"],
    },
  },
} as const
