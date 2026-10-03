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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      dose_logs: {
        Row: {
          id: string
          medicine_id: string
          scheduled_at: string
          status: string
          taken_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          medicine_id: string
          scheduled_at: string
          status?: string
          taken_at?: string | null
          user_id?: string
        }
        Update: {
          id?: string
          medicine_id?: string
          scheduled_at?: string
          status?: string
          taken_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dose_logs_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          calories: number
          eaten_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          calories?: number
          eaten_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          calories?: number
          eaten_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      medicines: {
        Row: {
          created_at: string
          dosage: string | null
          end_date: string | null
          form: string | null
          id: string
          meal_relation: string | null
          name: string
          notes: string | null
          source: string | null
          specific_times: string[] | null
          start_date: string | null
          times_per_day: number | null
          total_stock: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          form?: string | null
          id?: string
          meal_relation?: string | null
          name: string
          notes?: string | null
          source?: string | null
          specific_times?: string[] | null
          start_date?: string | null
          times_per_day?: number | null
          total_stock?: number | null
          user_id?: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          form?: string | null
          id?: string
          meal_relation?: string | null
          name?: string
          notes?: string | null
          source?: string | null
          specific_times?: string[] | null
          start_date?: string | null
          times_per_day?: number | null
          total_stock?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          allergies: string[] | null
          bp_diastolic: number | null
          bp_systolic: number | null
          conditions: string[] | null
          created_at: string
          diet: string | null
          emergency_contacts: Json | null
          full_name: string | null
          gender: string | null
          goal: string | null
          height_cm: number | null
          hospital_number: string | null
          id: string
          insight: Json | null
          insight_at: string | null
          onboarding_complete: boolean
          sugar_fasting: number | null
          updated_at: string
          water_date: string | null
          water_ml: number | null
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          allergies?: string[] | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          conditions?: string[] | null
          created_at?: string
          diet?: string | null
          emergency_contacts?: Json | null
          full_name?: string | null
          gender?: string | null
          goal?: string | null
          height_cm?: number | null
          hospital_number?: string | null
          id: string
          insight?: Json | null
          insight_at?: string | null
          onboarding_complete?: boolean
          sugar_fasting?: number | null
          updated_at?: string
          water_date?: string | null
          water_ml?: number | null
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          allergies?: string[] | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          conditions?: string[] | null
          created_at?: string
          diet?: string | null
          emergency_contacts?: Json | null
          full_name?: string | null
          gender?: string | null
          goal?: string | null
          height_cm?: number | null
          hospital_number?: string | null
          id?: string
          insight?: Json | null
          insight_at?: string | null
          onboarding_complete?: boolean
          sugar_fasting?: number | null
          updated_at?: string
          water_date?: string | null
          water_ml?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      vitals: {
        Row: {
          bp_diastolic: number | null
          bp_systolic: number | null
          id: string
          recorded_at: string
          sugar: number | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          id?: string
          recorded_at?: string
          sugar?: number | null
          user_id?: string
          weight_kg?: number | null
        }
        Update: {
          bp_diastolic?: number | null
          bp_systolic?: number | null
          id?: string
          recorded_at?: string
          sugar?: number | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
