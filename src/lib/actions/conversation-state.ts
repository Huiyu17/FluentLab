export type StartConversationState = { status: "idle" } | { status: "error"; message: string };

export const IDLE_START_STATE: StartConversationState = { status: "idle" };
