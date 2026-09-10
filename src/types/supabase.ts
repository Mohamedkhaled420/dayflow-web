export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: { Row: { id: string; identity: Json; integrations: Json; chronobiology: Json; occupational_context: Json; psychology: Json; metabolism: Json; last_sync_timestamp: string | null; created_at: string }; Insert: { id: string; identity?: Json; integrations?: Json; chronobiology?: Json; occupational_context?: Json; psychology?: Json; metabolism?: Json; last_sync_timestamp?: string | null; created_at?: string }; Update: { id?: string; identity?: Json; integrations?: Json; chronobiology?: Json; occupational_context?: Json; psychology?: Json; metabolism?: Json; last_sync_timestamp?: string | null; created_at?: string }; Relationships: [] }
      habits: { Row: { id: string; user_id: string; name: string; icon: string | null; color: string | null; streak_count: number; is_archived: boolean; created_at: string }; Insert: { id?: string; user_id: string; name: string; icon?: string | null; color?: string | null; streak_count?: number; is_archived?: boolean; created_at?: string }; Update: { id?: string; user_id?: string; name?: string; icon?: string | null; color?: string | null; streak_count?: number; is_archived?: boolean; created_at?: string }; Relationships: [] }
      habit_logs: { Row: { id: string; habit_id: string; user_id: string; completed_at: string; note: string | null; created_at: string }; Insert: { id?: string; habit_id: string; user_id: string; completed_at: string; note?: string | null; created_at?: string }; Update: { id?: string; habit_id?: string; user_id?: string; completed_at?: string; note?: string | null; created_at?: string }; Relationships: [] }
      hydration_logs: { Row: { id: string; user_id: string; amount_ml: number; logged_at: string; created_at: string }; Insert: { id?: string; user_id: string; amount_ml: number; logged_at: string; created_at?: string }; Update: { id?: string; user_id?: string; amount_ml?: number; logged_at?: string; created_at?: string }; Relationships: [] }
      workout_logs: { Row: { id: string; user_id: string; type: string; duration_minutes: number | null; active_calories: number | null; logged_at: string; created_at: string }; Insert: { id?: string; user_id: string; type: string; duration_minutes?: number | null; active_calories?: number | null; logged_at: string; created_at?: string }; Update: { id?: string; user_id?: string; type?: string; duration_minutes?: number | null; active_calories?: number | null; logged_at?: string; created_at?: string }; Relationships: [] }
      sleep_logs: { Row: { id: string; user_id: string; sleep_minutes: number; resting_heart_rate: number | null; logged_at: string; created_at: string }; Insert: { id?: string; user_id: string; sleep_minutes: number; resting_heart_rate?: number | null; logged_at: string; created_at?: string }; Update: { id?: string; user_id?: string; sleep_minutes?: number; resting_heart_rate?: number | null; logged_at?: string; created_at?: string }; Relationships: [] }
      journal_entries: { Row: { id: string; user_id: string; content: string; mood_score: number | null; created_at: string }; Insert: { id?: string; user_id: string; content: string; mood_score?: number | null; created_at?: string }; Update: { id?: string; user_id?: string; content?: string; mood_score?: number | null; created_at?: string }; Relationships: [] }
      teams: { Row: { id: string; member_a: string; member_b: string; created_at: string }; Insert: { id?: string; member_a: string; member_b: string; created_at?: string }; Update: { id?: string; member_a?: string; member_b?: string; created_at?: string }; Relationships: [] }
      team_activities: { Row: { id: string; team_id: string; user_id: string; activity_type: string; payload: Json; timestamp: string; created_at: string }; Insert: { id?: string; team_id: string; user_id: string; activity_type: string; payload?: Json; timestamp?: string; created_at?: string }; Update: { id?: string; team_id?: string; user_id?: string; activity_type?: string; payload?: Json; timestamp?: string; created_at?: string }; Relationships: [] }
      team_invites: { Row: { id: string; team_id: string; inviter_id: string; invitee_email: string; status: string; created_at: string }; Insert: { id?: string; team_id: string; inviter_id: string; invitee_email: string; status?: string; created_at?: string }; Update: { id?: string; team_id?: string; inviter_id?: string; invitee_email?: string; status?: string; created_at?: string }; Relationships: [] }
    }
    Views: { [_ in never]: never }
    Functions: { accept_team_invite: { Args: { p_invite_id: string }; Returns: Database['public']['Tables']['teams']['Row'] }; initialize_profile: { Args: { p_user_id: string; p_timezone: string }; Returns: undefined } }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
export type CompositeTypes<T extends keyof PublicSchema['CompositeTypes']> = PublicSchema['CompositeTypes'][T]
