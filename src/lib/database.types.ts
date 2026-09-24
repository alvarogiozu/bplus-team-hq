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
      achievements_unlocked: {
        Row: {
          achievement_id: string
          created_at: string
          id: string
          space_id: string
          unlocked_at: string
          updated_at: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          id?: string
          space_id: string
          unlocked_at?: string
          updated_at?: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          id?: string
          space_id?: string
          unlocked_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_unlocked_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          entity_id: string | null
          entity_type: string
          id: string
          space_id: string
          summary: string
          updated_at: string
          verb: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          space_id: string
          summary: string
          updated_at?: string
          verb: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          space_id?: string
          summary?: string
          updated_at?: string
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_agent_usage: {
        Row: {
          count: number
          hour: string
          user_id: string
        }
        Insert: {
          count?: number
          hour: string
          user_id: string
        }
        Update: {
          count?: number
          hour?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_agent_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_calendars: {
        Row: {
          color: string
          created_at: string
          hidden: boolean
          icon: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          hidden?: boolean
          icon?: string
          id?: string
          name: string
          position?: number
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          hidden?: boolean
          icon?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_calendars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_google: {
        Row: {
          connected_at: string
          email: string | null
          refresh_token: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          email?: string | null
          refresh_token: string
          user_id: string
        }
        Update: {
          connected_at?: string
          email?: string | null
          refresh_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_google_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_items: {
        Row: {
          calendar_id: string | null
          color: string
          created_at: string
          day: string | null
          done_at: string | null
          duration_min: number
          hq_task_id: string | null
          icon: string
          id: string
          notes: string
          position: number
          start_min: number | null
          subtasks: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          color?: string
          created_at?: string
          day?: string | null
          done_at?: string | null
          duration_min?: number
          hq_task_id?: string | null
          icon?: string
          id?: string
          notes?: string
          position?: number
          start_min?: number | null
          subtasks?: Json
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          calendar_id?: string | null
          color?: string
          created_at?: string
          day?: string | null
          done_at?: string | null
          duration_min?: number
          hq_task_id?: string | null
          icon?: string
          id?: string
          notes?: string
          position?: number
          start_min?: number | null
          subtasks?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_items_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "agenda_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_items_hq_task_id_fkey"
            columns: ["hq_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_prefs: {
        Row: {
          created_at: string
          default_duration: number
          google_hidden: string[]
          hide_team: boolean
          onboarded_at: string | null
          presets: number[]
          sleep_min: number
          updated_at: string
          user_id: string
          wake_min: number
        }
        Insert: {
          created_at?: string
          default_duration?: number
          google_hidden?: string[]
          hide_team?: boolean
          onboarded_at?: string | null
          presets?: number[]
          sleep_min?: number
          updated_at?: string
          user_id?: string
          wake_min?: number
        }
        Update: {
          created_at?: string
          default_duration?: number
          google_hidden?: string[]
          hide_team?: boolean
          onboarded_at?: string | null
          presets?: number[]
          sleep_min?: number
          updated_at?: string
          user_id?: string
          wake_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          role: string
          space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          role: string
          space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          role?: string
          space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          space_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          space_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_books: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_books_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cuaderno_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_cards: {
        Row: {
          a: string
          box: number
          created_at: string
          due: string
          id: string
          note_id: string
          q: string
          reviewed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          a: string
          box?: number
          created_at?: string
          due: string
          id?: string
          note_id: string
          q: string
          reviewed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          a?: string
          box?: number
          created_at?: string
          due?: string
          id?: string
          note_id?: string
          q?: string
          reviewed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_cards_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "cuaderno_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_days: {
        Row: {
          day: string
          remembered: number
          reviewed: number
          user_id: string
        }
        Insert: {
          day: string
          remembered?: number
          reviewed?: number
          user_id?: string
        }
        Update: {
          day?: string
          remembered?: number
          reviewed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_drawings: {
        Row: {
          created_at: string
          height: number
          id: string
          strokes: Json
          updated_at: string
          user_id: string
          width: number
        }
        Insert: {
          created_at?: string
          height: number
          id?: string
          strokes?: Json
          updated_at?: string
          user_id?: string
          width: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          strokes?: Json
          updated_at?: string
          user_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_drawings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_entries: {
        Row: {
          created_at: string
          day: string
          id: string
          proposals: Json
          say: string
          source: string
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          proposals?: Json
          say?: string
          source?: string
          status?: string
          text: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          proposals?: Json
          say?: string
          source?: string
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_links: {
        Row: {
          a_id: string
          b_id: string | null
          created_at: string
          id: string
          project_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          a_id: string
          b_id?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          reason: string
          user_id?: string
        }
        Update: {
          a_id?: string
          b_id?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_links_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "cuaderno_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_links_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "cuaderno_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_notes: {
        Row: {
          area: string
          body: string
          book_id: string | null
          created_at: string
          embedded_at: string | null
          embedding: string | null
          entry_id: string | null
          id: string
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string
          body?: string
          book_id?: string | null
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          entry_id?: string | null
          id?: string
          position?: number
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          area?: string
          body?: string
          book_id?: string | null
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          entry_id?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_notes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "cuaderno_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_notes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "cuaderno_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuaderno_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cuaderno_tokens: {
        Row: {
          created_at: string
          hint: string
          id: string
          last_used_at: string | null
          name: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hint: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash: string
          user_id?: string
        }
        Update: {
          created_at?: string
          hint?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuaderno_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          response: string
          space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          response?: string
          space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          response?: string
          space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          created_at: string
          event_id: string
          id: string
          space_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          space_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          space_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          ends_at: string
          external_id: string | null
          external_provider: string | null
          id: string
          location_or_link: string
          space_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          location_or_link?: string
          space_id: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          location_or_link?: string
          space_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          space_id: string
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          space_id: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          space_id?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_rockie: Json
          color: string
          created_at: string
          display_name: string
          id: string
          must_change_password: boolean
          timezone: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_rockie?: Json
          color?: string
          created_at?: string
          display_name: string
          id: string
          must_change_password?: boolean
          timezone?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_rockie?: Json
          color?: string
          created_at?: string
          display_name?: string
          id?: string
          must_change_password?: boolean
          timezone?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          description: string
          due_date: string | null
          id: string
          links: Json
          name: string
          space_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          links?: Json
          name: string
          space_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          links?: Json
          name?: string
          space_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          created_at: string
          id: string
          job_description: string
          role: string
          role_title: string
          space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_description?: string
          role?: string
          role_title?: string
          space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_description?: string
          role?: string
          role_title?: string
          space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          about: string
          created_at: string
          created_by: string | null
          id: string
          links: Json
          name: string
          tagline: string
          updated_at: string
        }
        Insert: {
          about?: string
          created_at?: string
          created_by?: string | null
          id?: string
          links?: Json
          name?: string
          tagline?: string
          updated_at?: string
        }
        Update: {
          about?: string
          created_at?: string
          created_by?: string | null
          id?: string
          links?: Json
          name?: string
          tagline?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area_id: string | null
          assignee_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          notes: string
          position: number
          priority: string
          project_id: string | null
          proof_image_path: string | null
          proof_url: string | null
          space_id: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validation: string | null
        }
        Insert: {
          area_id?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string
          position?: number
          priority?: string
          project_id?: string | null
          proof_image_path?: string | null
          proof_url?: string | null
          space_id: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation?: string | null
        }
        Update: {
          area_id?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string
          position?: number
          priority?: string
          project_id?: string | null
          proof_image_path?: string | null
          proof_url?: string | null
          space_id?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_log: {
        Row: {
          created_at: string
          day: string
          id: string
          mode: string
          points: number
          space_id: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          id?: string
          mode: string
          points: number
          space_id: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          id?: string
          mode?: string
          points?: number
          space_id?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_log_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agenda_agent_bump: { Args: never; Returns: number }
      agenda_seed_calendars: { Args: never; Returns: undefined }
      check_achievements: { Args: { sid: string }; Returns: string[] }
      create_invite: {
        Args: { p_space: string }
        Returns: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          space_id: string
          updated_at: string
          used_count: number
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_space: { Args: { p_name?: string }; Returns: string }
      cuaderno_set_embedding: {
        Args: { emb: string; note: string }
        Returns: undefined
      }
      cuaderno_similar: {
        Args: { exclude?: string[]; k?: number; q: string }
        Returns: {
          area: string
          id: string
          score: number
          snippet: string
          title: string
        }[]
      }
      cuaderno_similar_for: {
        Args: { k?: number; p_user: string; q: string }
        Returns: {
          area: string
          id: string
          score: number
          snippet: string
          title: string
        }[]
      }
      cuaderno_token_user: { Args: { p_hash: string }; Returns: string }
      demo_fill: { Args: { p_space: string }; Returns: undefined }
      gen_code: { Args: { n?: number }; Returns: string }
      hq_norm: { Args: { x: string }; Returns: string }
      import_v2: { Args: { p: Json; p_space: string }; Returns: Json }
      invite_info: { Args: { p_code: string }; Returns: Json }
      is_member: { Args: { sid: string }; Returns: boolean }
      is_member_text: { Args: { sid: string }; Returns: boolean }
      is_owner: { Args: { sid: string }; Returns: boolean }
      join_space: { Args: { p_code: string }; Returns: string }
      shares_space: { Args: { uid: string }; Returns: boolean }
      team_streak: { Args: { sid: string }; Returns: number }
      user_today: { Args: { uid?: string }; Returns: string }
      username_available: { Args: { p_username: string }; Returns: boolean }
      validate_task: {
        Args: {
          p_mode: string
          p_proof_path?: string
          p_proof_url?: string
          p_task: string
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
