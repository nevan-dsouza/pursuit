export interface Goal {
  id: string
  title: string
  startDate: string // YYYY-MM-DD
  deadline: string // YYYY-MM-DD
  createdAt: number
  /** shared with a onetask partner: the item's id on the shared branch, and the newest save seen */
  shareId?: string
  shareSeen?: string
  /** the shared plan that belongs to this goal: its tasks travel as a checklist at the top, the rest is free text */
  planId?: string
  planSeen?: string
  planTitle?: string
  planText?: string
}

export interface Milestone {
  id: string
  goalId: string
  date: string
  title: string
  done: boolean
  createdAt: number
}

/** A log entry on a day of a goal's grid. Written manually, or automatically from a task's Notes. */
export interface Log {
  id: string
  goalId: string
  date: string
  text: string
  taskId: string | null
  /** longer notes saved with a task; shown with the day, but not counted as a log */
  note?: boolean
  by?: string // who wrote it (spaces, or a sharing partner)
  /** a partner's entry from the shared branch: read-only, refreshed on every pull */
  ext?: boolean
  /** shared goals: the entry's time on the shared branch, plus onetask's hours and progress */
  otAt?: string
  hours?: number
  progress?: number
  createdAt: number
}

export interface Task {
  id: string
  goalId: string
  milestoneId: string | null
  parentId: string | null // the task whose POA created this one
  title: string
  crucial: boolean
  important: boolean
  order: number
  status: 'open' | 'done'
  inProgress?: boolean
  notesDraft: string
  poaDraft: string
  timeMs: number
  createdAt: number
  completedAt: number | null
  doneBy?: string // who finished it (spaces only)
}

/** Timer for the task currently shown on Home. */
export interface Timer {
  taskId: string
  start: number | null // null = paused
  accMs: number
}

/** What the user changed about today's list. The list itself is computed (see todayList). */
export interface TodayState {
  date: string
  extra: string[] // tasks pulled in by hand
  skipped: string[] // tasks marked "not today"
  order: string[] | null // manual order after dragging; null = automatic
}

/** One stopped timer session, dated so stats can show focus time per day. */
export interface Session {
  id?: string
  by?: string // who (spaces only)
  date: string
  ms: number
  goalId: string
}

export interface Settings {
  googleClientId: string
}

export interface State {
  goals: Goal[]
  milestones: Milestone[]
  logs: Log[]
  tasks: Task[]
  timer: Timer | null
  selectedGoalId: string | null
  focusId: string | null
  today: TodayState
  sessions: Session[]
  /** days on which you did something in Pursuit; kept even if the goal or task is later deleted */
  activeDates: string[]
  tutorialSeen: boolean
  settings: Settings
}

export type View = 'shared' | 'home' | 'goals' | 'meetings' | 'spaces' | 'stats' | 'settings'
