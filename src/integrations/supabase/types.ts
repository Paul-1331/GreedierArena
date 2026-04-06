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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
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
      arena_matches: {
        Row: {
          allow_unrated: boolean
          created_at: string
          current_question_index: number
          finished_at: string | null
          host_id: string
          id: string
          is_official: boolean
          join_cutoff_ratio: number
          max_players: number
          max_rating: number | null
          min_rating: number | null
          question_started_at: string | null
          quiz_id: string
          room_code: string
          scheduled_start_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["arena_match_status"]
        }
        Insert: {
          allow_unrated?: boolean
          created_at?: string
          current_question_index?: number
          finished_at?: string | null
          host_id: string
          id?: string
          is_official?: boolean
          join_cutoff_ratio?: number
          max_players?: number
          max_rating?: number | null
          min_rating?: number | null
          question_started_at?: string | null
          quiz_id: string
          room_code: string
          scheduled_start_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["arena_match_status"]
        }
        Update: {
          allow_unrated?: boolean
          created_at?: string
          current_question_index?: number
          finished_at?: string | null
          host_id?: string
          id?: string
          is_official?: boolean
          join_cutoff_ratio?: number
          max_players?: number
          max_rating?: number | null
          min_rating?: number | null
          question_started_at?: string | null
          quiz_id?: string
          room_code?: string
          scheduled_start_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["arena_match_status"]
        }
        Relationships: [
          {
            foreignKeyName: "arena_matches_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_participants: {
        Row: {
          answers: Json | null
          current_question_index: number
          finished_at: string | null
          id: string
          is_ready: boolean
          joined_at: string
          match_id: string
          player_phase: string
          question_started_at: string | null
          score: number
          total_time_ms: number
          user_id: string
        }
        Insert: {
          answers?: Json | null
          current_question_index?: number
          finished_at?: string | null
          id?: string
          is_ready?: boolean
          joined_at?: string
          match_id: string
          player_phase?: string
          question_started_at?: string | null
          score?: number
          total_time_ms?: number
          user_id: string
        }
        Update: {
          answers?: Json | null
          current_question_index?: number
          finished_at?: string | null
          id?: string
          is_ready?: boolean
          joined_at?: string
          match_id?: string
          player_phase?: string
          question_started_at?: string | null
          score?: number
          total_time_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "arena_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_ratings: {
        Row: {
          deviation: number
          id: string
          matches_played: number
          rating: number
          total_score: number
          updated_at: string
          user_id: string
          volatility: number
          wins: number
        }
        Insert: {
          deviation?: number
          id?: string
          matches_played?: number
          rating?: number
          total_score?: number
          updated_at?: string
          user_id: string
          volatility?: number
          wins?: number
        }
        Update: {
          deviation?: number
          id?: string
          matches_played?: number
          rating?: number
          total_score?: number
          updated_at?: string
          user_id?: string
          volatility?: number
          wins?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          name_changes_remaining: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          name_changes_remaining?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          name_changes_remaining?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json | null
          completed_at: string | null
          created_at: string
          id: string
          quiz_id: string
          score: number
          total_questions: number
          user_id: string
        }
        Insert: {
          answers?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: string
          quiz_id: string
          score?: number
          total_questions: number
          user_id: string
        }
        Update: {
          answers?: Json | null
          completed_at?: string | null
          created_at?: string
          id?: string
          quiz_id?: string
          score?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: Json
          created_at: string
          explanation: string | null
          id: string
          options: Json
          order_index: number
          question_text: string
          question_type: string
          quiz_id: string
        }
        Insert: {
          correct_answer: Json
          created_at?: string
          explanation?: string | null
          id?: string
          options: Json
          order_index?: number
          question_text: string
          question_type?: string
          quiz_id: string
        }
        Update: {
          correct_answer?: Json
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          order_index?: number
          question_text?: string
          question_type?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          category: string
          created_at: string
          creator_id: string
          description: string | null
          difficulty: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["quiz_status"]
          time_limit_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          creator_id: string
          description?: string | null
          difficulty?: string
          id?: string
          slug: string
          status?: Database["public"]["Enums"]["quiz_status"]
          time_limit_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          difficulty?: string
          id?: string
          slug?: string
          status?: Database["public"]["Enums"]["quiz_status"]
          time_limit_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_arena_host: { Args: { _match_id: string }; Returns: boolean }
      is_arena_participant: { Args: { _match_id: string }; Returns: boolean }
      process_due_wars: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      arena_match_status: "waiting" | "countdown" | "playing" | "finished"
      quiz_status: "draft" | "submitted" | "approved" | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      arena_match_status: ["waiting", "countdown", "playing", "finished"],
      quiz_status: ["draft", "submitted", "approved", "rejected"],
    },
  },
} as const
