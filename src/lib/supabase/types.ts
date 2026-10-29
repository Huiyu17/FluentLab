export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_usage: {
        Row: {
          calls: number;
          day: string;
          user_id: string;
        };
        Insert: {
          calls?: number;
          day: string;
          user_id: string;
        };
        Update: {
          calls?: number;
          day?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_config: {
        Row: {
          ai_daily_limit: number;
          id: boolean;
        };
        Insert: {
          ai_daily_limit?: number;
          id?: boolean;
        };
        Update: {
          ai_daily_limit?: number;
          id?: boolean;
        };
        Relationships: [];
      };
      conversation_feedback: {
        Row: {
          confidence_score: number;
          conversation_id: string;
          created_at: string;
          fluency_score: number;
          grammar_score: number;
          id: string;
          model: string | null;
          naturalness_score: number;
          overall_label: string;
          strengths: string[];
          summary: string;
          user_id: string;
          vocabulary_score: number;
        };
        Insert: {
          confidence_score: number;
          conversation_id: string;
          created_at?: string;
          fluency_score: number;
          grammar_score: number;
          id?: string;
          model?: string | null;
          naturalness_score: number;
          overall_label: string;
          strengths?: string[];
          summary?: string;
          user_id: string;
          vocabulary_score: number;
        };
        Update: {
          confidence_score?: number;
          conversation_id?: string;
          created_at?: string;
          fluency_score?: number;
          grammar_score?: number;
          id?: string;
          model?: string | null;
          naturalness_score?: number;
          overall_label?: string;
          strengths?: string[];
          summary?: string;
          user_id?: string;
          vocabulary_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_feedback_conversation_id_user_id_fkey";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      conversation_targets: {
        Row: {
          conversation_id: string;
          created_at: string;
          gap_id: string | null;
          id: string;
          item_id: string | null;
          used_naturally: boolean | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          gap_id?: string | null;
          id?: string;
          item_id?: string | null;
          used_naturally?: boolean | null;
          user_id?: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          gap_id?: string | null;
          id?: string;
          item_id?: string | null;
          used_naturally?: boolean | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_targets_conversation_id_user_id_fkey";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "conversation_targets_gap_id_user_id_fkey";
            columns: ["gap_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "language_gaps";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "conversation_targets_item_id_user_id_fkey";
            columns: ["item_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "learning_items";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      conversations: {
        Row: {
          completed_at: string | null;
          ended_at: string | null;
          id: string;
          overall_score: number | null;
          review_attempts: number;
          review_error: string | null;
          review_started_at: string | null;
          scenario_id: string | null;
          scenario_snapshot: Json;
          started_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          ended_at?: string | null;
          id?: string;
          overall_score?: number | null;
          review_attempts?: number;
          review_error?: string | null;
          review_started_at?: string | null;
          scenario_id?: string | null;
          scenario_snapshot?: Json;
          started_at?: string;
          status?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          ended_at?: string | null;
          id?: string;
          overall_score?: number | null;
          review_attempts?: number;
          review_error?: string | null;
          review_started_at?: string | null;
          scenario_id?: string | null;
          scenario_snapshot?: Json;
          started_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_scenario_id_fkey";
            columns: ["scenario_id"];
            isOneToOne: false;
            referencedRelation: "scenarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      corrections: {
        Row: {
          category: string;
          conversation_id: string;
          created_at: string;
          explanation: string;
          id: string;
          improved: string;
          is_grammatical: boolean;
          message_id: string;
          original: string;
          position: number;
          saveable_expressions: Json;
          sub_category: string | null;
          user_id: string;
        };
        Insert: {
          category: string;
          conversation_id: string;
          created_at?: string;
          explanation?: string;
          id?: string;
          improved: string;
          is_grammatical: boolean;
          message_id: string;
          original: string;
          position: number;
          saveable_expressions?: Json;
          sub_category?: string | null;
          user_id: string;
        };
        Update: {
          category?: string;
          conversation_id?: string;
          created_at?: string;
          explanation?: string;
          id?: string;
          improved?: string;
          is_grammatical?: boolean;
          message_id?: string;
          original?: string;
          position?: number;
          saveable_expressions?: Json;
          sub_category?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "corrections_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "gap_categories";
            referencedColumns: ["category"];
          },
          {
            foreignKeyName: "corrections_category_sub_category_fkey";
            columns: ["category", "sub_category"];
            isOneToOne: false;
            referencedRelation: "gap_taxonomy";
            referencedColumns: ["category", "sub_category"];
          },
          {
            foreignKeyName: "corrections_conversation_id_user_id_fkey";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "corrections_message_id_conversation_id_fkey";
            columns: ["message_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id", "conversation_id"];
          },
        ];
      };
      curated_expressions: {
        Row: {
          created_at: string;
          details: Json;
          example: string;
          expression: string;
          frequency: number;
          id: string;
          meaning: string;
          register: string;
          slug: string;
          used_when: string;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          example?: string;
          expression: string;
          frequency?: number;
          id?: string;
          meaning: string;
          register?: string;
          slug: string;
          used_when?: string;
        };
        Update: {
          created_at?: string;
          details?: Json;
          example?: string;
          expression?: string;
          frequency?: number;
          id?: string;
          meaning?: string;
          register?: string;
          slug?: string;
          used_when?: string;
        };
        Relationships: [];
      };
      debriefs: {
        Row: {
          created_at: string;
          id: string;
          result: Json | null;
          scenario_id: string | null;
          situation: string;
          user_id: string;
          what_user_said: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          result?: Json | null;
          scenario_id?: string | null;
          situation: string;
          user_id?: string;
          what_user_said?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          result?: Json | null;
          scenario_id?: string | null;
          situation?: string;
          user_id?: string;
          what_user_said?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "debriefs_scenario_id_user_id_fkey";
            columns: ["scenario_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "scenarios";
            referencedColumns: ["id", "created_by"];
          },
          {
            foreignKeyName: "debriefs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      gap_categories: {
        Row: {
          category: string;
          label: string;
          score_dimension: string;
        };
        Insert: {
          category: string;
          label: string;
          score_dimension: string;
        };
        Update: {
          category?: string;
          label?: string;
          score_dimension?: string;
        };
        Relationships: [];
      };
      gap_taxonomy: {
        Row: {
          category: string;
          sub_category: string;
        };
        Insert: {
          category: string;
          sub_category: string;
        };
        Update: {
          category?: string;
          sub_category?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gap_taxonomy_category_fkey";
            columns: ["category"];
            isOneToOne: false;
            referencedRelation: "gap_categories";
            referencedColumns: ["category"];
          },
        ];
      };
      language_events: {
        Row: {
          category: string;
          confidence: number;
          context: string;
          conversation_id: string;
          created_at: string;
          event_type: string;
          gap_id: string | null;
          id: string;
          message_id: string;
          original: string;
          sub_category: string;
          suggestion: string | null;
          user_id: string;
        };
        Insert: {
          category: string;
          confidence: number;
          context?: string;
          conversation_id: string;
          created_at?: string;
          event_type: string;
          gap_id?: string | null;
          id?: string;
          message_id: string;
          original: string;
          sub_category: string;
          suggestion?: string | null;
          user_id: string;
        };
        Update: {
          category?: string;
          confidence?: number;
          context?: string;
          conversation_id?: string;
          created_at?: string;
          event_type?: string;
          gap_id?: string | null;
          id?: string;
          message_id?: string;
          original?: string;
          sub_category?: string;
          suggestion?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "language_events_category_sub_category_fkey";
            columns: ["category", "sub_category"];
            isOneToOne: false;
            referencedRelation: "gap_taxonomy";
            referencedColumns: ["category", "sub_category"];
          },
          {
            foreignKeyName: "language_events_conversation_id_user_id_fkey";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "language_events_gap_id_user_id_category_sub_category_fkey";
            columns: ["gap_id", "user_id", "category", "sub_category"];
            isOneToOne: false;
            referencedRelation: "language_gaps";
            referencedColumns: ["id", "user_id", "category", "sub_category"];
          },
          {
            foreignKeyName: "language_events_message_id_conversation_id_fkey";
            columns: ["message_id", "conversation_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id", "conversation_id"];
          },
        ];
      };
      language_gaps: {
        Row: {
          category: string;
          confidence: number;
          conversations_count: number;
          created_at: string;
          description: string;
          evidence_count: number;
          first_detected_at: string | null;
          id: string;
          last_detected_at: string | null;
          last_practiced_at: string | null;
          severity: string;
          status: string;
          status_changed_at: string;
          sub_category: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          confidence?: number;
          conversations_count?: number;
          created_at?: string;
          description?: string;
          evidence_count?: number;
          first_detected_at?: string | null;
          id?: string;
          last_detected_at?: string | null;
          last_practiced_at?: string | null;
          severity?: string;
          status?: string;
          status_changed_at?: string;
          sub_category: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          confidence?: number;
          conversations_count?: number;
          created_at?: string;
          description?: string;
          evidence_count?: number;
          first_detected_at?: string | null;
          id?: string;
          last_detected_at?: string | null;
          last_practiced_at?: string | null;
          severity?: string;
          status?: string;
          status_changed_at?: string;
          sub_category?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "language_gaps_category_sub_category_fkey";
            columns: ["category", "sub_category"];
            isOneToOne: false;
            referencedRelation: "gap_taxonomy";
            referencedColumns: ["category", "sub_category"];
          },
          {
            foreignKeyName: "language_gaps_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_items: {
        Row: {
          created_at: string;
          details: Json;
          ease: number;
          example: string | null;
          expression: string;
          id: string;
          interval_days: number;
          last_reviewed_at: string | null;
          mastery_score: number;
          meaning: string;
          native_meaning: string | null;
          next_review_at: string;
          review_count: number;
          source: string;
          source_conversation_id: string | null;
          source_correction_id: string | null;
          source_curated_id: string | null;
          source_debrief_id: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          ease?: number;
          example?: string | null;
          expression: string;
          id?: string;
          interval_days?: number;
          last_reviewed_at?: string | null;
          mastery_score?: number;
          meaning?: string;
          native_meaning?: string | null;
          next_review_at?: string;
          review_count?: number;
          source?: string;
          source_conversation_id?: string | null;
          source_correction_id?: string | null;
          source_curated_id?: string | null;
          source_debrief_id?: string | null;
          type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          details?: Json;
          ease?: number;
          example?: string | null;
          expression?: string;
          id?: string;
          interval_days?: number;
          last_reviewed_at?: string | null;
          mastery_score?: number;
          meaning?: string;
          native_meaning?: string | null;
          next_review_at?: string;
          review_count?: number;
          source?: string;
          source_conversation_id?: string | null;
          source_correction_id?: string | null;
          source_curated_id?: string | null;
          source_debrief_id?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learning_items_source_conversation_id_user_id_fkey";
            columns: ["source_conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "learning_items_source_correction_id_user_id_fkey";
            columns: ["source_correction_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "corrections";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "learning_items_source_curated_id_fkey";
            columns: ["source_curated_id"];
            isOneToOne: false;
            referencedRelation: "curated_expressions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learning_items_source_debrief_id_user_id_fkey";
            columns: ["source_debrief_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "debriefs";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "learning_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          role: string;
          seq: number;
          user_id: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          role: string;
          seq: number;
          user_id?: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
          seq?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_user_id_fkey";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          contexts: string[];
          created_at: string;
          daily_goal_minutes: number;
          display_name: string | null;
          english_level: string | null;
          id: string;
          learning_goal: string | null;
          native_language: string | null;
          onboarded_at: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          contexts?: string[];
          created_at?: string;
          daily_goal_minutes?: number;
          display_name?: string | null;
          english_level?: string | null;
          id: string;
          learning_goal?: string | null;
          native_language?: string | null;
          onboarded_at?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          contexts?: string[];
          created_at?: string;
          daily_goal_minutes?: number;
          display_name?: string | null;
          english_level?: string | null;
          id?: string;
          learning_goal?: string | null;
          native_language?: string | null;
          onboarded_at?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_logs: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          id: string;
          item_id: string;
          mode: string;
          rating: string;
          user_id: string;
        };
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          item_id: string;
          mode: string;
          rating: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string;
          mode?: string;
          rating?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_logs_conversation_id_user_id_fkey";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "review_logs_item_id_user_id_fkey";
            columns: ["item_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "learning_items";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      scenarios: {
        Row: {
          ai_personality: string;
          ai_role: string;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string;
          difficulty: string;
          est_minutes: number;
          goal: string;
          id: string;
          is_custom: boolean;
          opening_line: string | null;
          slug: string | null;
          system_prompt: string | null;
          title: string;
          updated_at: string;
          user_role: string;
        };
        Insert: {
          ai_personality?: string;
          ai_role: string;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          difficulty?: string;
          est_minutes?: number;
          goal?: string;
          id?: string;
          is_custom?: boolean;
          opening_line?: string | null;
          slug?: string | null;
          system_prompt?: string | null;
          title: string;
          updated_at?: string;
          user_role: string;
        };
        Update: {
          ai_personality?: string;
          ai_role?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          difficulty?: string;
          est_minutes?: number;
          goal?: string;
          id?: string;
          is_custom?: boolean;
          opening_line?: string | null;
          slug?: string | null;
          system_prompt?: string | null;
          title?: string;
          updated_at?: string;
          user_role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scenarios_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_ai_quota: {
        Args: never;
        Returns: {
          allowed: boolean;
          calls: number;
          daily_limit: number;
        }[];
      };
      record_item_review: {
        Args: {
          p_expected_review_count: number;
          p_item_id: string;
          p_mode: string;
          p_rating: string;
        };
        Returns: {
          applied: boolean;
          ease: number;
          interval_days: number;
          mastery_score: number;
          next_review_at: string;
          review_count: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
